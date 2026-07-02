"""`ovk` command-line entry (Typer).

ovk serve             run the API server on :8000
ovk llm test          smoke-test the AI provider connection
ovk llm free          list free models on OpenRouter (no key needed)
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
        from openai import OpenAI

        from .ai.llm import _is_openrouter

        client = OpenAI(
            api_key=ai_config.OPENAI_API_KEY,
            base_url=ai_config.OPENAI_BASE_URL,
            timeout=60,
        )
        extra_body: dict | None = None
        if _is_openrouter(ai_config.OPENAI_BASE_URL) and ai_config.OVK_AI_REASONING_EFFORT:
            extra_body = {
                "reasoning": {
                    "enabled": True,
                    "effort": ai_config.OVK_AI_REASONING_EFFORT,
                }
            }

        start = time.perf_counter()
        chunks = 0
        text = ""
        thinking = ""
        thinking_started = False
        reply_started = False

        stream = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            temperature=ai_config.OVK_AI_TEMPERATURE,
            extra_body=extra_body,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            piece_text = delta.content or ""
            piece_thinking = getattr(delta, "reasoning", None) or ""
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
                        typer.echo()
                    typer.echo("  reply   : ", nl=False)
                    reply_started = True
                typer.echo(piece_text, nl=False)
                text += piece_text
            chunks += 1
        if thinking_started or reply_started:
            typer.echo()
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


@llm_app.command("free")
def llm_free(
    limit: int = typer.Option(
        20,
        "--limit",
        "-n",
        help="Max models to show.",
    ),
    all_models: bool = typer.Option(
        False,
        "--all",
        "-a",
        help="Include non-text-output models (image, audio, video gen).",
    ),
) -> None:
    """List currently free models on OpenRouter (no API key needed).

    Fetches the live model catalog, filters for $0 prompt + $0 completion,
    and fetches per-model endpoint stats (uptime, latency, throughput) in
    parallel. Useful for finding a model id to pass to
    ``ovk llm test --model <id>`` or to set as OVK_AI_MODEL.
    """
    import json
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from rich.console import Console
    from rich.table import Table

    typer.secho("─ OpenRouter free models ─", fg=typer.colors.CYAN, bold=True)
    typer.echo("  fetching model catalog + endpoint stats...\r", nl=False)

    url = "https://openrouter.ai/api/v1/models"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ovk/cli"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            catalog = json.loads(resp.read())
    except Exception as e:
        typer.secho(f"\n✗ Failed to fetch: {e}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from e

    free: list[dict] = []
    for m in catalog.get("data", []):
        p = m.get("pricing", {})
        if p.get("prompt") != "0" or p.get("completion") != "0":
            continue
        arch = m.get("architecture", {})
        output = arch.get("output_modalities", [])
        if not all_models and "text" not in output:
            continue
        free.append(m)

    if not free:
        typer.echo("No free models found.")
        return

    # Fetch endpoint stats (uptime; latency/throughput when available) per model.
    def _fetch_stats(model_id: str) -> dict:
        ep_url = f"https://openrouter.ai/api/v1/models/{model_id}/endpoints"
        try:
            req2 = urllib.request.Request(
                ep_url, headers={"User-Agent": "ovk/cli"}
            )
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                data = json.loads(resp2.read())
            endpoints = data.get("data", {}).get("endpoints", [])
            # Best endpoint: online (status >= 0) with highest throughput
            best_lat = None
            best_thr = None
            best_upt = None
            for ep in endpoints:
                if ep.get("status", -1) < 0:
                    continue
                lat = ep.get("latency_last_30m")
                thr = ep.get("throughput_last_30m")
                upt = ep.get("uptime_last_30m")
                if lat and (best_lat is None or lat < best_lat):
                    best_lat = lat
                if thr and (best_thr is None or thr > best_thr):
                    best_thr = thr
                if upt and (best_upt is None or upt > best_upt):
                    best_upt = upt
            return {
                "latency": best_lat,
                "throughput": best_thr,
                "uptime": best_upt,
            }
        except Exception:
            return {"latency": None, "throughput": None, "uptime": None}

    stats_map: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_stats, m["id"]): m["id"] for m in free
        }
        for fut in as_completed(futures):
            mid = futures[fut]
            stats_map[mid] = fut.result()

    typer.echo(" " * 60 + "\r", nl=False)

    def _ctx(n: int | None) -> str:
        if not n:
            return "?"
        if n >= 1_000_000:
            return f"{n // 1_000_000}M"
        if n >= 1000:
            return f"{n // 1000}K"
        return str(n)

    def _reasoning(m: dict) -> str:
        r = m.get("reasoning") or {}
        if r.get("mandatory"):
            return "mand"
        if r.get("default_enabled"):
            return "yes"
        if "reasoning" in (m.get("supported_parameters") or []):
            return "opt"
        return "—"

    def _tools(m: dict) -> str:
        return "yes" if "tools" in (m.get("supported_parameters") or []) else "—"

    def _lat(stat: dict) -> str:
        v = stat.get("latency")
        return f"{v:.0f}ms" if v else "—"

    def _thr(stat: dict) -> str:
        v = stat.get("throughput")
        return f"{v:.0f}" if v else "—"

    def _upt(stat: dict) -> str:
        v = stat.get("uptime")
        return f"{v:.0f}%" if v else "—"

    def _notes(m: dict) -> str:
        parts: list[str] = []
        arch = m.get("architecture", {})
        mod = arch.get("modality", "")
        if "image" in mod:
            parts.append("vision")
        if "audio" in mod:
            parts.append("audio")
        if "video" in mod:
            parts.append("video")
        if m.get("expiration_date"):
            parts.append(f"exp {m['expiration_date'][:10]}")
        return ", ".join(parts) if parts else ""

    table = Table(show_header=True, header_style="bold cyan", show_lines=False)
    table.add_column("#", style="dim", width=3)
    table.add_column("Model ID", style="white", no_wrap=False, overflow="fold")
    table.add_column("Ctx", justify="right", width=6)
    table.add_column("Think", justify="center", width=5)
    table.add_column("Tools", justify="center", width=5)
    table.add_column("Up%", justify="right", width=5)
    table.add_column("Notes", style="dim")

    shown = free[:limit] if not all_models else free
    for i, m in enumerate(shown, 1):
        stat = stats_map.get(m["id"], {})
        ctx = _ctx(
            m.get("context_length")
            or m.get("top_provider", {}).get("context_length")
        )
        table.add_row(
            str(i),
            m["id"],
            ctx,
            _reasoning(m),
            _tools(m),
            _upt(stat),
            _notes(m),
        )

    console = Console()
    console.print(table)
    total = len(free)
    typer.echo(
        f"\n  {total} free model(s)"
        + (f", showing {len(shown)}." if len(shown) < total else ".")
    )
    typer.echo(
        "  Latency/throughput not exposed by the public API — see live stats:"
    )
    typer.echo(
        "  https://openrouter.ai/models?max_price=0.0&order=top-weekly"
    )
    typer.echo(
        '  Test one: ovk llm test -m <model-id> -p "Why is the sky blue?"'
    )


app.add_typer(llm_app, name="llm")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
