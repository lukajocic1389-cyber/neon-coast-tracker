// Expected dashboard totals computed locally from the spec §1 rules. Pure, no I/O.

import { CREWS, PLAYERS } from '../catalog.js';

/** Zeroed totals for one player, with every crew listed. */
function emptyTotals() {
  return {
    completed_count: 0,
    failed_count: 0,
    cash_balance: 0,
    reputation_by_crew: Object.fromEntries(CREWS.map((c) => [c, 0])),
  };
}

/**
 * Apply the business rules to the plan's valid events.
 * - BR-1: completed adds cash_reward and reputation_reward once, to the event's player and crew.
 * - BR-2: failed is counted but adds nothing.
 * - BR-3/BR-4: duplicates and invalid events contribute nothing. A repeated event_id among valid entries is
 *   also counted only once, so the result stays correct even for a hand-made plan.
 * @param {Array<{ kind: string, event: object }>} plan
 * @returns {Record<string, { completed_count: number, failed_count: number, cash_balance: number,
 *   reputation_by_crew: Record<string, number> }>}
 */
export function computeExpected(plan) {
  const totals = Object.fromEntries(PLAYERS.map((p) => [p.player_id, emptyTotals()]));
  const seen = new Set();
  for (const { kind, event } of plan) {
    if (kind !== 'valid' || seen.has(event.event_id)) continue;
    seen.add(event.event_id);
    const t = totals[event.player_id];
    if (!t) continue; // not a roster player: the server would reject it
    if (event.result === 'completed') {
      t.completed_count += 1;
      t.cash_balance += event.cash_reward;
      t.reputation_by_crew[event.crew] += event.reputation_reward;
    } else if (event.result === 'failed') {
      t.failed_count += 1;
    }
  }
  return totals;
}
