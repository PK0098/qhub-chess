// Pure tournament logic. No I/O. Results are stored from p1's perspective:
// '1-0' p1 won, '0-1' p2 won, '1/2' draw.

// Small seeded PRNG so a group draw can be reproduced from settings.seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The two groups, named after two Armenian greats. Keys are what `players.grp` stores.
export const GROUPS = {
  P: { name: 'Petrosian', full: 'Group Petrosian' },
  A: { name: 'Aronian', full: 'Group Aronian' },
};

// Random split into two groups. `lots` is the shuffled order (P first) and
// doubles as the drawing-of-lots order for tiebreaks.
export function splitGroups(ids, seed) {
  const lots = shuffle(ids, mulberry32(seed));
  const half = Math.ceil(lots.length / 2);
  return { lots, P: lots.slice(0, half), A: lots.slice(half) };
}

// Round 1: every pair inside each group, slots running across P then A.
export function groupPairings(P, A) {
  const games = [];
  let slot = 0;
  for (const ids of [P, A]) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) games.push({ round: 1, slot: slot++, p1: ids[i], p2: ids[j] });
    }
  }
  return games;
}

export function winnerOf(game) {
  if (game.status !== 'confirmed') return null;
  if (game.result === '1-0') return game.p1;
  if (game.result === '0-1') return game.p2;
  return null;
}

function tally(ids, games) {
  const rows = new Map(ids.map((id) => [id, { id, played: 0, w: 0, d: 0, l: 0, points: 0, form: [] }]));
  const done = games
    .filter((g) => g.status === 'confirmed' && g.result && rows.has(g.p1) && rows.has(g.p2))
    .sort((a, b) => String(a.confirmed_at).localeCompare(String(b.confirmed_at)));
  for (const g of done) {
    const a = rows.get(g.p1), b = rows.get(g.p2);
    a.played++; b.played++;
    if (g.result === '1-0') { a.w++; b.l++; a.form.push('W'); b.form.push('L'); }
    else if (g.result === '0-1') { b.w++; a.l++; b.form.push('W'); a.form.push('L'); }
    else { a.d++; b.d++; a.form.push('D'); b.form.push('D'); }
  }
  for (const r of rows.values()) r.points = r.w * 3 + r.d;
  return rows;
}

// Ordered group table. Tiebreak: points, head-to-head points among exactly the
// tied players, wins, then position in `lots` (earlier wins). Only round-1
// games between members of `ids` count.
export function groupTable(ids, games, lots) {
  const group = games.filter((g) => g.round === 1);
  const rows = [...tally(ids, group).values()];
  const lot = (id) => { const i = lots.indexOf(id); return i === -1 ? Infinity : i; };
  rows.sort((a, b) => b.points - a.points);
  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j].points === rows[i].points) j++;
    const cluster = rows.slice(i, j);
    if (cluster.length > 1) {
      const h2h = tally(cluster.map((r) => r.id), group);
      cluster.sort((a, b) => h2h.get(b.id).points - h2h.get(a.id).points || b.w - a.w || lot(a.id) - lot(b.id));
    }
    out.push(...cluster);
    i = j;
  }
  return out.map((r) => ({ ...r, form: r.form.slice(-5) }));
}

// Round 2: P1 vs A2, A1 vs P2. Tables are ordered rows from groupTable.
export function semiPairings(tableP, tableA) {
  return [
    { round: 2, slot: 0, p1: tableP[0].id, p2: tableA[1].id },
    { round: 2, slot: 1, p1: tableA[0].id, p2: tableP[1].id },
  ];
}

// Knockout rounds (2 = semis, 3 = final slot 0 / third place slot 1) are series.
// In every knockout game p1 has White. Games 1 and 2 swap colours and score
// 1 / ½ / 0; the higher score goes through. At 1–1 a game 3 (Armageddon) is
// added with random colours, and a draw there sends Black (p2) through.
// A game's number in its series is its order by id.

// Games 1 and 2 of a series between a and b (a has White first).
export function seriesLegs(round, slot, a, b) {
  return [{ round, slot, p1: a, p2: b }, { round, slot, p1: b, p2: a }];
}

// Game 3 of a series, colours by coin toss. rand: () => [0, 1).
export function deciderLeg(series, rand = Math.random) {
  const [w, bl] = rand() < 0.5 ? [series.a, series.b] : [series.b, series.a];
  return { round: series.round, slot: series.slot, p1: w, p2: bl };
}

// State of one series, or null if it has no games yet.
// score: [a, b] including the decider. winner/loser: ids once decided.
export function seriesOf(games, round, slot) {
  const legs = games.filter((g) => g.round === round && g.slot === slot).sort((x, y) => x.id - y.id);
  if (!legs.length) return null;
  const a = legs[0].p1, b = legs[0].p2;
  const done = (g) => g && g.status === 'confirmed' && g.result;
  const pts = { [a]: 0, [b]: 0 };
  for (const g of legs.slice(0, 2).filter(done)) {
    if (g.result === '1/2') { pts[a] += 0.5; pts[b] += 0.5; } else pts[winnerOf(g)] += 1;
  }
  let winner = null, needDecider = false;
  if (legs.length >= 2 && legs.slice(0, 2).every(done)) {
    if (pts[a] !== pts[b]) winner = pts[a] > pts[b] ? a : b;
    else {
      needDecider = true;
      const d = legs[2];
      if (done(d)) { winner = d.result === '1-0' ? d.p1 : d.p2; pts[winner] += 1; }
    }
  }
  return {
    round, slot, a, b, legs, needDecider, winner,
    loser: winner === null ? null : winner === a ? b : a,
    score: [pts[a], pts[b]],
    played: legs.filter(done).length,
  };
}

// Round 3: final (slot 0) between semi winners, third place (slot 1) between
// semi losers. Null until both semi series are decided.
export function finalPairings(games) {
  const s = [seriesOf(games, 2, 0), seriesOf(games, 2, 1)];
  if (s.some((x) => !x || x.winner === null)) return null;
  return [...seriesLegs(3, 0, s[0].winner, s[1].winner), ...seriesLegs(3, 1, s[0].loser, s[1].loser)];
}

export function toP1Result(youAre, outcome) {
  if (outcome === 'draw') return '1/2';
  if (outcome !== 'win' && outcome !== 'loss') throw new Error('Invalid outcome');
  const p1Wins = (youAre === 'p1') === (outcome === 'win');
  return p1Wins ? '1-0' : '0-1';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]*$/;

export function validateRegistration(body) {
  const b = body || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40) throw new Error('Name must be 1 to 40 characters');
  let company = String(b.company || '').trim().replace(/\s+/g, ' ');
  if (!company) company = 'Freelance';
  if (company.length > 40) throw new Error('Company must be at most 40 characters');
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) throw new Error('Please enter a valid email');
  let photo = b.photo ? String(b.photo) : null;
  if (photo) {
    if (photo.length > 80000) throw new Error('Photo is too large');
    if (!PHOTO_RE.test(photo)) throw new Error('Photo must be a JPEG, PNG or WebP image');
  }
  return { name, company, email, photo };
}
