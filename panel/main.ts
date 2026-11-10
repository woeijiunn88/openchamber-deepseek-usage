/**
 * DeepSeek usage — panel.
 *
 * Data comes from this package's local service: balance from the DeepSeek API,
 * usage from OpenCode's database, cost recomputed at official peak/off-peak
 * prices. The UI follows the Venice usage panel: kit tabs, a range select,
 * compact daily rows and formula tooltips.
 */
import { connectHost, type HostClient } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountList, mountSelect, mountTabs } from '@openchamber/sdk/ui';

const REFRESH_MS = 60_000;
const PANES = ['spend', 'rates', 'sessions'] as const;
type Pane = (typeof PANES)[number];
const RANGES = [7, 30, 90] as const;

interface Tokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

interface DayAgg {
  date: string;
  requests: number;
  tokens: Tokens;
  cost: number;
  official: number;
  peakOfficial: number;
  offOfficial: number;
}

interface ModelAgg {
  model: string;
  tier: 'flash' | 'pro' | null;
  requests: number;
  tokens: Tokens;
  cost: number;
  official: number;
  peakOfficial: number;
  offOfficial: number;
}

interface SessionSide {
  official: number;
  requests: number;
}

interface SessionAgg {
  id: string;
  official: number;
  requests: number;
  tokens: Tokens;
  startedAt: number;
  lastMessageAt: number | null;
  main: SessionSide;
  children: SessionSide;
}

interface Summary {
  ok: boolean;
  error?: string;
  generatedAt: number;
  now: { phase: 'peak' | 'offpeak'; isPeak: boolean; nextChangeAt: number; nextPhase: 'peak' | 'offpeak' };
  window: { utc: string; local: string };
  pricing: Record<'flash' | 'pro', Record<string, number>>;
  balance: {
    ok: boolean;
    reason?: string;
    currency: string | null;
    total: string | null;
    granted: string | null;
    toppedUp: string | null;
    infos?: { currency: string; total: string; granted: string; toppedUp: string }[];
    isAvailable?: boolean;
  };
  session: SessionAgg | null;
  totals: {
    requests: number;
    tokens: Tokens;
    cost: number;
    official: number;
    peakOfficial: number;
    offOfficial: number;
  };
  today: DayAgg | null;
  models: ModelAgg[];
  days: DayAgg[];
}

interface SessionRank {
  id: string;
  title: string;
  official: number;
  mainOfficial: number;
  childrenOfficial: number;
  requests: number;
  tokens: Tokens;
  lastMessageAt: number;
}

interface SessionsView {
  ok: boolean;
  sessions: SessionRank[];
}

class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');

const panel = h('div', 'panel');
const head = h('div', 'head');
const title = h('span', 'title', 'DeepSeek Usage');
const headSpacer = h('span', 'spacer');
const stamp = h('span', 'stamp', '');
const refreshHost = h('span', 'refresh-host');
head.append(title, headSpacer, stamp, refreshHost);

const balanceRow = h('div', 'balance-row');
const balanceValue = h('span', 'big', '—');
const balanceCaption = h('span', 'caption', 'USD');
const phaseChip = h('span', 'phase-chip');
balanceRow.append(balanceValue, balanceCaption, h('span', 'spacer'), phaseChip);

const chatRow = h('div', 'chat-row');
const chatK = h('span', 'chat-k', 'Chat');
const chatCost = h('span', 'chat-cost', '');
const chatNote = h('span', 'chat-note', '');
chatRow.append(chatK, chatCost, chatNote);
chatRow.hidden = true;
chatRow.tabIndex = 0;
chatRow.setAttribute('role', 'button');

const statsRow = h('div', 'stats');
const statTodayV = h('span', 'stat-v', '—');
const statTodayDelta = h('span', 'delta', '');
const statYestV = h('span', 'stat-v', '—');
const stat7V = h('span', 'stat-v', '—');
const stat30V = h('span', 'stat-v', '—');
for (const [label, value] of [
  ['Today', statTodayV],
  ['Yest', statYestV],
  ['7d', stat7V],
  ['30d', stat30V],
] as const) {
  const stat = h('span', 'stat');
  stat.append(h('span', 'stat-k', label), value);
  if (label === 'Today') stat.append(statTodayDelta);
  statsRow.append(stat);
}

