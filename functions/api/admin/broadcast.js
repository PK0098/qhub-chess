import { json, bad, readJson, handle, requireAdmin } from '../../_lib/http.js';
import { getSetting, setSetting, listPlayers, nowIso } from '../../_lib/db.js';
import { sendMany } from '../../_lib/mail.js';
import { broadcasts } from '../../_lib/broadcasts.js';

const sentKey = (id) => `broadcast_sent:${id}`;
// The format-change email predates this endpoint and was tracked under `announced_at`.
const lastSent = async (db, id) => (await getSetting(db, sentKey(id))) || (id === 'formatChange' ? await getSetting(db, 'announced_at') : null);

// GET: the templates available, with when each was last sent.
export const onRequestGet = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const list = [];
  for (const [id, b] of Object.entries(broadcasts)) list.push({ id, label: b.label, sentAt: await lastSent(env.DB, id) });
  return json({ templates: list });
});

// POST { template, preview?: true, force?: true, only?: [emails] }
//   preview: returns the first matching player's email (subject + html), sends nothing.
//   Sending a template twice needs force. `only` limits recipients (for resends) and doesn't mark it as sent.
export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  const body = await readJson(request);
  const b = broadcasts[body.template];
  if (!b) throw bad('Unknown template', 400);
  const all = await listPlayers(db);
  let players = all;
  if (Array.isArray(body.only) && body.only.length) {
    const want = new Set(body.only.map((e) => String(e).toLowerCase()));
    players = all.filter((p) => want.has(p.email.toLowerCase()));
    if (!players.length) throw bad('No registered player matches `only`', 400);
  }
  if (!players.length) throw bad('No players yet', 409);
  const ctx = await b.prepare(db, env, all);
  if (body.preview) {
    const m = b.build(env, ctx, players[0]);
    return json({ to: players[0].email, subject: m.subject, html: m.html });
  }
  const already = await lastSent(db, body.template);
  if (already && body.force !== true) throw bad(`Already sent at ${already}`, 409);
  const r = await sendMany(env, players.map((p) => ({ to: p.email, ...b.build(env, ctx, p) })));
  if (!body.only) await setSetting(db, sentKey(body.template), nowIso());
  return json({ ok: r.failed.length === 0, sent: r.sent, failed: r.failed });
});
