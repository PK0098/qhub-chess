import { json, bad, readJson, handle, requireAdmin } from '../../_lib/http.js';
import { getSetting, setSetting, listPlayers, nowIso } from '../../_lib/db.js';
import { sendMany, templates } from '../../_lib/mail.js';

// One-off: tell every registered player about the format change. Sends are
// throttled and the response lists any address Resend rejected.
export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  const body = await readJson(request);
  const already = await getSetting(db, 'announced_at');
  if (already && body.force !== true) throw bad(`Already announced at ${already}`, 409);
  let players = await listPlayers(db);
  // Optional resend to a subset: { force: true, only: ["a@x", "b@y"] }.
  if (Array.isArray(body.only) && body.only.length) {
    const want = new Set(body.only.map((e) => String(e).toLowerCase()));
    players = players.filter((p) => want.has(p.email.toLowerCase()));
    if (!players.length) throw bad('No registered player matches `only`', 400);
  }
  const r = await sendMany(env, players.map((p) => ({ to: p.email, ...templates.formatChange(env, { player: p }) })));
  if (!body.only) await setSetting(db, 'announced_at', nowIso());
  return json({ ok: r.failed.length === 0, sent: r.sent, failed: r.failed });
});
