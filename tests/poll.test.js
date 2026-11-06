import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalistIds, validateVote, tallyVotes, pollClosed } from '../functions/_lib/poll.js';

// The evening must suit the four semi-finalists: all of them play that night
// (final or bronze), whether or not their semi is already decided.
test('finalistIds is the four players in the round-2 games, decided or not', () => {
  const games = [
    { round: 1, p1: 1, p2: 9 }, { round: 2, slot: 0, p1: 1, p2: 2 }, { round: 2, slot: 0, p1: 2, p2: 1 },
    { round: 2, slot: 1, p1: 3, p2: 4 }, { round: 3, slot: 0, p1: 1, p2: 3 },
  ];
  assert.deepEqual(finalistIds(games).sort(), [1, 2, 3, 4]);
});

// Two picks keep the tally meaningful: a player who ticks every day says nothing.
test('validateVote refuses a third pick, duplicates and unknown days', () => {
  const ok = ['2026-11-09', '2026-11-13'];
  assert.deepEqual(validateVote(ok), ok);
  assert.deepEqual(validateVote([]), []);
  assert.throws(() => validateVote(['2026-11-09', '2026-11-10', '2026-11-11']), /at most 2/);
  assert.throws(() => validateVote(['2026-11-09', '2026-11-09']), /twice/);
  assert.throws(() => validateVote(['2026-11-14']), /Unknown day/);
  assert.throws(() => validateVote('2026-11-09'), /list/);
});

// The organizer reads the tally to pick a night: a day only counts as workable
// when every finalist ticked it, and the total is people, not ticks.
test('tallyVotes flags the days all finalists ticked and counts distinct voters', () => {
  const rows = [
    { player_id: 1, day: '2026-11-10' }, { player_id: 2, day: '2026-11-10' }, { player_id: 3, day: '2026-11-10' }, { player_id: 4, day: '2026-11-10' },
    { player_id: 7, day: '2026-11-10' }, { player_id: 1, day: '2026-11-12' }, { player_id: 2, day: '2026-11-12' }, { player_id: 3, day: '2026-11-12' },
    { player_id: 9, day: '2026-11-30' }, // not a poll day: ignored
  ];
  const t = tallyVotes(rows, [1, 2, 3, 4]);
  assert.deepEqual(t.votes['2026-11-10'], [1, 2, 3, 4, 7]);
  assert.deepEqual(t.votes['2026-11-09'], []);
  assert.deepEqual(t.allFinalists, ['2026-11-10']);
  assert.equal(t.total, 6);
  assert.deepEqual(tallyVotes(rows, []).allFinalists, [], 'no finalists yet means no day is "works for all"');
});

test('pollClosed: open without a deadline, closed from the deadline on', () => {
  assert.equal(pollClosed(null), false);
  assert.equal(pollClosed('2026-11-08T20:00:00+04:00', Date.parse('2026-11-08T15:59:00Z')), false);
  assert.equal(pollClosed('2026-11-08T20:00:00+04:00', Date.parse('2026-11-08T16:00:00Z')), true);
});
