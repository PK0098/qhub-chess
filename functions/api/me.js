import { json, handle } from '../_lib/http.js';
import { getSetting, publicPlayer } from '../_lib/db.js';
import { playerByToken } from '../_lib/players.js';
import { sweep } from '../_lib/sweep.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const db = env.DB;
  const t = new URL(request.url).searchParams.get('t');
  const { me, byId } = await playerByToken(db, t);
  await sweep(db, env);
  const [phase, format] = await Promise.all([getSetting(db, 'phase'), getSetting(db, 'format')]);
  const { results } = await db.prepare('SELECT * FROM games WHERE p1 = ? OR p2 = ? ORDER BY round DESC, slot').bind(me.id, me.id).all();
  const games = results.map((g) => {
    const youAre = g.p1 === me.id ? 'p1' : 'p2';
    const oppId = youAre === 'p1' ? g.p2 : g.p1;
    const opp = oppId === null ? null : byId.get(oppId);
    const active = phase === 'play';
    return {
      id: g.id, round: g.round, slot: g.slot, youAre, result: g.result, status: g.status,
      opponent: opp ? publicPlayer(opp) : null,
      reportedByYou: g.reported_by === me.id,
      canReport: active && opp !== null && (g.status === 'pending' || (g.status === 'reported' && g.reported_by === me.id)),
      canConfirm: active && g.status === 'reported' && g.reported_by !== me.id,
    };
  });
  return json({ phase, format, player: publicPlayer(me), games });
});
