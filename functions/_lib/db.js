export function nowIso() { return new Date().toISOString(); }

export function codeFor(index) { return 'P' + String(index + 1).padStart(2, '0'); }

export async function getSetting(db, key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : fallback;
}

export async function setSetting(db, key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value)).run();
}

// Players ordered by id, with public code attached. Includes email/token/photo: callers strip.
export async function listPlayers(db) {
  const { results } = await db.prepare('SELECT id, name, company, email, photo, token, created_at, grp FROM players ORDER BY id').all();
  return results.map((p, i) => ({ ...p, code: codeFor(i) }));
}

export async function listGames(db) {
  const { results } = await db.prepare('SELECT * FROM games ORDER BY round, slot, id').all();
  return results;
}

export function publicPlayer(p) {
  return { id: p.id, code: p.code, name: p.name, company: p.company, grp: p.grp || null, hasPhoto: !!p.photo };
}

export function publicGame(g) {
  return { id: g.id, round: g.round, slot: g.slot, p1: g.p1, p2: g.p2, result: g.result, status: g.status, confirmedAt: g.confirmed_at };
}
