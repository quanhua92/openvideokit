"""Run OpenVideoKit as a script: `python -m openvideokit`."""

from __future__ import annotations

from .config import PORT


def main() -> None:
    import uvicorn
    uvicorn.run("openvideokit.app:app", host="0.0.0.0", port=PORT, reload=False)


if __name__ == "__main__":
    main()
