# Market Movers

A dashboard that shows the **top 5 most sold-off assets** (plus top gainers and most traded) for the
**day, week, month and year**, covering:

Crypto · Stocks · Indices · Metals · Energy · Agriculture · Futures · Forex (126 assets)

## Run

```bash
./start.sh          # creates .venv, installs curl_cffi, starts http://localhost:8787
./start.sh 9000     # custom port
```

## Features

- **Most Sold**: largest % price drop over the period. **Top Gainers**: largest rise. **Most Traded**: total volume.
- Timeframes: Day, Week (7 days), Month (30 days), Year (365 days), or **All**, which shows all four side by side.
- Filter by asset class, see market breadth and the biggest movers, and get sparklines (a day-range bar for 1D).
- Click any asset to open an interactive chart (1W to 1Y) with stats for every period.
- The server caches data and refreshes it every 5 minutes. The page auto-refreshes, or you can use ⟳.

## How it works

| File | Purpose |
|---|---|
| `server.py` | Python server: pulls daily bars from Yahoo Finance in parallel, computes changes/volumes, caches, serves `/api/movers` + static files |
| `universe.py` | List of tracked tickers per category. Edit to add or remove assets |
| `public/` | Frontend (vanilla HTML/CSS/JS, no build step) |

If Yahoo can't be reached, the server returns **synthetic demo data** and the header shows a yellow "Demo data" badge.

Config env vars: `PORT` (8787), `CACHE_TTL` seconds (300), `WORKERS` (8).

> Data may be delayed. For information only. This is not investment advice.
