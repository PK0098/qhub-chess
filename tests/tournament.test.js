import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitGroups, groupPairings, groupTable, semiPairings, finalPairings, winnerOf, toP1Result, validateRegistration,
  seriesLegs, seriesOf, deciderLeg,
} from '../functions/_lib/tournament.js';

const conf = (p1, p2, result, round = 1, slot = 0, at = '2026-10-01') => ({ round, slot, p1, p2, result, status: 'confirmed', confirmed_at: at });

// The split must be a fair coin with a memory: same seed, same groups, so a
// re-run of close can never silently reshuffle people.
test('splitGroups is deterministic per seed and sizes are ceil/floor', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7];
  const a = splitGroups(ids, 42), b = splitGroups(ids, 42), c = splitGroups(ids, 43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.lots, c.lots, 'a different seed should shuffle differently');
  assert.equal(a.P.length, 4); assert.equal(a.A.length, 3);
  assert.deepEqual([...a.P, ...a.A].sort((x, y) => x - y), ids, 'every player lands in exactly one group');
  assert.deepEqual(a.lots, [...a.P, ...a.A], 'lots order is the shuffled order, P first');
});

// Group stage is a league inside each group only: no cross-group games.
test('groupPairings pairs everyone once inside each group with running slots', () => {
  const games = groupPairings([1, 2, 3], [4, 5, 6, 7]);
  assert.equal(games.length, 3 + 6);
  const P = new Set([1, 2, 3]);
  for (const g of games) {
    assert.equal(g.round, 1);
    assert.equal(P.has(g.p1), P.has(g.p2), 'cross-group pairing ' + g.p1 + '-' + g.p2);
  }
  assert.deepEqual(games.map((g) => g.slot), [...Array(9).keys()]);
  assert.equal(new Set(games.map((g) => [g.p1, g.p2].sort().join('-'))).size, 9);
});

test('groupTable: points first (3/1/0), draws count once each', () => {
  const rows = groupTable([1, 2, 3], [conf(1, 2, '1-0'), conf(2, 3, '1/2')], [1, 2, 3]);
  assert.deepEqual(rows.map((r) => [r.id, r.points, r.played]), [[1, 3, 1], [2, 1, 2], [3, 1, 1]]);
});

// Two players tied on points: the one who beat the other advances, even with fewer wins overall.
test('groupTable: head-to-head beats total wins on equal points', () => {
  // 1: W W L L = 6 pts with 2 wins. 2: W D D D = 6 pts with 1 win. 2 beat 1, so 2 is first.
  const g = [conf(1, 2, '0-1'), conf(1, 3, '1-0'), conf(1, 4, '1-0'), conf(2, 3, '1/2'), conf(2, 4, '1/2'), conf(2, 5, '1/2'), conf(1, 5, '0-1')];
  const rows = groupTable([1, 2, 3, 4, 5], g, [1, 2, 3, 4, 5]);
  assert.equal(rows[0].points, rows[1].points);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.id), [2, 1]);
});

// Three-way tie: head-to-head is a mini table among the three, not pairwise.
test('groupTable: three-way tie resolved by mini table, then wins, then lots', () => {
  // 1 beat 2, 2 beat 3, 3 beat 1 (circular, 3 pts each in mini table). All also beat 4.
  const g = [conf(1, 2, '1-0'), conf(2, 3, '1-0'), conf(3, 1, '1-0'), conf(1, 4, '1-0'), conf(2, 4, '1-0'), conf(3, 4, '1-0')];
  const rows = groupTable([1, 2, 3, 4], g, [3, 1, 2, 4]);
  assert.deepEqual(rows.map((r) => r.id), [3, 1, 2, 4], 'circular tie with equal wins falls back to lots order');
  // Break it with wins: 2 has an extra win over 5, others drew 5.
  const g2 = [...g, conf(2, 5, '1-0'), conf(1, 5, '1/2'), conf(3, 5, '1/2'), conf(4, 5, '1/2')];
  // Points: 1 = 3+3+1 = 7, 2 = 3+3+3 = 9, 3 = 7. Not tied anymore; lots decide between 1 and 3 → 3 first.
  const rows2 = groupTable([1, 2, 3, 4, 5], g2, [3, 1, 2, 4, 5]);
  assert.deepEqual(rows2.map((r) => r.id).slice(0, 3), [2, 3, 1]);
});

test('groupTable: form keeps the last five results in confirmation order', () => {
  // Six games between 1 and 2; odd games won by 1, even games by 2, confirmed on successive days.
  const g = [1, 2, 3, 4, 5, 6].map((i) => conf(1, 2, i % 2 ? '1-0' : '0-1', 1, 0, '2026-10-0' + i));
  const rows = groupTable([1, 2], g, [1, 2]);
  assert.deepEqual(rows[0].form, ['L', 'W', 'L', 'W', 'L'], 'first game dropped; most recent (a loss for 1) last');
});

test('groupTable ignores unconfirmed and out-of-group games', () => {
  const rows = groupTable([1, 2], [{ ...conf(1, 2, '1-0'), status: 'reported' }, conf(1, 9, '1-0')], [1, 2]);
  assert.deepEqual(rows.map((r) => r.points), [0, 0]);
});

