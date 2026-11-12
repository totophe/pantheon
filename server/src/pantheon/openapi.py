"""Write the OpenAPI schema: ``uv run python -m pantheon.openapi > openapi.json``.

The frontend generates its TypeScript types from that file (``npm run api:types`` in web/).
"""

import json
import sys

from .main import app

if __name__ == "__main__":
    json.dump(app.openapi(), sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
