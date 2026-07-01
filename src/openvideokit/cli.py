"""`ovk` command-line entry (Typer).

ovk serve          run the API server on :8000
ovk version
ovk --help
"""

from __future__ import annotations

import typer
import uvicorn

from . import __version__, config

app = typer.Typer(
    name="ovk",
    help="OpenVideoKit — serve the editor + stamped HF compositions.",
    add_completion=False,
    no_args_is_help=True,
)


@app.command()
def serve(
    host: str = typer.Option(config.HOST, "--host", "-h", help="Bind address."),
    port: int = typer.Option(config.PORT, "--port", "-p", help="Bind port."),
    reload: bool = typer.Option(False, "--reload", help="Auto-reload on file changes."),
) -> None:
    """Run the FastAPI server (default :8000)."""
    typer.echo(f"ovk serve → http://{host}:{port}")
    uvicorn.run("openvideokit.app:app", host=host, port=port, reload=reload)


@app.command()
def version() -> None:
    """Print the installed version and exit."""
    typer.echo(__version__)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
