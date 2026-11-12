FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim
RUN useradd --system --create-home pantheon && mkdir /data && chown pantheon /data
COPY --from=build /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH PANTHEON_DATA_DIR=/data
USER pantheon
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "pantheon.main:app", "--host", "0.0.0.0", "--port", "8000"]
