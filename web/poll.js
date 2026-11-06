(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('t');
  const initials = (name) => (name || '').trim().split(/\s+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const first = (name) => (name || '').trim().split(/\s+/)[0];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayParts = (key) => { const d = new Date(key + 'T12:00:00'); return { dow: DOW[d.getDay()], num: String(d.getDate()) }; };
  const closesText = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yerevan' }).replace(',', ''); } catch { return iso; } };

  let data = null;        // last server payload
  let picked = [];        // current selection
  let mode = 'everyone';  // tally mode

  async function load() {
    if (!token) return showEmpty('This link is missing its personal code. Open the link from your email.');
    const r = await fetch('/api/poll?t=' + encodeURIComponent(token), { cache: 'no-store' });
    if (!r.ok) return showEmpty(r.status === 404 ? 'We don\'t recognise this link. Open the one from your email.' : 'Something went wrong. Try again in a minute.');
    data = await r.json();
    picked = [...data.mine];
    render();
  }
  function showEmpty(msg) { $('empty').textContent = msg; $('empty').hidden = false; }

  function render() {
    $('app').hidden = false;
    const byId = new Map(data.players.map((p) => [p.id, p]));
    const nm = (id) => (byId.get(id) || {}).name || '?';
    const fin = data.finalists;
    $('pill-text').textContent = data.closed ? 'Poll closed' : 'Poll closes ' + closesText(data.closesAt);
    // Name the matches once both semis are decided; until then say who the final comes from.
    const decided = data.semis.length === 2 && data.semis.every((s) => s.winner !== null);
    const vs = (a, b) => `${esc(a)} <span>vs</span> ${esc(b)}`;
    $('m-final').innerHTML = decided ? vs(nm(data.semis[0].winner), nm(data.semis[1].winner))
      : data.semis.map((s) => `<span>Winner of</span> ${vs(nm(s.a), nm(s.b))}`).join('<br>');
    $('m-bronze').innerHTML = decided ? vs(nm(data.semis[0].loser), nm(data.semis[1].loser)) : '<span>The two semi-final losers</span>';
    $('pick-title').textContent = `Which evenings work for you, ${first(data.player.name)}? Tick all that do.`;
    renderDays();
    renderTally();
    $('foot').textContent = `${data.total} of ${data.players.length} players have voted. ` + (data.closed ? 'Poll closed.' : 'Closes ' + closesText(data.closesAt) + '.');
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function chip(p, selected) {
    const c = document.createElement('span');
    c.className = 'chip' + (p.finalist ? ' fin' : ''); c.title = p.name + (p.finalist ? ' (finalist)' : '');
    if (p.hasPhoto && !selected) c.style.backgroundImage = `url('/api/photo/${p.id}')`; else c.textContent = initials(p.name);
    return c;
  }

  function renderDays() {
    const byId = new Map(data.players.map((p) => [p.id, p]));
    const sameAsSaved = picked.length === data.mine.length && picked.every((d) => data.mine.includes(d));
    $('pick-count').textContent = data.closed ? 'Poll closed' : picked.length === 1 ? '1 evening picked' : `${picked.length} evenings picked`;
    const list = $('days'); list.innerHTML = '';
    for (const key of data.days) {
      const ids = data.votes[key] || [];
      const selected = picked.includes(key);
      const { dow, num } = dayParts(key);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'day'; b.setAttribute('aria-pressed', String(selected)); b.disabled = data.closed;
      const voters = ids.map((id) => byId.get(id)).filter(Boolean).sort((a, c) => (c.finalist ? 1 : 0) - (a.finalist ? 1 : 0));
      const all = data.allFinalists.includes(key);
      b.innerHTML = `<div class="d-date"><span class="d-dow">${dow}</span><span class="d-num">${num}</span></div>
        <div class="d-mid"><div class="d-count"><span>${ids.length === 0 ? 'Nobody yet' : ids.length === 1 ? '1 can make it' : ids.length + ' can make it'}</span>${all ? '<span class="badge">♛ Works for all four</span>' : ''}</div><div class="chips"></div></div>
        <span class="d-mark" aria-hidden="true">${selected ? '✓' : ''}</span>`;
      const chips = b.querySelector('.chips');
      voters.forEach((p) => chips.appendChild(chip(p, selected)));
      b.onclick = () => {
        if (data.closed) return;
        if (selected) picked = picked.filter((k) => k !== key);
        else picked = [...picked, key];
        renderDays();
      };
      list.appendChild(b);
    }
    const save = $('save');
    save.disabled = data.closed || sameAsSaved;
    save.textContent = data.closed ? 'Poll closed' : sameAsSaved && data.mine.length ? 'Saved ✓' : 'Save my evenings';
    $('save-hint').textContent = data.closed ? 'The poll has closed. Pouya announces the evening by email.' : `Change your mind any time until ${closesText(data.closesAt)}.`;
  }

  async function save() {
    const b = $('save'); const err = $('err'); err.hidden = true;
    b.disabled = true; b.classList.add('loading'); b.textContent = 'Saving…';
    try {
      const r = await fetch('/api/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, days: picked }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = d.error || 'Something went wrong.'; err.hidden = false; }
      else { data = d; picked = [...data.mine]; }
    } catch { err.textContent = 'Network problem. Try again.'; err.hidden = false; }
    b.classList.remove('loading');
    render();
  }

  function renderTally() {
    const byId = new Map(data.players.map((p) => [p.id, p]));
    const fin = data.finalists;
    const only = mode === 'finalists';
    $('seg-all').setAttribute('aria-pressed', String(!only));
    $('seg-fin').setAttribute('aria-pressed', String(only));
    $('tally-hint').textContent = only ? 'Only the four finalists count here. The evening must work for all of them.' : 'Everyone who voted. ♛ marks a finalist. Green means all four finalists can make it.';
    const rows = data.days.map((key) => {
      const all = data.votes[key] || [];
      const ids = only ? all.filter((id) => fin.includes(id)) : all;
      return { key, ids, all, allFin: data.allFinalists.includes(key) };
    });
    const max = Math.max(1, ...rows.map((r) => r.ids.length));
    const list = $('tally'); list.innerHTML = '';
    for (const r of rows) {
      const { dow, num } = dayParts(r.key);
      const ps = r.ids.map((id) => byId.get(id)).filter(Boolean).sort((a, c) => (c.finalist ? 1 : 0) - (a.finalist ? 1 : 0));
      const names = ps.map((p) => (p.finalist ? '♛ ' : '') + p.name).join(', ');
      const missing = fin.filter((id) => !r.all.includes(id)).map((id) => first((byId.get(id) || {}).name));
      const text = only ? (names || 'No finalist yet') + (missing.length && ps.length ? '. Missing: ' + missing.join(', ') : '') : names || 'No votes yet';
      const el = document.createElement('div'); el.className = 't-row';
      el.innerHTML = `<div class="t-label">${dow} ${num}</div><div>
        <div class="t-bar"><div class="t-fill${r.allFin ? ' all' : only ? ' fin' : ''}" style="width:${Math.round((r.ids.length / max) * 100)}%"></div>
        <div class="t-text"><span>${only ? r.ids.length + ' of ' + fin.length : r.ids.length}</span>${r.allFin ? '<span class="badge">all four</span>' : ''}</div></div>
        <div class="t-names"></div></div>`;
      el.querySelector('.t-names').textContent = text;
      list.appendChild(el);
    }
  }

  $('save').onclick = save;
  $('seg-all').onclick = () => { mode = 'everyone'; renderTally(); };
  $('seg-fin').onclick = () => { mode = 'finalists'; renderTally(); };
  load();
})();
