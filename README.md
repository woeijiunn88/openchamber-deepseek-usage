# openchamber-deepseek-usage

OpenChamber extension: DeepSeek balance, spend, tokens and peak/off-peak
pricing in the right rail, plus a Work Status card.

## What it shows

- **Header** — balance wallets as reported by DeepSeek, the current chat cost,
  today / yesterday / 7-day / 30-day totals, and a phase chip.
- **Usage** — official spend, average per day, 30-day run-rate, a peak versus
  off-peak split, a daily table with tokens, and efficiency cells.
- **Rates** — current phase, next switch in UTC and GMT+8, and the full price
  table per 1M tokens for flash and pro.
- **Sessions** — spend per chat with main/subagent split. Click opens the chat,
  right-click copies the id.
- **Work Status** — Balance, Today, 7 days, Phase.

Hovering any derived figure explains its formula.

## Currency

Two currencies, never converted:

- `¥` is DeepSeek's official price, recomputed per message at the peak or
  off-peak rate in force at that timestamp.
- `$` is OpenCode's recorded cost, straight from its database.
- Balance lists each wallet natively (`CNY 38.87`, `USD 0.00`); the funded one
  is the headline.

## Requirements

- OpenChamber 2.0.1 or newer.
- A DeepSeek key, read from `DEEPSEEK_API_KEY`,
  `~/.config/opencode/secrets/deepseek-api-key`, OpenCode's credential store,
  or `~/.local/share/opencode/auth.json`.
- Node 22+ only to build; the built files run inside OpenChamber.

## Install

1. `npm install && npm run build` (only needed after editing sources).
2. Settings → Extensions → paste this folder's path or the repository URL.
3. Approve the local **service** capability.

## Data

- `https://api.deepseek.com/user/balance` — balance only. DeepSeek exposes no
  usage endpoint, so spend cannot come from the API.
- `~/.local/share/opencode/opencode.db` — messages, tokens and recorded cost.
- Official cost is computed from the CNY price table; peak is Mon–Fri
  01:00–04:00 and 06:00–10:00 UTC.

## Not included

Full-screen page, slash commands, and the old per-message cost menu action.
