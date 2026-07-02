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
    """Show only the last few chars of a secret — never the prefix or length."""
    if not value:
        return "(not set)"
    if len(value) <= visible:
        return "*" * len(value)
    return f"***{value[-visible:]}"


@llm_app.command("test")
def llm_test(
    prompt: str = typer.Option(
        "Reply with exactly the two letters: OK",
        "--prompt",
        "-p",
        help="Prompt to send for the connection test.",
    ),
    model: str = typer.Option(
        "",
        "--model",
        "-m",
        help="Override OVK_AI_MODEL for this test (e.g. o3-mini, gpt-5).",
    ),
) -> None:
    """Smoke-test the AI provider: send a tiny prompt and stream the reply.

    Verifies OPENAI_BASE_URL / OPENAI_API_KEY / OVK_AI_MODEL are correct and
    the endpoint responds. Reads config from env / .env (auto-loaded).
    """
    from .ai import config as ai_config

    model_id = model or ai_config.OVK_AI_MODEL

    typer.secho("─ AI connection test ─", fg=typer.colors.CYAN, bold=True)
    typer.echo(f"  OPENAI_BASE_URL      : {ai_config.OPENAI_BASE_URL}")
    typer.echo(f"  OVK_AI_MODEL         : {model_id}" + (" (overridden)" if model else ""))
    typer.echo(f"  OVK_AI_REASONING     : {ai_config.OVK_AI_REASONING_EFFORT or '(off)'}")
    typer.echo(f"  OPENAI_API_KEY       : {_mask(ai_config.OPENAI_API_KEY)}")

    if not ai_config.OPENAI_API_KEY:
        typer.secho(
            "\n✗ OPENAI_API_KEY is not set. Add it to .env (see .env.example).",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1)

    typer.echo(f"\n  prompt: {prompt!r}")

    try:
        from langchain_core.messages import HumanMessage

        from .ai.llm import build_model
        from .ai.server import _extract_text_and_thinking

        model_obj = build_model(model=model_id, streaming=True, timeout=60)
        start = time.perf_counter()
        chunks = 0
        text = ""
        thinking = ""
        thinking_started = False
        reply_started = False
        for chunk in model_obj.stream([HumanMessage(content=prompt)]):
            piece_text, piece_thinking = _extract_text_and_thinking(chunk)
            if piece_thinking:
                if not thinking_started:
                    typer.secho(
                        "  thinking ▸ ",
                        fg=typer.colors.MAGENTA,
                        bold=True,
                        nl=False,
                    )
                    thinking_started = True
                typer.secho(piece_thinking, dim=True, nl=False)
                thinking += piece_thinking
            if piece_text:
                if not reply_started:
                    if thinking_started:
                        typer.echo()  # newline after thinking line
                    typer.echo("  reply   : ", nl=False)
                    reply_started = True
                typer.echo(piece_text, nl=False)
                text += piece_text
            chunks += 1
        if thinking_started or reply_started:
            typer.echo()  # final newline after streamed content
        elapsed = time.perf_counter() - start
        if not text.strip():
            typer.secho("(empty reply)", fg=typer.colors.YELLOW)
            raise typer.Exit(code=1)
        summary = (
            f"\n✓ OK — {len(text)} chars in {elapsed:.2f}s ({chunks} chunk(s))"
        )
        if thinking:
            summary += f", {len(thinking)} thinking chars"
        typer.secho(summary + ".", fg=typer.colors.GREEN, bold=True)
    except typer.Exit:
        raise
    except ImportError as e:
        typer.echo()  # finish the reply line
        typer.secho(
            f"\n✗ Missing dependency: {e}. Run `uv sync` to install the AI deps.",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1) from e
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
