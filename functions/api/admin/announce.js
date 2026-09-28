import { json, bad, readJson, handle, requireAdmin } from '../../_lib/http.js';
import { getSetting, setSetting, listPlayers, nowIso } from '../../_lib/db.js';
import { sendMail, templates } from '../../_lib/mail.js';

// One-off: tell every registered player about the format change.
export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  const body = await readJson(request);
  const already = await getSetting(db, 'announced_at');
  if (already && body.force !== true) throw bad(`Already announced at ${already}`, 409);
  const players = await listPlayers(db);
  await Promise.all(players.map((p) => sendMail(env, { to: p.email, ...templates.formatChange(env, { player: p }) })));
  await setSetting(db, 'announced_at', nowIso());
  return json({ ok: true, sent: players.length });
});
