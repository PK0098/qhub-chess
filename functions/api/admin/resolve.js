import { json, bad, readJson, handle, requireAdmin } from '../../_lib/http.js';
import { nowIso, listPlayers } from '../../_lib/db.js';
import { sendMail, templates, outcomeText } from '../../_lib/mail.js';
import { sweep } from '../../_lib/sweep.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  const body = await readJson(request);
  if (!['1-0', '0-1', '1/2'].includes(body.result)) throw bad('Result must be 1-0, 0-1 or 1/2');
  const g = await db.prepare('SELECT * FROM games WHERE id = ?').bind(Number(body.g)).first();
  if (!g) throw bad('Unknown game', 404);
  if (body.result === '1/2' && g.round >= 2) throw bad('No draws in the knockout: play again until someone wins', 400);
  await db.prepare("UPDATE games SET result = ?, status = 'confirmed', confirmed_at = ? WHERE id = ?").bind(body.result, nowIso(), g.id).run();
  if (body.notify !== false) {
    const byId = new Map((await listPlayers(db)).map((p) => [p.id, p]));
    const p1 = byId.get(g.p1), p2 = byId.get(g.p2);
    const text = outcomeText({ ...g, result: body.result }, p1, p2);
    await Promise.all([
      sendMail(env, { to: p1.email, ...templates.confirmed(env, { player: p1, opponent: p2, outcomeText: text }) }),
      sendMail(env, { to: p2.email, ...templates.confirmed(env, { player: p2, opponent: p1, outcomeText: text }) }),
    ]);
  }
  await sweep(db, env);
  return json({ ok: true });
});