const bannerHost = h('div', 'banner-host');
bannerHost.hidden = true;
const paneTabs = h('div', 'pane-tabs');
const toolbar = h('div', 'toolbar');
const toolbarLabel = h('span', 'toolbar-k', 'Range');
const rangeHost = h('span', 'range-host');
toolbar.append(toolbarLabel, rangeHost);
const paneBody = h('div', 'pane-body');
const foot = h('div', 'foot');
const footLeft = h('span', undefined, 'Official CNY prices, peak/off-peak · UTC windows');
const footRight = h('span', undefined, '');
foot.append(footLeft, footRight);

panel.append(head, balanceRow, chatRow, statsRow, bannerHost, paneTabs, toolbar, paneBody, foot);
app.append(panel);

const REFRESH_PATH =
  'M12 4C14.7486 4 17.1749 5.38626 18.6156 7.5H16V9.5H22V3.5H20V5.99936C18.1762 3.57166 15.2724 2 12 2C6.47715 2 2 6.47715 2 12H4C4 7.58172 7.58172 4 12 4ZM20 12C20 16.4183 16.4183 20 12 20C9.25144 20 6.82508 18.6137 5.38443 16.5H8V14.5H2V20.5H4V18.0006C5.82381 20.4283 8.72764 22 12 22C17.5228 22 22 17.5228 22 12H20Z';
