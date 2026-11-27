// Test console: a server-rendered form that sends one mission event through the same store.submitEvent()
// that POST /api/events uses, and shows the exact request body, HTTP status and JSON response.
// It is a testing aid for the existing API, not a new game mechanic. No client-side JavaScript (D15).
// Pure functions: data in, HTML string or event object out. No I/O.

import { CREWS, MISSIONS, PLAYERS } from '../catalog.js';
import { escapeHtml, layout } from './render.js';

/** Selection values that deliberately fail validation, so rejections can be tried from the form. */
export const UNKNOWN_PLAYER = 'P-99';
export const UNKNOWN_MISSION = 'M-99';
export const AUTO_CREW = 'auto';

export const CONSOLE_DEFAULTS = Object.freeze({
  player_id: 'P-01', mission_id: 'M-10', crew: AUTO_CREW, result: 'completed',
  cash_reward: '500', reputation_reward: '20', event_id: '', timestamp: '',
});

/** "500" → 500. Anything that is not a plain whole number is sent unchanged, so the API's own validation answers. */
function toNumberIfInteger(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

/** A fresh event_id for the console: "WEB-" + base-36 time + 4 random characters (matches ^[A-Za-z0-9_-]{1,64}$). */
export function newConsoleEventId(now = new Date(), random = Math.random) {
  const suffix = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
  return `WEB-${now.getTime().toString(36)}-${suffix}`.toUpperCase();
}

/**
 * Turn the submitted form fields into the JSON event body for submitEvent().
 * - crew "auto" uses the selected mission's crew (or the first crew for an unknown mission, so only
 *   UNKNOWN_MISSION is reported).
 * - an empty event_id gets a fresh one; an empty timestamp becomes "now".
 * - rewards are converted to numbers only when they are plain whole numbers.
 */
export function buildConsoleEvent(form, { now = new Date(), random = Math.random } = {}) {
  const f = { ...CONSOLE_DEFAULTS, ...(form ?? {}) };
  const mission = MISSIONS.find((m) => m.mission_id === f.mission_id);
  const crew = f.crew === AUTO_CREW ? (mission?.crew ?? CREWS[0]) : String(f.crew);
  const eventId = String(f.event_id).trim() || newConsoleEventId(now, random);
  const timestamp = String(f.timestamp).trim() || now.toISOString();
  return {
    event_id: eventId,
    player_id: String(f.player_id),
    mission_id: String(f.mission_id),
    crew,
    result: String(f.result),
    cash_reward: toNumberIfInteger(f.cash_reward),
    reputation_reward: toNumberIfInteger(f.reputation_reward),
    timestamp,
  };
}

/** Form selections that reproduce a sent event (crew stays "auto" when it is the mission's own crew). */
export function consoleFormFromEvent(event) {
  const e = event && typeof event === 'object' ? event : {};
  const mission = MISSIONS.find((m) => m.mission_id === e.mission_id);
  const pick = (k) => (e[k] === undefined || e[k] === null ? CONSOLE_DEFAULTS[k] : String(e[k]));
  return {
    player_id: pick('player_id'), mission_id: pick('mission_id'), result: pick('result'),
    crew: mission && e.crew === mission.crew ? AUTO_CREW : pick('crew'),
    cash_reward: pick('cash_reward'), reputation_reward: pick('reputation_reward'),
  };
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function select(name, label, options, selected) {
  return `<label class="field"><span class="field-label">${escapeHtml(label)}</span>
  <select name="${escapeHtml(name)}" data-testid="field-${escapeHtml(name)}">
    ${options.map(([v, l]) => option(v, l, selected)).join('\n    ')}
  </select></label>`;
}

function input(name, label, value, { placeholder = '', inputmode = '' } = {}) {
  return `<label class="field"><span class="field-label">${escapeHtml(label)}</span>
  <input name="${escapeHtml(name)}" data-testid="field-${escapeHtml(name)}" value="${escapeHtml(value)}"`
    + `${placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : ''}${inputmode ? ` inputmode="${inputmode}"` : ''}`
    + ` autocomplete="off"></label>`;
}

function outcomeClass(httpStatus) {
  if (httpStatus === 201) return 'outcome-accepted';
  if (httpStatus === 200) return 'outcome-duplicate';
  return 'outcome-rejected';
}

function resultPanel(result) {
  if (!result) return '';
  const { request, httpStatus, body } = result;
  const playerLink = PLAYERS.some((p) => p.player_id === request.player_id)
    ? `<p><a class="button-link" href="/players/${encodeURIComponent(request.player_id)}">Open ${escapeHtml(request.player_id)} dashboard &rarr;</a></p>`
    : '';
  return `<section class="panel console-result ${outcomeClass(httpStatus)}" aria-labelledby="result-heading" data-testid="console-result" data-status="${escapeHtml(httpStatus)}">
<h2 id="result-heading">Response <span class="status-pill" data-testid="console-status">HTTP ${escapeHtml(httpStatus)} · ${escapeHtml(body?.status)}</span></h2>
<div class="console-io">
  <div><h3>Request body sent</h3><pre class="json" data-testid="console-request">${escapeHtml(JSON.stringify(request, null, 2))}</pre></div>
  <div><h3>Response body</h3><pre class="json" data-testid="console-response">${escapeHtml(JSON.stringify(body, null, 2))}</pre></div>
</div>
<form method="post" action="/console" class="console-resend">
  <input type="hidden" name="action" value="resend">
  <input type="hidden" name="last_event" value="${escapeHtml(JSON.stringify(request))}">
  <button type="submit" class="button secondary" data-testid="console-resend">Resend this exact event (duplicate test)</button>
</form>
${playerLink}
</section>`;
}

/**
 * GET/POST /console page.
 * @param {{ form?: object, result?: { request: object, httpStatus: number, body: object }, error?: string, now?: Date }} [opts]
 */
export function renderConsole({ form, result, error, now } = {}) {
  const f = { ...CONSOLE_DEFAULTS, ...(form ?? {}) };
  const players = [...PLAYERS.map((p) => [p.player_id, `${p.player_id} · ${p.name}`]), [UNKNOWN_PLAYER, `${UNKNOWN_PLAYER} · unknown player (expect 400)`]];
  const missions = [
    ...MISSIONS.map((m) => [m.mission_id, `${m.mission_id} · ${m.title} (${m.crew})`]),
    [UNKNOWN_MISSION, `${UNKNOWN_MISSION} · unknown mission (expect 400)`],
  ];
  const crews = [[AUTO_CREW, "Mission's own crew (auto)"], ...CREWS.map((c) => [c, c])];
  const results = [['completed', 'completed'], ['failed', 'failed'], ['abandoned', 'abandoned (invalid, expect 400)']];

  const body = `<h1 class="page-title">Test console</h1>
<p class="lede">Send one mission event to the tracker. It goes through the same code as <code>POST /api/events</code>,
so validation, rewards and duplicate handling are exactly what an API client gets. Values marked “expect 400” are there to test rejections.</p>
${error ? `<p class="console-error" role="alert">${escapeHtml(error)}</p>` : ''}
<section class="panel" aria-labelledby="form-heading">
<h2 id="form-heading">New event</h2>
<form method="post" action="/console" class="console-form" data-testid="console-form">
  <input type="hidden" name="action" value="send">
  <div class="field-grid">
  ${select('player_id', 'Player', players, f.player_id)}
  ${select('mission_id', 'Mission', missions, f.mission_id)}
  ${select('crew', 'Crew', crews, f.crew)}
  ${select('result', 'Result', results, f.result)}
  ${input('cash_reward', 'Cash reward', f.cash_reward, { inputmode: 'numeric' })}
  ${input('reputation_reward', 'Reputation reward', f.reputation_reward, { inputmode: 'numeric' })}
  ${input('event_id', 'Event ID', f.event_id, { placeholder: 'empty = new unique ID' })}
  ${input('timestamp', 'Timestamp (UTC)', f.timestamp, { placeholder: 'empty = now, e.g. 2026-11-20T15:00:00Z' })}
  </div>
  <button type="submit" class="button" data-testid="console-send">Send event</button>
</form>
</section>
${resultPanel(result)}`;
  return layout({ title: 'Test console', now, body, refresh: false });
}
