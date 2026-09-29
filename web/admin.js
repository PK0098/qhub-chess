(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let key = sessionStorage.getItem('adminKey') || new URLSearchParams(location.search).get('key') || '';
  if (new URLSearchParams(location.search).get('key')) history.replaceState(null, '', location.pathname);

  const api = async (path, body) => {
    const r = await fetch('/api/admin/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || r.statusText), { status: r.status });
    return d;
  };
  const msg = (el, text, cls) => { el.innerHTML = text ? `<div class="msg ${cls || ''}">${text}</div>` : ''; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function load() {
    if (!key) { $('login').hidden = false; $('app').hidden = true; return; }
    try {
      const d = await api('overview');
      sessionStorage.setItem('adminKey', key);
      $('login').hidden = true; $('app').hidden = false;
      render(d);
    } catch (e) {
      if (e.status === 401) { key = ''; sessionStorage.removeItem('adminKey'); $('login').hidden = false; $('app').hidden = true; msg($('login-msg'), 'Wrong key.', 'bad'); }
      else msg($('msg'), esc(e.message), 'bad');
    }
  }

  function render(d) {
    const byId = new Map(d.players.map((p) => [p.id, p]));
    const name = (id) => id === null ? '<i>bye</i>' : esc((byId.get(id) || {}).name || '?');
    const phase = d.settings.phase || 'registration';
    $('kv').innerHTML = `
      <div>Phase<b>${esc(phase)}</b></div><div>Format<b>${d.settings.format ? 'groups' : '—'}</b></div>
      <div>Players<b>${d.players.length}</b></div><div>Games confirmed<b>${d.games.filter((g) => g.status === 'confirmed' && g.p2 !== null).length} / ${d.games.filter((g) => g.p2 !== null).length}</b></div>
      <div>Groups P / A<b>${d.players.filter((p) => p.grp === 'P').length} / ${d.players.filter((p) => p.grp === 'A').length}</b></div>
      <div>Flyer scans<b>${esc(d.settings.flyer_scans || 0)}</b></div><div>Announced<b style="font-size:12px">${esc(d.settings.announced_at ? d.settings.announced_at.slice(0, 16).replace('T', ' ') : 'not yet')}</b></div><div>Closes<b style="font-size:13px">${esc(d.vars.CLOSE_DATE)}</b></div>
      <div>Mail from<b style="font-size:12px">${esc(d.vars.MAIL_FROM)}</b></div><div>Site<b style="font-size:12px">${esc(d.vars.SITE_URL)}</b></div>`;
    $('close-btn').disabled = phase !== 'registration' || d.players.length < 4;
    $('announce-btn').textContent = d.settings.announced_at ? 'Announce format change again' : 'Announce format change';

    $('pcount').textContent = d.players.length;
    $('players').innerHTML = `<tr><th>Code</th><th>Name</th><th>Grp</th><th>Company</th><th>Email</th><th>Photo</th><th></th></tr>` +
      d.players.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.grp || '—')}</td><td>${esc(p.company)}</td><td>${esc(p.email)}</td><td>${p.hasPhoto ? '✓' : '—'}</td>
        <td>${phase === 'registration' ? `<button class="btn btn-line sm" data-remove="${p.id}">Remove</button>` : ''}</td></tr>`).join('');

    $('gcount').textContent = d.games.length;
    $('games').innerHTML = `<tr><th>#</th><th>Round</th><th>White / p1</th><th>Black / p2</th><th>Status</th><th>Result</th><th>Set result</th></tr>` +
      d.games.map((g) => `<tr><td>${g.id}</td><td>${g.round}</td><td>${name(g.p1)}</td><td>${name(g.p2)}</td>
        <td><span class="tag ${esc(g.status)}">${esc(g.status)}</span>${g.reported_by ? `<div style="font-size:11px;color:#5c5548">by ${name(g.reported_by)}</div>` : ''}</td>
        <td>${esc(g.result || '—')}</td>
        <td>${g.p2 === null ? '' : `<select data-res="${g.id}"><option value="1-0">1-0 (p1 wins)</option><option value="0-1">0-1 (p2 wins)</option>${g.round >= 2 ? '' : '<option value="1/2">½-½</option>'}</select> <button class="btn btn-dark sm" data-resolve="${g.id}">Set</button>`}</td></tr>`).join('');

    const ob = d.outbox || [];
    $('outbox-box').hidden = ob.length === 0;
    $('ocount').textContent = ob.length;
    $('outbox').innerHTML = `<tr><th>#</th><th>When</th><th>To</th><th>Subject</th><th></th></tr>` +
      ob.map((m) => `<tr><td>${m.id}</td><td>${esc(m.created_at.slice(11, 19))}</td><td>${esc(m.to_addr)}</td><td>${esc(m.subject)}</td><td><button class="btn btn-line sm" data-mail="${m.id}">Open</button></td></tr>`).join('');
    $('outbox').querySelectorAll('[data-mail]').forEach((b) => b.onclick = () => {
      const m = ob.find((x) => x.id === Number(b.dataset.mail));
      const v = $('outbox-view'); v.hidden = false; v.srcdoc = m.html; v.scrollIntoView({ behavior: 'smooth' });
    });

    $('players').querySelectorAll('[data-remove]').forEach((b) => b.onclick = async () => {
      if (!confirm('Remove this player?')) return;
      try { await api('remove', { id: Number(b.dataset.remove) }); load(); } catch (e) { msg($('msg'), esc(e.message), 'bad'); }
    });
    $('games').querySelectorAll('[data-resolve]').forEach((b) => b.onclick = async () => {
      const id = Number(b.dataset.resolve);
      const result = $('games').querySelector(`[data-res="${id}"]`).value;
      if (!confirm(`Set game #${id} to ${result} and confirm it? Both players get an email.`)) return;
      try { await api('resolve', { g: id, result }); msg($('msg'), `Game #${id} set to ${result}.`, 'ok'); load(); } catch (e) { msg($('msg'), esc(e.message), 'bad'); }
    });
  }

  $('key-go').onclick = () => { key = $('key').value.trim(); load(); };
  $('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('key-go').click(); });
  $('logout').onclick = (e) => { e.preventDefault(); sessionStorage.removeItem('adminKey'); key = ''; load(); };
  $('refresh').onclick = load;
  $('close-btn').onclick = async () => {
    if (!confirm('Close registration now? This draws the two groups, creates all group games and emails every player. It cannot be undone.')) return;
    $('close-btn').disabled = true;
    try { const r = await api('close', {}); msg($('msg'), `Closed. ${r.players} players: Petrosian ${r.groups.P}, Aronian ${r.groups.A}. ${r.games} games created. Emails sent: ${r.mail.sent}.${r.mail.failed.length ? ' FAILED for: ' + esc(r.mail.failed.join(', ')) : ''}`, r.mail.failed.length ? 'bad' : 'ok'); }
    catch (e) { msg($('msg'), esc(e.message), 'bad'); }
    load();
  };
  $('announce-btn').onclick = async () => {
    const again = $('announce-btn').textContent.endsWith('again');
    if (!confirm(`Send the format-change email to every registered player${again ? ' AGAIN' : ''}?`)) return;
    $('announce-btn').disabled = true;
    try { const r = await api('announce', { force: again }); msg($('msg'), r.failed.length ? `Sent to ${r.sent}. FAILED for: ${esc(r.failed.join(', '))}` : `Announcement sent to ${r.sent} players.`, r.failed.length ? 'bad' : 'ok'); }
    catch (e) { msg($('msg'), esc(e.message), 'bad'); }
    load();
  };
  $('test-go').onclick = async () => {
    msg($('test-msg'), 'Sending…');
    try { const r = await api('test-email', { to: $('test-to').value.trim() }); msg($('test-msg'), 'Sent. Resend id: ' + esc(r.id), 'ok'); }
    catch (e) { msg($('test-msg'), esc(e.message), 'bad'); }
  };
  load();
})();