const refreshButton = h('button', 'icon-btn');
refreshButton.type = 'button';
refreshButton.title = 'Refresh';
refreshButton.setAttribute('aria-label', 'Refresh');
refreshButton.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="${REFRESH_PATH}" fill="currentColor" /></svg>`;
refreshHost.append(refreshButton);

const banner = mountBanner(bannerHost, { tone: 'error', title: '' });

const paneTabsHandle = mountTabs(paneTabs, {
  items: [
    { id: 'spend', label: 'Spend' },
    { id: 'rates', label: 'Rates' },
    { id: 'sessions', label: 'Sessions' },
  ],
  activeId: 'spend',
  onChange: (id) => {
    pane = id as Pane;
    paneTabsHandle.update({ activeId: pane });
    render();
    if (pane === 'sessions') void loadSessions();
  },
});

const rangeSelect = mountSelect(rangeHost, {
  value: '30',
  options: [
    { id: '7', label: 'Last 7 days' },
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
  ],
  onChange: (id) => {
    range = Number(id);
    rangeSelect.update({ value: id });
    void loadSummary().then(() => {
      if (pane === 'sessions') void loadSessions();
      render();
    });
  },
});

let pane: Pane = 'spend';
let range = 30;
let summary: Summary | null = null;
let sessionsView: SessionsView | null = null;
let loading = false;
let host: HostClient | null = null;
let session: { id: string; title: string } | null = null;
let sessionFailed = false;

function hostClient(): HostClient {
  if (!host) host = connectHost();
  return host;
}

async function request<T>(path: string, query?: Record<string, string>): Promise<T> {
  const res = await hostClient().serviceRequest({ method: 'GET', path, query });
  let body: unknown;
  try {
    body = JSON.parse(res.body || '{}');
  } catch {
    throw new ServiceError(res.status, 'bad-json', 'Service returned unreadable JSON.');
  }
  const record = body as { ok?: boolean; error?: string; message?: string };
  if (res.status !== 200 || record?.ok === false) {
    throw new ServiceError(res.status, record?.error ?? 'request-failed', record?.message ?? record?.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

async function loadSummary(): Promise<void> {
  summary = await request<Summary>('/summary', {
    days: String(range),
    ...(session ? { session: session.id } : {}),
  });
}

async function loadSessions(): Promise<void> {
  sessionsView = await request<SessionsView>('/sessions', { days: String(range), limit: '20' });
  render();
}

async function refresh(): Promise<void> {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  try {
    await loadSummary();
    if (pane === 'sessions') await loadSessions();
    bannerHost.hidden = true;
    render();
  } catch (error) {
    report(error);
  } finally {
    loading = false;
    refreshButton.disabled = false;
  }
}

function report(error: unknown): void {
  const err = error instanceof ServiceError ? error : new ServiceError(0, 'internal', String(error));
  bannerHost.hidden = false;
  banner.update({ tone: 'error', title: 'DeepSeek usage unavailable', body: err.message || 'Could not load usage.' });
  stamp.textContent = 'error';
}

function fmtCny(n: number, precise = false): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return '¥0';
  if (precise) return `¥${n.toFixed(4)}`;
  if (abs >= 100) return `¥${n.toFixed(1)}`;
  if (abs >= 1) return `¥${n.toFixed(2)}`;
  if (abs === 0) return '¥0';
  if (abs >= 0.01) return `¥${n.toFixed(4)}`;
  return `¥${n.toFixed(5)}`;
}

/** Amount given in official CNY, shown in the chosen currency. */
/** Official DeepSeek cost: always CNY, never converted. */
function money(cny: number, precise = false): string {
  return fmtCny(cny, precise);
}

/** OpenCode recorded cost: always USD, never converted. */
function recorded(usdValue: number): string {
  return fmtUsd(usdValue);
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return '$0';
  if (abs >= 1000) return `$${n.toFixed(0)}`;
  if (abs >= 100) return `$${n.toFixed(1)}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return '$0';
  if (abs >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(5)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function totalTokens(t: Tokens): number {
  return t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtWhen(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function kpiRow(cells: { label: string; value: string; sub?: string; hint?: string }[]): HTMLElement {
  const row = h('div', 'kpis');
  for (const cell of cells) {
    const box = h('div', 'kpi');
    box.append(h('div', 'k', cell.label), h('div', 'v', cell.value));
    if (cell.sub) box.append(h('div', 'sub', cell.sub));
    if (cell.hint) box.title = cell.hint;
    row.append(box);
  }
  return row;
}

function phaseText(): string {
  if (!summary) return '';
  return summary.now.isPeak ? 'peak' : 'off-peak';
}

function renderHeader(): void {
  const s = summary;
  if (!s) return;

  const bal = s.balance;
  const sym = bal.currency === 'CNY' ? '¥' : bal.currency === 'USD' ? '$' : bal.currency ? `${bal.currency} ` : '';
  balanceValue.textContent = bal.ok ? `${sym}${bal.total ?? '—'}` : '—';

  const others = (bal.infos ?? []).filter((entry) => entry.currency && entry.currency !== bal.currency);
  balanceCaption.textContent = bal.ok
    ? others.length > 0
      ? others.map((entry) => `${entry.currency} ${entry.total}`).join(' · ')
      : (bal.currency ?? 'USD')
    : bal.reason === 'no-key'
      ? 'no local key'
      : 'balance unavailable';
  balanceValue.title = bal.ok
    ? `${(bal.infos ?? []).map((entry) => `${entry.currency} ${entry.total} (topped up ${entry.toppedUp}, granted ${entry.granted})`).join(' · ')} — separate wallets, never summed. From api.deepseek.com/user/balance`
    : 'Balance could not be read from the DeepSeek API.';

  const day = (offset: number): DayAgg | null => {
    const index = s.days.length - 1 - offset;
    return index >= 0 ? s.days[index] : null;
  };
  const today = day(0);
  const yest = day(1);
  const last7 = s.days.slice(-7).reduce((sum, d) => sum + d.official, 0);
  const last30 = s.days.slice(-30).reduce((sum, d) => sum + d.official, 0);
  const todayCny = today?.official ?? 0;
  const yestCny = yest?.official ?? 0;
  const diffCny = todayCny - yestCny;
  statTodayV.textContent = money(todayCny);
  statTodayDelta.textContent = diffCny === 0 ? '' : `${diffCny > 0 ? '+' : '−'}${fmtCny(Math.abs(diffCny))}`;
  statTodayDelta.title =
    yestCny > 0 ? `${((diffCny / yestCny) * 100).toFixed(1)}% vs yesterday` : 'no spend yesterday';
  statYestV.textContent = money(yestCny);
  stat7V.textContent = money(last7);
  stat30V.textContent = money(last30);
  stat30V.title = `¥${last30.toFixed(2)} official`;

  phaseChip.dataset.phase = s.now.isPeak ? 'peak' : 'off';
  phaseChip.textContent = `${phaseText()} · ${fmtCountdown(s.now.nextChangeAt - Date.now())}`;
  phaseChip.title = `Peak windows: ${s.window.utc}\nNext switch: ${s.now.nextPhase}`;

  stamp.textContent = `updated ${fmtClock(s.generatedAt)}`;
  stamp.title = new Date(s.generatedAt).toLocaleString();

  footRight.textContent = s.balance.ok ? '¥ official · $ recorded' : '';
  footRight.title = 'Official costs are CNY from DeepSeek pricing; recorded costs are USD from OpenCode. Never converted or summed.';

  renderChat();
}

function renderChat(): void {
  const s = summary;
  if (!s || !session) {
    chatRow.hidden = true;
    if (!sessionFailed) return;
  }
  chatRow.hidden = false;
  const agg = s?.session ?? null;
  const failed = !agg && sessionFailed;
  const empty = agg !== null && agg.requests === 0;

  chatCost.hidden = empty || failed;
  chatNote.hidden = !(empty || failed);
  chatNote.textContent = empty ? 'no usage' : failed ? 'chat data unavailable' : '';
  chatCost.textContent = agg ? (empty ? '' : money(agg.official)) : '…';

  const titleText = session?.title || session?.id || 'this chat';
  if (failed) {
    chatRow.title = `${titleText}\ncould not read opencode.db`;
    return;
  }
  if (agg) {
    chatRow.title =
      `${titleText}\n${agg.requests} calls · main ¥${agg.main.official.toFixed(2)} / sub ¥${agg.children.official.toFixed(2)}\n` +
      `started ${fmtWhen(agg.startedAt)} · last ${fmtWhen(agg.lastMessageAt ?? 0)}\n` +
      `¥${agg.official.toFixed(2)} official · click opens the chat, right-click copies the id`;
  } else {
    chatRow.title = titleText;
  }
}

function copySessionId(id: string): void {
  void hostClient()
    .writeClipboard(id)
    .then(() => hostClient().toast({ kind: 'success', message: 'Session id copied', dismiss: true }))
    .catch(() => {});
}

function renderSpend(): void {
  const s = summary;
  if (!s) return;
  const days = s.days.length;
  const totalCny = s.totals.official;
  const peakCny = s.totals.peakOfficial;
  const offCny = s.totals.offOfficial;

  paneBody.append(
    kpiRow([
      {
        label: `SPENT · ${days}D`,
        value: money(totalCny),
        sub: `${recorded(s.totals.cost)} recorded`,
        hint: `Official CNY price recomputed per message at its peak or off-peak rate. Peak ${money(peakCny)} · off-peak ${money(offCny)}. Recorded is OpenCode's own USD figure, shown for reference.`,
      },
      {
        label: 'AVG / DAY',
        value: money(totalCny / Math.max(days, 1)),
        sub: `${s.totals.requests} calls`,
        hint: 'Official spend ÷ days in the range, zero days included.',
      },
      {
        label: 'RUN-RATE · 30D',
        value: money((totalCny / Math.max(days, 1)) * 30),
        sub: 'not a forecast',
        hint: 'Average per day × 30. A straight extrapolation, not a forecast.',
      },
    ]),
  );

  const split = peakCny + offCny;
  if (split > 0) {
    const card = h('div', 'card');
    card.append(h('div', 'card-k', 'Peak vs off-peak'));
    const stack = h('div', 'stack');
    const peakSeg = h('i');
    peakSeg.style.width = `${((peakCny / split) * 100).toFixed(2)}%`;
    peakSeg.style.opacity = '0.8';
    peakSeg.title = `peak ${money(peakCny)}`;
    const offSeg = h('i');
    offSeg.style.width = `${((offCny / split) * 100).toFixed(2)}%`;
    offSeg.style.opacity = '0.35';
    offSeg.title = `off-peak ${money(offCny)}`;
    stack.append(peakSeg, offSeg);

    const legend = h('div', 'legend');
    for (const [label, value, opacity] of [
      ['Peak', s.totals.peakOfficial, '0.8'],
      ['Off-peak', s.totals.offOfficial, '0.35'],
    ] as const) {
      const row = h('div', 'legend-row');
      const dot = h('span', 'legend-dot');
      dot.style.opacity = opacity;
      row.append(
        dot,
        h('span', 'legend-name', label),
        h('span', 'legend-meta', `${Math.round((value / split) * 100)}% · ${money(value)}`),
      );
      legend.append(row);
    }
    card.append(stack, legend);
    paneBody.append(card);
  }

  const daily = h('div', 'card daily');
  const dailyLabel = h('div', 'card-k', days > 7 ? `Daily · ${days} days · scroll` : `Daily · ${days} days`);
  dailyLabel.title = 'One local day per row. Cost is the official price at that message’s peak or off-peak rate.';
  daily.append(dailyLabel);

  const dayList = h('div', 'day-list');
  const rows = s.days.slice(-7).reverse();
  for (const [index, day] of rows.entries()) {
    const label = index === 0 ? 'Today' : index === 1 ? 'Yesterday' : day.date.slice(5);
    const tokens = totalTokens(day.tokens);
    const parts: string[] = [];
    if (day.tokens.input > 0) parts.push(`in ${fmtTokens(day.tokens.input)}`);
    if (day.tokens.output + day.tokens.reasoning > 0) parts.push(`out ${fmtTokens(day.tokens.output + day.tokens.reasoning)}`);
    if (day.tokens.cacheRead > 0) parts.push(`cache ${fmtTokens(day.tokens.cacheRead)}`);
    const detail = parts.length > 0 ? parts.join(' · ') : day.requests > 0 ? `${day.requests} calls` : 'no calls';
    const phase = day.peakOfficial > 0 && day.offOfficial > 0 ? 'mixed' : day.peakOfficial > 0 ? 'peak' : day.offOfficial > 0 ? 'off-peak' : 'none';

    const row = h('div', 'day-row');
    row.title = `${day.date} · ${detail} · ${phase} · ¥${day.official.toFixed(2)} official · $${day.cost.toFixed(2)} recorded`;
    row.append(h('span', 'day-date', label), h('span', 'day-tok', detail), h('span', 'day-amt', money(day.official)));
    if (phase === 'peak' || phase === 'mixed') row.dataset.phase = phase;
    dayList.append(row);
  }
  daily.append(dayList);
  paneBody.append(daily);

  const cache = s.totals.tokens.cacheRead;
  const prompt = s.totals.tokens.input + cache;
  const cacheRate = prompt > 0 ? (cache / prompt) * 100 : null;
  const millionTokens = totalTokens(s.totals.tokens) / 1_000_000;
  const perMillion = millionTokens > 0 ? totalCny / millionTokens : null;
  const perCall = s.totals.requests > 0 ? totalCny / s.totals.requests : null;

  paneBody.append(
    kpiRow([
      {
        label: 'CACHE HIT',
        value: cacheRate === null ? '—' : `${Math.round(cacheRate)}%`,
        sub: 'of prompt tokens',
        hint: `Cache-read tokens ÷ (input + cache-read) = ${fmtTokens(cache)} ÷ (${fmtTokens(s.totals.tokens.input)} + ${fmtTokens(cache)}).`,
      },
      {
        label: '¥ / 1M TOKENS',
        value: perMillion === null ? '—' : money(perMillion, true),
        sub: 'official price',
        hint: `Official spend ${money(totalCny)} ÷ ${millionTokens.toFixed(2)}M tokens.`,
      },
      {
        label: '¥ / CALL',
        value: perCall === null ? '—' : money(perCall),
        sub: `${s.totals.requests} calls`,
        hint: 'Official spend ÷ assistant messages recorded by OpenCode in the range.',
      },
    ]),
  );
}

function renderSessions(): void {
  if (!sessionsView) {
    paneBody.append(h('div', 'loading', 'Loading sessions…'));
    return;
  }
  const host = h('div', 'list-host session-list');
  const count = sessionsView.sessions.length;
  paneBody.append(h('div', 'card-k', `Sessions · ${count}${count > 8 ? ' · scroll' : ''}`), host);
  mountList(host, {
    ariaLabel: 'Spend by session',
    selectedId: null,
    onSelect: (id) => {
      void hostClient().openSession(id);
    },
    emptyText: 'No sessions in this range.',
    items: sessionsView.sessions.map((row) => ({
      id: row.id,
      title: row.title || row.id,
      subtitle: `main ${fmtCny(row.mainOfficial)} · sub ${fmtCny(row.childrenOfficial)} · last ${fmtWhen(row.lastMessageAt)}`,
      meta: money(row.official),
    })),
  });
  const rows = host.querySelectorAll<HTMLElement>('.oc-sdk-row');
  sessionsView.sessions.forEach((row, index) => {
    const el = rows[index];
    if (!el) return;
    el.title = `${row.title}\n${row.id}\n${row.requests} calls · ${fmtTokens(totalTokens(row.tokens))} tokens\nmain ¥${row.mainOfficial.toFixed(2)} · subagents ¥${row.childrenOfficial.toFixed(2)} · total ¥${row.official.toFixed(2)}\nright-click copies the id`;
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      copySessionId(row.id);
    });
  });
}

function renderRates(): void {
  const s = summary;
  if (!s) return;
  const countdown = fmtCountdown(s.now.nextChangeAt - Date.now());
  const phase = h('div', 'kv-block');
  phase.append(h('div', 'card-k', 'Current phase'));
  phase.append(
    kvRow('Phase', `${phaseText()} · switches in ${countdown}`, `Peak windows: ${s.window.utc}. Local: ${s.window.local}.`),
    kvRow('Next', s.now.nextPhase, 'Phase after the next switch.'),
  );

  const price = (tier: 'flash' | 'pro', peakKey: string, offKey: string): { value: string; hint: string } => {
    const pk = s.pricing[tier]?.[peakKey];
    const off = s.pricing[tier]?.[offKey];
    if (pk === undefined || off === undefined) return { value: '—', hint: '' };
    return {
      value: `${money(pk, true)} / ${money(off, true)}`,
      hint: `Peak ¥${pk} · off-peak ¥${off} per 1M tokens. Left is peak, right is off-peak.`,
    };
  };

  const table = h('div', 'kv-block');
  table.append(h('div', 'card-k', 'Official price per 1M tokens · peak / off-peak'));
  const rows: [string, 'flash' | 'pro', string, string][] = [
    ['Flash · cache hit', 'flash', 'hitPeak', 'hitOff'],
    ['Flash · input', 'flash', 'missPeak', 'missOff'],
    ['Flash · output', 'flash', 'outPeak', 'outOff'],
    ['Pro · cache hit', 'pro', 'hitPeak', 'hitOff'],
    ['Pro · input', 'pro', 'missPeak', 'missOff'],
    ['Pro · output', 'pro', 'outPeak', 'outOff'],
  ];
  for (const [label, tier, peakKey, offKey] of rows) {
    const cell = price(tier, peakKey, offKey);
    table.append(kvRow(label, cell.value, cell.hint));
  }
  table.append(h('div', 'note', 'Prices are CNY per 1M tokens as published by DeepSeek; there is no official USD price. Cache writes are not billed.'));

  paneBody.append(phase, table);
}

function kvRow(label: string, value: string, hint?: string): HTMLElement {
  const row = h('div', 'kv');
  row.append(h('span', 'kv-k', label), h('span', 'kv-v', value));
  if (hint) row.title = hint;
  return row;
}

function render(): void {
  paneBody.textContent = '';
  renderHeader();
  toolbar.hidden = pane === 'rates';
  if (!summary) {
    paneBody.append(h('div', 'loading', 'Loading usage…'));
    return;
  }
  if (pane === 'spend') renderSpend();
  else if (pane === 'rates') renderRates();
  else renderSessions();
}

chatRow.addEventListener('click', () => {
  if (session) void hostClient().openSession(session.id);
});
chatRow.addEventListener('keydown', (event) => {
  if (!session) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void hostClient().openSession(session.id);
    return;
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    copySessionId(session.id);
  }
});
chatRow.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (session) copySessionId(session.id);
});

async function boot(): Promise<void> {
  hostClient().onReady((context) => {
    applyHostReady(context, document.documentElement);
    if (context.session) session = { id: context.session.id, title: context.session.title };
    hostClient().onSession((snapshot) => {
      session = snapshot ? { id: snapshot.id, title: snapshot.title } : null;
      void refresh();
    });
    void refresh();
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
  });
}

void boot();
