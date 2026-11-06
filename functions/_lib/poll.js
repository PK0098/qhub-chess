// Finals night poll: pure helpers, unit-tested.
import { bad } from './http.js';

export const POLL_DAYS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

// The four semi-finalists: both winners play the final, both losers the
// bronze match, so all four must be free on the chosen evening.
export function finalistIds(games) {
  const ids = new Set();
  for (const g of games) if (g.round === 2) { ids.add(g.p1); if (g.p2 !== null) ids.add(g.p2); }
  return [...ids];
}

// A vote is a set of known days, any number of them. Throws bad() otherwise.
export function validateVote(days, allowed = POLL_DAYS) {
  if (!Array.isArray(days) || days.some((d) => typeof d !== 'string')) throw bad('Send a list of days');
  if (new Set(days).size !== days.length) throw bad('A day is listed twice');
  for (const d of days) if (!allowed.includes(d)) throw bad('Unknown day');
  return [...days];
}

// rows: [{ player_id, day }]. Returns per-day voter ids (in row order), the
// days every finalist ticked, and how many distinct players voted.
export function tallyVotes(rows, finalists, days = POLL_DAYS) {
  const votes = Object.fromEntries(days.map((d) => [d, []]));
  for (const r of rows) if (votes[r.day]) votes[r.day].push(r.player_id);
  const allFinalists = days.filter((d) => finalists.length > 0 && finalists.every((id) => votes[d].includes(id)));
  return { votes, allFinalists, total: new Set(rows.map((r) => r.player_id)).size };
}

export function pollClosed(closesAt, now = Date.now()) {
  const t = Date.parse(closesAt || '');
  return Number.isFinite(t) && now >= t;
}
