"""The Pantheon API."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from .config import Settings
from .integrations import INTEGRATIONS, collect
from .poller import Poller
from .schema import PriceIn, Range, Snapshot
from .snapshot import snapshot
from .state import TOGGLES, Hub, Prefs, Simulator, World

#: Toggle groups a browser may flip directly. "accepted" goes through the accept action instead.
PUBLIC_TOGGLES = tuple(g for g in TOGGLES if g != "accepted")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if settings.data_dir:
        settings.data_dir.mkdir(parents=True, exist_ok=True)

    hub = Hub()
    world = World()
    prefs = Prefs(settings.data_dir / "pantheon.sqlite3" if settings.data_dir else None)
    simulator = Simulator(world, hub.publish)
    poller = Poller([i for i in INTEGRATIONS if i.id not in settings.mock_ids], settings.sources, hub.publish, paused=lambda id: bool(prefs.group("off").get(id)))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        poller.start()
        yield
        poller.stop()
        simulator.shutdown()

    app = FastAPI(title="Pantheon", version="0.1.0", lifespan=lifespan)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/snapshot", response_model=Snapshot)
    def get_snapshot(range: Range = "24 h"):
        """Everything the UI shows. Fetch it again whenever /api/events reports a change."""
        data = collect(world, set(settings.mock_ids), poller.data)
        return snapshot(data, set(settings.mock_ids), world, prefs, range, hub.version, poller)

    @app.get("/api/events")
    async def events(request: Request) -> StreamingResponse:
        """Server-sent events: one message, carrying the new version number, per change."""

        async def body():
            async for chunk in hub.stream():
                if await request.is_disconnected():
                    break
                yield chunk

        return StreamingResponse(body(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/actions/{key}", status_code=204)
    async def run_action(key: str) -> Response:
        """Run an action offered by the snapshot (a section's or an object's action key).

        Actions are simulated against the mock lab for now; none reaches real infrastructure.
        Like every endpoint that changes state, it runs on the event loop: timed actions start
        tasks there, and listeners are notified from there.
        """
        if key.startswith("accept:"):
            prefs.set("accepted", {**prefs.group("accepted"), key.removeprefix("accept:"): True})
            hub.publish()
        elif not settings.mock_ids:
            raise HTTPException(409, "Actions only exist for mock integrations so far.")
        elif not simulator.run(key):
            raise HTTPException(404, f"Unknown action: {key}")
        return Response(status_code=204)

    @app.post("/api/sources/{id}/sync", status_code=204)
    async def sync_source(id: str) -> Response:
        """Poll one live source now. How it went shows up in the snapshot's sources."""
        if id not in {i.id for i in INTEGRATIONS}:
            raise HTTPException(404, f"Unknown source: {id}")
        if not poller.can_poll(id):
            raise HTTPException(409, "This source is mock, not configured, or has no live client.")
        await poller.refresh(id)
        return Response(status_code=204)

    @app.post("/api/toggles/{group}/{key}", status_code=204)
    async def toggle(group: str, key: str) -> Response:
        """Flip one of Pantheon's own flags: acked, silenced, off (pause a source), sched, notif."""
        if group not in PUBLIC_TOGGLES:
            raise HTTPException(404, f"Unknown toggle group: {group}")
        prefs.toggle(group, key)
        hub.publish()
        return Response(status_code=204)

    @app.put("/api/settings/price", status_code=204)
    async def set_price(body: PriceIn) -> Response:
        """Electricity tariff in €/kWh, as typed."""
        prefs.set("price", body.value)
        hub.publish()
        return Response(status_code=204)

    return app


app = create_app()
