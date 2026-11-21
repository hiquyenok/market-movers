#!/usr/bin/env python3
"""
Builds a single self-contained HTML file (`market-movers.html`) and static
GitHub Pages bundle (`docs/index.html` + `docs/data.json`) with the latest
live market data for all 126 assets embedded inside.

Usage:
    .venv/bin/python build_html.py
"""
from __future__ import annotations

import json
import os
import urllib.request

from server import PUBLIC, ROOT, build_snapshot


def fetch_snapshot() -> dict:
    # Try local running server first for speed if available, else pull directly
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/movers", timeout=3) as resp:
            snap = json.load(resp)
            if snap.get("source") == "yahoo" and len(snap.get("assets", [])) >= 100:
                return snap
    except Exception:
        pass
    return build_snapshot()


def build() -> None:
    snap = fetch_snapshot()
    raw_json = json.dumps(snap, separators=(",", ":"))

    with open(os.path.join(PUBLIC, "index.html"), encoding="utf-8") as f:
        html = f.read()
    with open(os.path.join(PUBLIC, "styles.css"), encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(PUBLIC, "app.js"), encoding="utf-8") as f:
        js = f.read()

    # Inline CSS, embedded data, and JS into a single standalone HTML file
    standalone = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f'<style id="app-css">\n{css}\n</style>',
    ).replace(
        '<script src="app.js"></script>',
        (
            f'<script id="embedded-data">window.__EMBEDDED_DATA__ = {raw_json};</script>\n'
            f'<script id="app-js">\n{js}\n</script>'
        ),
    )

    out_html = os.path.join(ROOT, "market-movers.html")
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(standalone)

    public_data = os.path.join(PUBLIC, "data.json")
    with open(public_data, "w", encoding="utf-8") as f:
        f.write(raw_json)

    docs_dir = os.path.join(ROOT, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(standalone)
    with open(os.path.join(docs_dir, "data.json"), "w", encoding="utf-8") as f:
        f.write(raw_json)
    with open(os.path.join(docs_dir, ".nojekyll"), "w", encoding="utf-8") as f:
        f.write("")

    size_kb = os.path.getsize(out_html) / 1024
    print(
        f"Built standalone HTML: {out_html} ({size_kb:.0f} KB, "
        f"source={snap.get('source')}, assets={len(snap.get('assets', []))})"
    )


if __name__ == "__main__":
    build()
