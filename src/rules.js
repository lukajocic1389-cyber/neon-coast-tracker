// Progression rules (spec §1 BR-1, BR-2, §4.3 D6). Pure: no I/O.
// This is the ONLY place the reward rule lives.

/**
 * Decide what an already-validated event actually awards.
 * - completed → the reported rewards (BR-1)
 * - failed    → nothing, even if the engine reported non-zero rewards (BR-2, D6)
 */
export function computeAward({ result, cash_reward, reputation_reward }) {
  if (result === 'completed') {
    return { cash: cash_reward, reputation: reputation_reward };
  }
  return { cash: 0, reputation: 0 };
}
