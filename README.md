# DeepSeek Usage for OpenChamber

A right-rail panel and Work Status card for DeepSeek: balance, spend, tokens,
peak and off-peak pricing, and per-chat cost.

## Features

- **Glance header** — balance wallets, current chat cost, today / yesterday /
  7-day / 30-day totals, and a phase chip with the countdown to the next
  peak or off-peak switch.
- **Usage** — official spend, average per day, 30-day run-rate, a peak versus
  off-peak split, a daily table with tokens in/out/cache and a phase marker,
  and efficiency cells: cache hit, ¥ per 1M tokens, ¥ per call.
- **Rates** — current phase, next switch in UTC and GMT+8, and the full price
  table per 1M tokens for flash and pro: cache hit, input and output, peak and
  off-peak.
- **Sessions** — spend per chat with main and subagent split. Click opens the
  chat, right-click copies the id.
- **Work Status** — Balance, Today, 7 days and Phase, drawn by the host.

Hovering a derived figure or the phase chip explains its formula.

## Currency

Two currencies, two sources, never converted and never summed:

- `¥` is DeepSeek's official price, recomputed per message at the peak or
  off-peak rate in force at that timestamp.
- `$` is OpenCode's recorded cost, used as stored.
- Balance lists every wallet the API returns (`CNY 38.87`, `USD 0.00`); the
  funded one is the headline.

## Requirements

- OpenChamber 2.0.1 or newer.
- A local DeepSeek key. Read from `DEEPSEEK_API_KEY`,
  `~/.config/opencode/secrets/deepseek-api-key`, OpenCode's credential store,
  or `~/.local/share/opencode/auth.json`, in that order.
- Node 22+ for building only; the built bundle runs inside OpenChamber.

## Installation

Pick one:

1. **Release ZIP** — download `openchamber-deepseek-usage-0.1.0.zip` from the
   releases page and paste its URL, or the downloaded file path, into
   **Folder, ZIP, or URL**.
2. **GitHub** — paste `https://github.com/woeijiunn88/openchamber-deepseek-usage`
   for a Git install that can check for updates.
3. **Local folder** — build with `npm install && npm run build`, then paste this
   directory's absolute path.

Then open **Settings → Extensions** and approve the extension. It requests two
capabilities:

- **service** — start the local usage service;
- **sessions** — open a chat from the panel.

Built files are committed, so building is only needed after editing sources.

## Usage

- **Range** — a select with last 7, 30 or 90 days. It drives the spend KPIs,
  daily table, sessions and rates.
- **Phase chip** — `peak · 1h 6m left` or `off-peak · 12m left`. Hover shows
  the next switch in UTC and GMT+8 and both peak windows.
- **Sessions** — click opens the chat, right-click copies the session id.
- **Work Status** — the card follows the chat, not the panel's range.

Peak windows are Monday to Friday 01:00–04:00 and 06:00–10:00 UTC
(09:00–12:00 and 14:00–18:00 GMT+8). Everything else is off-peak.

## Configuration

The service reads the key; the sandboxed panel never sees it. Resolution order:

1. `DEEPSEEK_API_KEY`.
2. `~/.config/opencode/secrets/deepseek-api-key`.
3. OpenCode's credential store.
4. `~/.local/share/opencode/auth.json`.

A missing key means balance is unavailable; usage still comes from OpenCode's
database.

## How it works

- `https://api.deepseek.com/user/balance` is the only live account call. It
  returns one entry per currency wallet; they are listed, never added.
- Messages, tokens and recorded cost come from
  `~/.local/share/opencode/opencode.db`, read-only.
- Official cost is computed from the CNY price table. The API exposes no usage
  or billing history, so there is nothing to fetch.
- Messages are repriced individually, so a range can mix peak and off-peak.

## Development

```bash
npm install
npm run build       # panel IIFE + service CJS
npm run typecheck

# run the service alone
OPENCHAMBER_SERVICE_PORT=3999 OPENCHAMBER_SERVICE_TOKEN=dev node service/main.js
curl -s -H 'Authorization: Bearer dev' http://127.0.0.1:3999/status
```

Layout:

```
panel/     iframe UI (connectHost, host.serviceRequest)
service/   loopback HTTP service: summary, sessions, balance, status
build.mjs  esbuild: IIFE for the panel, CJS for the service
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| Balance shows `—` | no local key, or the balance call failed |
| Usage empty | no DeepSeek calls in the selected range |
| Session click does nothing | `sessions` capability not granted |
| Rail icon unchanged | manifest edits need an extension reload |
| Figures differ from OpenAI-style dashboards | DeepSeek exposes no usage; spend is recomputed |

## Limitations

- DeepSeek reports balance only; all spend figures are computed or recorded.
- No full-screen page, slash commands or heatmap.
- The per-message cost menu action from the earlier extension is not included.
- Cache writes are not billed by DeepSeek, so there is no cache-write column.

## License

MIT
