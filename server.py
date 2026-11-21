#!/usr/bin/env python3
"""
Market Movers — zero-dependency backend (Python 3.8+ standard library only).

* Serves the static frontend from ./public
* GET /api/movers            -> JSON snapshot of every tracked asset with
                                 1D / 1W / 1M / 1Y % change, traded volume and
                                 a ~1-year daily close series.
* GET /api/movers?refresh=1  -> force a fresh pull (debounced to once / 20 s)

Data source: Yahoo Finance public chart endpoint (no API key needed).
If the live feed is unreachable, a clearly-labelled synthetic demo dataset is
returned so the UI keeps working.

Run:  python3 server.py [port]      (default port 8787)
"""
from __future__ import annotations

import bisect
import gzip
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from universe import CATEGORY_META, UNIVERSE

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
CACHE_TTL = int(os.environ.get("CACHE_TTL", 300))   # seconds between auto refreshes
MAX_WORKERS = int(os.environ.get("WORKERS", 8))

DAY = 86400
TIMEFRAMES = {"1W": 7, "1M": 30, "1Y": 365}
SERIES_DAYS = 372  # history shipped to the browser for charts

YAHOO = "https://{host}.finance.yahoo.com/v8/finance/chart/{sym}?range=2y&interval=1d&includePrePost=false"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Accept": "application/json,text/plain,*/*",
}


# --------------------------------------------------------------------------- #
# HTTP transport
#
# Yahoo rejects (HTTP 429) clients whose TLS fingerprint doesn't look like a
# browser — which includes Python's urllib and plain curl. If the optional
# `curl_cffi` package is installed we use it to impersonate Chrome; otherwise
# we fall back to urllib (which may be blocked).
# --------------------------------------------------------------------------- #
try:
    from curl_cffi import requests as cffi_requests  # type: ignore
except ImportError:  # pragma: no cover
    cffi_requests = None

_local = threading.local()


class NetworkError(Exception):
    """Could not reach the remote host at all (offline, DNS, TLS...)."""


class HTTPStatusError(Exception):
    def __init__(self, code: int):
        super().__init__(f"HTTP {code}")
        self.code = code


def http_get_json(url: str) -> dict:
    if cffi_requests is not None:
        session = getattr(_local, "session", None)
        if session is None:
            session = _local.session = cffi_requests.Session(impersonate="chrome")
        try:
            resp = session.get(url, timeout=15)
        except Exception as e:  # noqa: BLE001
            raise NetworkError(str(e)) from e
        if resp.status_code != 200:
            raise HTTPStatusError(resp.status_code)
        return resp.json()

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        raise HTTPStatusError(e.code) from e
    except urllib.error.URLError as e:
        raise NetworkError(str(e.reason)) from e


# --------------------------------------------------------------------------- #
# Live data
# --------------------------------------------------------------------------- #
def fetch_chart(sym: str) -> dict:
    """Download ~2 years of daily bars for one symbol from Yahoo Finance."""
    last_err = None
    for attempt, host in enumerate(("query1", "query2", "query1")):
        url = YAHOO.format(host=host, sym=urllib.parse.quote(sym, safe=""))
        try:
            chart = http_get_json(url).get("chart") or {}
            if not chart.get("result"):
                raise ValueError(f"no data ({chart.get('error')})")
            return chart["result"][0]
        except HTTPStatusError as e:
            last_err = e
            if e.code in (400, 404):          # unknown symbol – don't retry
                break
            time.sleep(0.7 * (attempt + 1))   # 429 / 5xx – back off
        except NetworkError:
            raise                              # network down – bubble up fast
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.3)
    if isinstance(last_err, HTTPStatusError):
        raise last_err
    raise RuntimeError(str(last_err))


def _pct(now: float, ref: float | None):
    if not ref:
        return None
    return round((now / ref - 1.0) * 100.0, 4)


def _sig(x: float) -> float:
    return float(f"{x:.6g}")


def build_asset(cat: str, sym: str, name: str, res: dict) -> dict:
    """Turn a raw Yahoo chart result into the compact structure the UI uses."""
    meta = res.get("meta") or {}
    ts = res.get("timestamp") or []
    quote = ((res.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    vols = quote.get("volume") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    if len(vols) != len(ts):
        vols = [0] * len(ts)

    rows = [(int(t), float(c), int(v or 0))
            for t, c, v in zip(ts, closes, vols) if c is not None]
    if len(rows) < 2:
        raise ValueError("not enough history")

    offset = int(meta.get("gmtoffset") or 0)
    price = float(meta.get("regularMarketPrice") or rows[-1][1])
    mtime = int(meta.get("regularMarketTime") or rows[-1][0])
    live_vol = int(meta.get("regularMarketVolume") or 0)

    # Make sure the latest bar reflects the live price.
    if (rows[-1][0] + offset) // DAY == (mtime + offset) // DAY:
        t, _, v = rows[-1]
        rows[-1] = (t, price, max(v, live_vol))
    elif mtime > rows[-1][0]:
        rows.append((mtime, price, live_vol))

    times = [r[0] for r in rows]
    changes = {"1D": _pct(price, rows[-2][1])}
    volumes = {"1D": rows[-1][2]}
    for tf, days in TIMEFRAMES.items():
        i = bisect.bisect_right(times, mtime - days * DAY) - 1
        if i < 0:
            changes[tf] = None
            volumes[tf] = sum(r[2] for r in rows)
        else:
            changes[tf] = _pct(price, rows[i][1])
            volumes[tf] = sum(r[2] for r in rows[i + 1:])

    day_low = meta.get("regularMarketDayLow")
    day_high = meta.get("regularMarketDayHigh")
    if day_low is None and lows and lows[-1] is not None:
        day_low = lows[-1]
    if day_high is None and highs and highs[-1] is not None:
        day_high = highs[-1]

    start = bisect.bisect_left(times, mtime - SERIES_DAYS * DAY)
    year = [r[1] for r in rows if r[0] >= mtime - 365 * DAY]

    return {
        "symbol": sym,
        "name": name,
        "category": cat,
        "currency": meta.get("currency") or "",
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "",
        "price": _sig(price),
        "marketTime": mtime,
        "dayLow": _sig(day_low) if day_low else None,
        "dayHigh": _sig(day_high) if day_high else None,
        "yearLow": _sig(min(year)) if year else None,
        "yearHigh": _sig(max(year)) if year else None,
        "changes": changes,
        "volumes": volumes,
        "series": {"t": times[start:], "c": [_sig(r[1]) for r in rows[start:]]},
    }


# --------------------------------------------------------------------------- #
# Demo fallback (used only when Yahoo is unreachable)
# --------------------------------------------------------------------------- #
DEMO_PROFILE = {  # (log10 price range, daily volatility, log10 volume range, trades weekends)
    "crypto": ((-4.5, 4.9), 0.040, (8, 10.5), True),
    "stocks": ((1.3, 3.0), 0.022, (6.5, 8.2), False),
    "indices": ((3.0, 4.6), 0.011, (8, 9.5), False),
    "metals": ((0.5, 3.5), 0.016, (4, 5.5), False),
    "energy": ((0.3, 2.0), 0.023, (4.5, 5.8), False),
    "agriculture": ((1.0, 3.8), 0.018, (3.5, 5.2), False),
    "futures": ((0.0, 4.5), 0.009, (5, 6.3), False),
    "forex": ((-0.3, 4.4), 0.005, (0, 0), False),
}


def build_demo(jobs) -> list[dict]:
    now = int(time.time())
    today = now - now % DAY
    out = []
    for cat, sym, name in jobs:
        rng = random.Random(f"{sym}-{today // DAY}")
        (plo, phi), vol, (vlo, vhi), weekends = DEMO_PROFILE.get(cat, DEMO_PROFILE["stocks"])
        price = 10 ** rng.uniform(plo, phi)
        drift = rng.gauss(0, vol / 6)
        base_vol = 10 ** rng.uniform(vlo, vhi) if vhi else 0
        bars = []
        for d in range(730, -1, -1):
            t = today - d * DAY + 14 * 3600
            if not weekends and time.gmtime(t).tm_wday >= 5:
                continue
            price *= max(0.5, 1 + drift + rng.gauss(0, vol))
            bars.append({"t": t, "c": price, "v": int(base_vol * rng.uniform(0.4, 1.8))})
        res = {
            "meta": {"currency": "USD", "exchangeName": "DEMO", "regularMarketPrice": bars[-1]["c"],
                     "regularMarketTime": bars[-1]["t"],
                     "regularMarketDayLow": bars[-1]["c"] * (1 - rng.uniform(0, vol)),
                     "regularMarketDayHigh": bars[-1]["c"] * (1 + rng.uniform(0, vol))},
            "timestamp": [b["t"] for b in bars],
            "indicators": {"quote": [{"close": [b["c"] for b in bars],
                                      "volume": [b["v"] for b in bars]}]},
        }
        out.append(build_asset(cat, sym, name, res))
    return out


# --------------------------------------------------------------------------- #
# Snapshot store
# --------------------------------------------------------------------------- #
def build_snapshot() -> dict:
    jobs = [(cat, sym, name) for cat, items in UNIVERSE.items() for sym, name in items]
    started = time.time()
    assets, errors, source = [], [], "yahoo"

    try:  # quick connectivity probe so offline / blocked mode falls back fast
        fetch_chart(jobs[0][1])
        online = True
    except NetworkError as e:
        online = False
        errors.append(f"network: {e}")
    except HTTPStatusError as e:
        online = e.code != 429
        if not online:
            hint = "" if cffi_requests else " — run ./start.sh (installs curl_cffi) to fix"
            errors.append(f"Yahoo blocked the request (HTTP 429){hint}")
    except Exception:  # noqa: BLE001  (symbol-level failure is fine)
        online = True

    if online:
        def work(job):
            cat, sym, name = job
            try:
                return build_asset(cat, sym, name, fetch_chart(sym)), None
            except Exception as e:  # noqa: BLE001
                return None, f"{sym}: {e}"

        with ThreadPoolExecutor(MAX_WORKERS) as pool:
            for asset, err in pool.map(work, jobs):
                if asset:
                    assets.append(asset)
                else:
                    errors.append(err)

    if not assets:
        assets, source = build_demo(jobs), "demo"

    print(f"[snapshot] source={source} assets={len(assets)}/{len(jobs)} "
          f"errors={len(errors)} in {time.time() - started:.1f}s", flush=True)
    for e in errors[:10]:
        print(f"           ! {e}", flush=True)

    return {
        "generatedAt": int(time.time()),
        "source": source,
        "total": len(jobs),
        "categories": CATEGORY_META,
        "assets": assets,
        "errors": errors[:60],
    }


class Store:
    def __init__(self):
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.at = 0.0
        self.raw = b""
        self.gz = b""

    def refresh(self, force: bool = False):
        with self.lock:
            if force and time.time() - self.at < 20:   # debounce manual refreshes
                return
            try:
                snap = build_snapshot()
            except Exception as e:  # noqa: BLE001
                print(f"[snapshot] failed: {e}", flush=True)
                if self.raw:
                    return
                snap = {"generatedAt": int(time.time()), "source": "error", "total": 0,
                        "categories": CATEGORY_META, "assets": [], "errors": [str(e)]}
            self.raw = json.dumps(snap, separators=(",", ":")).encode()
            self.gz = gzip.compress(self.raw, 6)
            self.at = time.time()
            self.ready.set()

    def loop(self):
        while True:
            self.refresh()
            time.sleep(CACHE_TTL)

    def get(self, force: bool = False):
        if force:
            self.refresh(force=True)
        self.ready.wait(timeout=180)
        return self.raw, self.gz


STORE = Store()


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/movers":
            force = urllib.parse.parse_qs(parsed.query).get("refresh", ["0"])[0] == "1"
            raw, gz = STORE.get(force)
            use_gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and gz
            body = gz if use_gz else raw
            self.send_response(200 if raw else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            if use_gz:
                self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/api/health":
            body = json.dumps({"ok": True, "cachedAt": STORE.at}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            sys.stderr.write("[http] " + (fmt % args) + "\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8787))
    threading.Thread(target=STORE.loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Market Movers running  ->  http://localhost:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
