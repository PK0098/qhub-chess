import { groupTable, semiPairings, finalPairings, seriesLegs, seriesOf, deciderLeg } from './tournament.js';
import { getSetting, setSetting, listGames, listPlayers, nowIso } from './db.js';
import { sendMany, templates } from './mail.js';

// Auto-confirm stale reports, then create the next stage (semis, final +
// third place) when the previous one is complete, emailing the players
// involved. Safe to call on every request: every step checks the database
// before inserting.
export async function sweep(db, env) {
  const hours = Number(env.CONFIRM_HOURS || 48);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  await db.prepare("UPDATE games SET status = 'confirmed', confirmed_at = ? WHERE status = 'reported' AND reported_at < ?")
    .bind(nowIso(), cutoff).run();

  const format = await getSetting(db, 'format');
  const phase = await getSetting(db, 'phase');
  if (format !== 'groups' || phase !== 'play') return { advanced: [] };
  return advanceGroups(db, env);
}

// Ordered tables for both groups, from the players' grp column.
export async function groupTables(db, players, games) {
  const lots = JSON.parse((await getSetting(db, 'lots')) || '[]');
  const ids = (g) => players.filter((p) => p.grp === g).map((p) => p.id);
  return { P: groupTable(ids('P'), games, lots), A: groupTable(ids('A'), games, lots) };
}

export async function advanceGroups(db, env) {
  const games = await listGames(db);
  const players = await listPlayers(db);
  const round = (r) => games.filter((g) => g.round === r);
  // 'closed' = left unplayed when the organizer ended the group stage.
  const groupOver = (list) => list.length > 0 && list.every((g) => g.status === 'confirmed' || g.status === 'closed');
  const ins = db.prepare('INSERT INTO games (round, slot, p1, p2, status) VALUES (?, ?, ?, ?, ?)');
  const firstLegs = (list) => list.filter((g, i, all) => all.findIndex((x) => x.slot === g.slot) === i);

  // 1. Group stage over → semi series (games 1 and 2 of each).
  if (round(2).length === 0) {
    if (!groupOver(round(1))) return { advanced: [] };
    const tables = await groupTables(db, players, games);
    const legs = semiPairings(tables.P, tables.A).flatMap((s) => seriesLegs(s.round, s.slot, s.p1, s.p2));
    await db.batch(legs.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')));
    const created = (await listGames(db)).filter((g) => g.round === 2);
    await emailPairings(db, env, firstLegs(created), 'semi');
    return { advanced: created };
  }

  // 2. A series at 1–1 after two games → game 3 (Armageddon), colours by coin toss.
  const series = [[2, 0], [2, 1], [3, 0], [3, 1]].map(([r, s]) => seriesOf(games, r, s)).filter(Boolean);
  const deciders = series.filter((s) => s.needDecider && s.legs.length === 2).map((s) => deciderLeg(s));
  if (deciders.length) {
    await db.batch(deciders.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')));
    const all = await listGames(db);
    const created = deciders.map((d) => all.filter((g) => g.round === d.round && g.slot === d.slot).pop());
    await emailPairings(db, env, created, 'decider');
    return { advanced: created };
  }

  // 3. Both semis decided → final and third-place series.
  if (round(3).length === 0) {
    const next = finalPairings(games);
    if (!next) return { advanced: [] };
    await db.batch(next.map((g) => ins.bind(g.round, g.slot, g.p1, g.p2, 'pending')));
    const created = firstLegs((await listGames(db)).filter((g) => g.round === 3));
    await emailPairings(db, env, created.filter((g) => g.slot === 0), 'final');
    await emailPairings(db, env, created.filter((g) => g.slot === 1), 'third');
    return { advanced: created };
  }

  // 4. Final decided → champion. 5. Both round-3 series decided → done.
  const final = seriesOf(games, 3, 0), third = seriesOf(games, 3, 1);
  const champion = final && final.winner;
  if (champion && !(await getSetting(db, 'champion'))) {
    await setSetting(db, 'champion', champion);
    const champ = players.find((p) => p.id === champion);
    const t = templates.champion(env, { champion: champ });
    await sendMany(env, players.map((p) => ({ to: p.email, ...t })));
  }
  if (champion && third && third.winner) await setSetting(db, 'phase', 'done');
  return { advanced: [] };
}

// Knockout series for the public state: [{ round, slot, a, b, score, winner, played, needDecider }].
export function publicSeries(games) {
  return [[2, 0], [2, 1], [3, 0], [3, 1]].map(([r, s]) => seriesOf(games, r, s)).filter(Boolean)
    .map(({ legs, loser, ...s }) => s);
}

// One email per player listing their games in `games`.
// stage: 'group' | 'semi' | 'final' | 'third' | 'decider'.
export async function emailPairings(db, env, games, stage) {
  const players = await listPlayers(db);
  const byId = new Map(players.map((p) => [p.id, p]));
  const perPlayer = new Map();
  for (const g of games) {
    for (const [me, other] of [[g.p1, g.p2], [g.p2, g.p1]]) {
      const opp = byId.get(other);
      if (!perPlayer.has(me)) perPlayer.set(me, []);
      perPlayer.get(me).push({ id: g.id, white: g.p1 === me, opponent: { name: opp.name, company: opp.company, email: opp.email } });
    }
  }
  const items = [...perPlayer.entries()].map(([id, list]) => {
    const player = byId.get(id);
    return player ? { to: player.email, ...templates.pairings(env, { player, stage, games: list }) } : null;
  }).filter(Boolean);
  return sendMany(env, items);
}
