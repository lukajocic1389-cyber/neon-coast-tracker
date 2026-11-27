import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConsoleEvent, newConsoleEventId, renderConsole, AUTO_CREW } from '../../src/dashboard/console.js';
import { renderIndex } from '../../src/dashboard/render.js';

const NOW = new Date('2026-11-27T10:00:00.000Z');
const fixed = () => 0.5;

test('console: defaults build a valid completed event for P-01 on M-10 with the mission crew', () => {
  const e = buildConsoleEvent({}, { now: NOW, random: fixed });
  assert.deepEqual(e, {
    event_id: newConsoleEventId(NOW, fixed), player_id: 'P-01', mission_id: 'M-10', crew: 'Harbor Crew',
    result: 'completed', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-27T10:00:00.000Z',
  });
  assert.match(e.event_id, /^[A-Za-z0-9_-]{1,64}$/);
});

test('console: crew "auto" follows the selected mission; an explicit crew is kept as chosen', () => {
  assert.equal(buildConsoleEvent({ mission_id: 'M-31', crew: AUTO_CREW }, { now: NOW }).crew, 'Static Choir');
  assert.equal(buildConsoleEvent({ mission_id: 'M-31', crew: 'Harbor Crew' }, { now: NOW }).crew, 'Harbor Crew');
  assert.equal(buildConsoleEvent({ mission_id: 'M-99', crew: AUTO_CREW }, { now: NOW }).crew, 'Harbor Crew');
});

test('console: typed event_id and timestamp are used as given (trimmed)', () => {
  const e = buildConsoleEvent({ event_id: ' RUN-7 ', timestamp: '2026-11-20T15:00:00Z' }, { now: NOW });
  assert.equal(e.event_id, 'RUN-7');
  assert.equal(e.timestamp, '2026-11-20T15:00:00Z');
});

test('console: rewards become numbers only when they are whole numbers; other text is passed on for the API to reject', () => {
  const e = buildConsoleEvent({ cash_reward: ' 750 ', reputation_reward: '-5' }, { now: NOW });
  assert.equal(e.cash_reward, 750);
  assert.equal(e.reputation_reward, -5);
  const bad = buildConsoleEvent({ cash_reward: '12.5', reputation_reward: 'lots' }, { now: NOW });
  assert.equal(bad.cash_reward, '12.5');
  assert.equal(bad.reputation_reward, 'lots');
});

test('console: generated event IDs differ between calls', () => {
  assert.notEqual(newConsoleEventId(NOW, () => 0.1), newConsoleEventId(NOW, () => 0.2));
});

test('console page: form with every player, mission and crew, test values, and no auto-refresh', () => {
  const html = renderConsole({ now: NOW });
  assert.match(html, /<form method="post" action="\/console"/);
  for (const id of ['P-01', 'P-05', 'P-99', 'M-10', 'M-31', 'M-99']) assert.match(html, new RegExp(`value="${id}"`));
  for (const crew of ['Harbor Crew', 'Lantern Row', 'Static Choir']) assert.match(html, new RegExp(`value="${crew}"`));
  assert.match(html, /value="abandoned"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /<script/i, 'no client-side JavaScript (D15)');
  assert.doesNotMatch(html, /data-testid="console-result"/);
});

test('console page: result panel shows status and escaped request/response JSON, and keeps selections', () => {
  const request = { event_id: '<x>', player_id: 'P-02' };
  const html = renderConsole({
    form: { player_id: 'P-02', mission_id: 'M-20', result: 'failed' },
    result: { request, httpStatus: 201, body: { status: 'accepted' } },
    now: NOW,
  });
  assert.match(html, /data-testid="console-result" data-status="201"/);
  assert.match(html, /HTTP 201 · accepted/);
  assert.match(html, /&lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /<option value="P-02" selected>/);
  assert.match(html, /<option value="M-20" selected>/);
  assert.match(html, /<option value="failed" selected>/);
  assert.match(html, /href="\/players\/P-02"/);
  assert.match(html, /name="action" value="resend"/);
});

test('other dashboard pages keep their 5-second refresh and link to the console', () => {
  const html = renderIndex([], { now: NOW });
  assert.match(html, /<meta http-equiv="refresh" content="5">/);
  assert.match(html, /href="\/console"/);
});

test('console: after a resend the form shows the resent event\'s selections', async () => {
  const { consoleFormFromEvent } = await import('../../src/dashboard/console.js');
  assert.deepEqual(
    consoleFormFromEvent({ player_id: 'P-02', mission_id: 'M-30', crew: 'Static Choir', result: 'failed', cash_reward: 300, reputation_reward: 5 }),
    { player_id: 'P-02', mission_id: 'M-30', crew: AUTO_CREW, result: 'failed', cash_reward: '300', reputation_reward: '5' },
  );
  assert.equal(consoleFormFromEvent({ mission_id: 'M-30', crew: 'Harbor Crew' }).crew, 'Harbor Crew');
  assert.equal(consoleFormFromEvent(null).player_id, 'P-01');
});
