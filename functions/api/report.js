import { json, bad, readJson, handle } from '../_lib/http.js';
import { getSetting, nowIso } from '../_lib/db.js';
import { playerByToken, gameForPlayer } from '../_lib/players.js';
import { toP1Result } from '../_lib/tournament.js';
import { sendMail, templates, outcomeText } from '../_lib/mail.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const db = env.DB;
  const body = await readJson(request);
  const { me, byId } = await playerByToken(db, body.t);
  if ((await getSetting(db, 'phase')) !== 'play') throw bad('The tournament is not in play', 403);
  const g = await gameForPlayer(db, body.g, me);
  if (g.p2 === null) throw bad('This is a bye', 400);
  if (g.status === 'confirmed') throw bad('This result is already confirmed', 409);
  if (g.status === 'disputed') throw bad('This game is disputed; the organizer will settle it', 409);
  if (g.status === 'reported' && g.reported_by !== me.id) throw bad('Your opponent already reported; please confirm or dispute instead', 409);
  if (body.result === 'draw' && g.round >= 2) throw bad('No draws in the knockout: play again until someone wins', 400);
  let result;
  try { result = toP1Result(g.p1 === me.id ? 'p1' : 'p2', body.result); } catch { throw bad('Result must be win, loss or draw', 400); }

  await db.prepare("UPDATE games SET result = ?, status = 'reported', reported_by = ?, reported_at = ? WHERE id = ?")
    .bind(result, me.id, nowIso(), g.id).run();

  const oppId = g.p1 === me.id ? g.p2 : g.p1;
  const opp = byId.get(oppId);
  const p1 = byId.get(g.p1), p2 = byId.get(g.p2);
  const text = outcomeText({ ...g, result }, p1, p2);
  await sendMail(env, { to: opp.email, ...templates.reported(env, { player: opp, reporter: me, outcomeText: text, gameId: g.id }) });
  return json({ ok: true, status: 'reported', result });
});