// Crossover: group winners meet the other group's runner-up.
test('semiPairings crosses P1-A2 and A1-P2', () => {
  const P = [{ id: 11 }, { id: 12 }, { id: 13 }], A = [{ id: 21 }, { id: 22 }];
  assert.deepEqual(semiPairings(P, A), [
    { round: 2, slot: 0, p1: 11, p2: 22 },
    { round: 2, slot: 1, p1: 21, p2: 12 },
  ]);
});

// A knockout series: games 1 and 2 swap colours, so each player gets White once.
let gid = 0;
const leg = (p1, p2, result, round = 2, slot = 0, status = 'confirmed') => ({ id: ++gid, round, slot, p1, p2, result, status });

test('seriesLegs gives each player White once (p1 = White)', () => {
  assert.deepEqual(seriesLegs(2, 1, 21, 12), [{ round: 2, slot: 1, p1: 21, p2: 12 }, { round: 2, slot: 1, p1: 12, p2: 21 }]);
});

test('seriesOf: 2-0 and 1½-½ are decided after two games, no game 3', () => {
  const s = seriesOf([leg(11, 22, '1-0'), leg(22, 11, '0-1')], 2, 0);
  assert.deepEqual([s.winner, s.loser, s.score, s.needDecider], [11, 22, [2, 0], false]);
  const d = seriesOf([leg(11, 22, '1/2'), leg(22, 11, '1-0')], 2, 0);
  assert.deepEqual([d.winner, d.score], [22, [0.5, 1.5]], 'a draw is half a point, so one win plus a draw goes through');
});

// Busy people: never more than 3 games, and game 1 alone never decides.
test('seriesOf: one game in is never decided, even a win', () => {
  const s = seriesOf([leg(11, 22, '1-0'), leg(22, 11, null, 2, 0, 'pending')], 2, 0);
  assert.equal(s.winner, null);
  assert.equal(s.needDecider, false);
});

test('seriesOf: 1-1 or two draws needs an Armageddon; a drawn Armageddon goes to Black', () => {
  const tied = [leg(11, 22, '1/2'), leg(22, 11, '1/2')];
  assert.equal(seriesOf(tied, 2, 0).needDecider, true);
  assert.equal(seriesOf(tied, 2, 0).winner, null);
  // Game 3 with 11 as Black (p2): a draw means 11 advances.
  const s = seriesOf([...tied, leg(22, 11, '1/2')], 2, 0);
  assert.deepEqual([s.winner, s.loser, s.score], [11, 22, [2, 1]]);
  const w = seriesOf([leg(11, 22, '1-0'), leg(22, 11, '1-0'), leg(22, 11, '1-0')], 2, 0);
  assert.equal(w.winner, 22, 'White winning the Armageddon advances');
});

test('deciderLeg uses the coin for colours', () => {
  const s = { round: 2, slot: 0, a: 11, b: 22 };
  assert.deepEqual(deciderLeg(s, () => 0.1), { round: 2, slot: 0, p1: 11, p2: 22 });
  assert.deepEqual(deciderLeg(s, () => 0.9), { round: 2, slot: 0, p1: 22, p2: 11 });
});

test('finalPairings waits for both semi series, then pairs winners and losers', () => {
  const games = [leg(11, 22, '1-0', 2, 0), leg(22, 11, '0-1', 2, 0), leg(21, 12, '0-1', 2, 1), leg(12, 21, '1/2', 2, 1, 'reported')];
  assert.equal(finalPairings(games), null);
  games[3].status = 'confirmed';
  assert.deepEqual(finalPairings(games), [
    { round: 3, slot: 0, p1: 11, p2: 12 }, { round: 3, slot: 0, p1: 12, p2: 11 },
    { round: 3, slot: 1, p1: 22, p2: 21 }, { round: 3, slot: 1, p1: 21, p2: 22 },
  ]);
});

test('winnerOf follows p1-perspective result and needs confirmation', () => {
  assert.equal(winnerOf(conf(1, 2, '1-0')), 1);
  assert.equal(winnerOf(conf(1, 2, '0-1')), 2);
  assert.equal(winnerOf(conf(1, 2, '1/2')), null);
  assert.equal(winnerOf({ ...conf(1, 2, '1-0'), status: 'reported' }), null);
});

// Results are stored from p1's perspective; a p2 "win" must flip.
test('toP1Result flips for p2', () => {
  assert.equal(toP1Result('p1', 'win'), '1-0');
  assert.equal(toP1Result('p2', 'win'), '0-1');
  assert.equal(toP1Result('p2', 'loss'), '1-0');
  assert.equal(toP1Result('p1', 'draw'), '1/2');
  assert.throws(() => toP1Result('p1', 'meh'));
});

test('validateRegistration normalises and rejects bad input', () => {
  const v = validateRegistration({ name: '  Ani   Petrosyan ', company: '', email: 'ANI@Example.com' });
  assert.deepEqual(v, { name: 'Ani Petrosyan', company: 'Freelance', email: 'ani@example.com', photo: null });
  assert.throws(() => validateRegistration({ name: '', email: 'a@b.c' }));
  assert.throws(() => validateRegistration({ name: 'x', email: 'nope' }));
  assert.throws(() => validateRegistration({ name: 'x', email: 'a@b.c', photo: 'data:text/html;base64,xx' }));
});
