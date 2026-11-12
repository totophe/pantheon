"""Pantheon server."""


def main() -> None:
    import uvicorn

    uvicorn.run("pantheon.main:app", host="0.0.0.0", port=8000)
