import { json, bad, handle, requireAdmin } from '../../_lib/http.js';
import { getSetting, setSetting, nowIso } from '../../_lib/db.js';
import { advanceGroups } from '../../_lib/sweep.js';

// Ends the group stage now, whatever is left on the board. Reported results
// count (they would auto-confirm anyway); pending and disputed games become
// 'closed': locked, not played, worth nothing. Then the semis are created.
export const onRequestPost = handle(async ({ request, env }) => {
  requireAdmin(request, env);
  const db = env.DB;
  if ((await getSetting(db, 'phase')) !== 'play' || (await getSetting(db, 'format')) !== 'groups') throw bad('The group stage is not running', 409);
  if (await getSetting(db, 'groups_ended_at')) throw bad('The group stage has already ended', 409);
  const now = nowIso();
  const [counted, closed] = await db.batch([
    db.prepare("UPDATE games SET status = 'confirmed', confirmed_at = ? WHERE round = 1 AND status = 'reported'").bind(now),
    db.prepare("UPDATE games SET status = 'closed' WHERE round = 1 AND status IN ('pending', 'disputed')"),
  ]);
  await setSetting(db, 'groups_ended_at', now);
  const { advanced } = await advanceGroups(db, env);
  return json({ ok: true, counted: counted.meta.changes, closed: closed.meta.changes, semis: advanced.length });
});
