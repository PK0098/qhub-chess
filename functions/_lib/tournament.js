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

// Round 3: final (slot 0) between semi winners, third place (slot 1) between
// semi losers. Null until both semis are confirmed with a winner.
export function finalPairings(semis) {
  const s = semis.filter((g) => g.round === 2).sort((a, b) => a.slot - b.slot);
  if (s.length !== 2) return null;
  const w = s.map(winnerOf);
  if (w.some((x) => x === null)) return null;
  const l = s.map((g, i) => (w[i] === g.p1 ? g.p2 : g.p1));
  return [
    { round: 3, slot: 0, p1: w[0], p2: w[1] },
    { round: 3, slot: 1, p1: l[0], p2: l[1] },
  ];
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
