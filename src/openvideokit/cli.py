"""`ovk` command-line entry (Typer).

ovk serve          run the API server on :8000
ovk llm test       smoke-test the AI provider connection
ovk version
ovk --help
"""

from __future__ import annotations

import time

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


# ── ovk llm … ────────────────────────────────────────────────────────────

llm_app = typer.Typer(
    name="llm",
    help="AI provider diagnostics.",
    no_args_is_help=True,
)


def _mask(value: str, visible: int = 4) -> str:
    if not value:
        return "(not set)"
    if len(value) <= visible:
        return "*" * len(value)
    return f"{value[:visible]}…{value[-2:]} ({len(value)} chars)"


@llm_app.command("test")
def llm_test(
    prompt: str = typer.Option(
        "Reply with exactly the two letters: OK",
        "--prompt",
        "-p",
        help="Prompt to send for the connection test.",
    ),
) -> None:
    """Smoke-test the AI provider: send a tiny prompt and stream the reply.

    Verifies OPENAI_BASE_URL / OPENAI_API_KEY / OVK_AI_MODEL are correct and
    the endpoint responds. Reads config from env / .env (auto-loaded).
    """
    from .ai import config as ai_config

    typer.secho("─ AI connection test ─", fg=typer.colors.CYAN, bold=True)
    typer.echo(f"  OPENAI_BASE_URL : {ai_config.OPENAI_BASE_URL}")
    typer.echo(f"  OVK_AI_MODEL    : {ai_config.OVK_AI_MODEL}")
    typer.echo(f"  OPENAI_API_KEY  : {_mask(ai_config.OPENAI_API_KEY)}")

    if not ai_config.OPENAI_API_KEY:
        typer.secho(
            "\n✗ OPENAI_API_KEY is not set. Add it to .env (see .env.example).",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1)

    typer.echo(f"\n  prompt: {prompt!r}")
    typer.echo("  reply : ", nl=False)

    try:
        from langchain_core.messages import HumanMessage

        from .ai.llm import build_model

        model = build_model(streaming=True)
        start = time.perf_counter()
        chunks = 0
        text = ""
        for chunk in model.stream([HumanMessage(content=prompt)]):
            piece = getattr(chunk, "content", "") or ""
            if isinstance(piece, list):  # content-block payloads
                piece = "".join(b.get("text", "") for b in piece if isinstance(b, dict))
            if piece:
                typer.echo(piece, nl=False)
                text += piece
                chunks += 1
        elapsed = time.perf_counter() - start
        if not text.strip():
            typer.secho("(empty reply)", fg=typer.colors.YELLOW)
            raise typer.Exit(code=1)
        typer.echo()  # newline after streamed reply
        typer.secho(
            f"\n✓ OK — {len(text)} chars in {elapsed:.2f}s ({chunks} chunk(s)).",
            fg=typer.colors.GREEN,
            bold=True,
        )
    except typer.Exit:
        raise
    except Exception as e:  # noqa: BLE001 — surface any failure clearly
        typer.echo()  # finish the reply line
        typer.secho(f"\n✗ {type(e).__name__}: {e}", fg=typer.colors.RED, err=True)
        typer.secho(
            "  Check OPENAI_BASE_URL / OPENAI_API_KEY / OVK_AI_MODEL in .env.",
            fg=typer.colors.YELLOW,
            err=True,
        )
        raise typer.Exit(code=1) from e


app.add_typer(llm_app, name="llm")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
