# openchamber-deepseek-usage

OpenChamber extension: DeepSeek balance, spend, token use and peak/off-peak
pricing, in a right-rail panel and a Work Status card.

## Requirements

- OpenChamber 2.0.1 or newer.
- A local DeepSeek key. Read from `DEEPSEEK_API_KEY`,
  `~/.config/opencode/secrets/deepseek-api-key`, OpenCode's credential store,
  or `~/.local/share/opencode/auth.json`, in that order.
- Node 22+ only for building; the built files run inside OpenChamber.

## What it shows

**Header** — balance in its native wallet with the other wallet beside it,
current chat cost, `TODAY / YEST / 7D / 30D`, and a phase chip
(`peak · 3h 46m`) so the price basis is visible before any number.

**Spend** — official spend, average per day, 30-day run-rate; a peak versus
off-peak split bar; a daily table with tokens in/out/cache, a phase marker per
day and the official cost; efficiency cells (cache hit, ¥ per 1M tokens,
¥ per call).

**Rates** — current phase, then two switch rows, one in UTC and one in GMT+8,
followed by the official price table per 1M tokens for flash and pro: cache
hit, input and output, peak and off-peak. Hovering the phase chip opens a small
card with the same instant in both zones.

**Sessions** — ranking with call counts and last activity. Click opens the
chat, right-click copies the session id.

**Work Status** — Balance, Today, 7 days, Phase. The 7-day per-day figure is
in its tooltip.

## Currency rule

Two currencies, two sources, never converted and never summed:

- `¥` is DeepSeek's official price, recomputed per message at the peak or
  off-peak rate in force at that timestamp.
- `$` is OpenCode's recorded cost, converted to nothing.
- Balance lists every wallet the API returns (`CNY 2.10`, `USD 0.00`) as they
  are; the funded one is shown as the headline.

There is no FX lookup anywhere in the extension.

## Data sources

- `GET https://api.deepseek.com/user/balance` — the only live account call.
  Returns one entry per currency wallet.
- `~/.local/share/opencode/opencode.db` — messages and tokens, read-only.
- Everything else is computed: official cost from the CNY price table, peak
  windows Monday–Friday 01:00–04:00 and 06:00–10:00 UTC.

DeepSeek exposes no usage or billing-history endpoint: `/user/usage`,
`/usage`, `/v1/usage` and `/dashboard/billing/usage` all return 404. Per-day
and per-session figures can only come from OpenCode's database.

## Install

1. Build once: `npm install && npm run build`. The repo ships built
   `panel/main.js` and `service/main.js`.
2. OpenChamber → Settings → Extensions.
3. Paste this directory's absolute path or the repository URL.
4. Approve the extension; it asks for the local **service** capability.

## Service routes

| Route | Purpose |
|---|---|
| `/summary?days=7..90&session=ses_…` | Totals, models, days, balance, phase, pricing |
| `/sessions?days=…&limit=…` | Session ranking |
| `/balance` | DeepSeek account wallets |
| `/status` | Host-drawn Work Status rows |
| `/message?id=…` | One message's official cost (kept for the old action) |
| `/health` | Liveness |

## Upstream quirks handled

- The balance endpoint returns multiple wallets; they are listed, never added.
- Messages are repriced per timestamp, so a range can mix peak and off-peak
  (`peakOfficial`, `offOfficial` per day).
- OpenCode 2.x stores messages in `session_message`; the service falls back to
  the OpenCode 1.x `message` table when needed.
- Cache writes are not billed by DeepSeek, so there is no cache-write column.

## Not included

Full-screen page, slash commands, heatmap, and the per-message cost menu item
from the earlier extension. The `/message` route exists but no panel surface
uses it.
