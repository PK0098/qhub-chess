(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const focusId = Number(params.get('g')) || null;
  const initials = (name) => (name || '').trim().split(/\s+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  function avatar(p) {
    const a = document.createElement('div');
    a.className = 'avatar md'; a.style.backgroundColor = '#e0552b';
    if (p.hasPhoto) { a.style.backgroundImage = `url('/api/photo/${p.id}')`; } else a.textContent = initials(p.name);
    return a;
  }

  async function load() {
    if (!token) return showEmpty('This link is missing its personal code. Open the link from your email.');
    const r = await fetch('/api/me?t=' + encodeURIComponent(token), { cache: 'no-store' });
    if (!r.ok) return showEmpty(r.status === 404 ? 'We don\'t recognise this link. Open the one from your email.' : 'Something went wrong. Try again in a minute.');
    render(await r.json());
  }
  function showEmpty(msg) { $('empty').textContent = msg; $('empty').hidden = false; }

  function render(data) {
    const me = $('me'); me.hidden = false;
    $('me-avatar').replaceChildren(avatar(data.player));
    $('me-name').textContent = data.player.name;
    $('me-sub').textContent = `${data.player.code} · ${data.player.company}`;
    const list = $('list'); list.innerHTML = '';
    if (!data.games.length) {
      showEmpty(data.phase === 'registration' ? 'Registration is still open. Pairings arrive by email once it closes.' : 'No games yet. Sit tight.');
      return;
    }
    const ordered = [...data.games].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
    ordered.forEach((g) => list.appendChild(gameCard(g, data)));
  }

  function gameCard(g, data) {
    const el = document.createElement('div');
    el.className = 'g' + (g.id === focusId ? ' focus' : '');
    const opp = g.opponent;
    const ko = g.round >= 2;
    const round = document.createElement('div'); round.className = 'g-round';
    round.textContent = g.round === 1 ? `Group game #${g.id}` : g.round === 2 ? 'Semi-final' : g.slot === 0 ? 'Final' : 'Third place';
    const vs = document.createElement('div'); vs.className = 'g-vs';
    vs.textContent = opp ? `vs ${opp.name}` : 'Bye';
    const sub = document.createElement('div'); sub.className = 'g-sub';
    sub.textContent = opp ? `${opp.code} · ${opp.company}` : 'You advance without playing.';
    el.append(round, vs, sub);

    const mine = (res) => { // result from my perspective
      if (!res) return null;
      if (res === '1/2') return 'draw';
      const p1won = res === '1-0';
      return (g.youAre === 'p1') === p1won ? 'win' : 'loss';
    };
    const word = { win: 'You won', loss: 'You lost', draw: 'Draw' };
    const state = document.createElement('div'); state.className = 'g-state';
    if (!opp) { state.textContent = 'Bye.'; state.classList.add('ok'); el.appendChild(state); return el; }
    if (g.status === 'confirmed') { state.textContent = `${word[mine(g.result)]}. Confirmed.`; state.classList.add('ok'); el.appendChild(state); return el; }
    if (g.status === 'disputed') { state.textContent = 'Disputed. The organizer will settle this one.'; state.classList.add('bad'); el.appendChild(state); return el; }
    if (g.status === 'reported' && g.reportedByYou) { state.textContent = `You reported: ${word[mine(g.result)].toLowerCase()}. Waiting for ${opp.name.split(' ')[0]} to confirm (auto-confirms after 48h). You can still change it below.`; state.classList.add('warn'); el.appendChild(state); }
    if (g.status === 'reported' && !g.reportedByYou) { state.textContent = `${opp.name.split(' ')[0]} reported: ${word[mine(g.result)].toLowerCase()}.`; state.classList.add('warn'); el.appendChild(state); }
    if (g.status === 'pending') { state.textContent = `Not played yet. Email ${opp.name.split(' ')[0]} to arrange it, then report the result here.`; el.appendChild(state); }

    const actions = document.createElement('div'); actions.className = 'actions';
    const err = document.createElement('div'); err.className = 'err'; err.hidden = true;
    const post = async (url, body) => {
      err.hidden = true;
      actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, g: g.id, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = d.error || 'Something went wrong.'; err.hidden = false; actions.querySelectorAll('button').forEach((b) => (b.disabled = false)); return; }
      load();
    };
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; return b; };

    if (g.canConfirm) {
      actions.append(btn('Confirm', 'btn-dark', () => post('/api/confirm', { action: 'confirm' })),
        btn('Dispute', 'btn-line', () => { if (confirm('Dispute this result? The organizer will be notified.')) post('/api/confirm', { action: 'dispute' }); }));
    } else if (g.canReport) {
      actions.append(btn('I won', 'btn-orange', () => post('/api/report', { result: 'win' })));
      if (!ko) actions.append(btn('Draw', 'btn-line', () => post('/api/report', { result: 'draw' })));
      if (ko) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'No draws in the knockout: a drawn game is replayed until someone wins.'; el.appendChild(h); }
      actions.append(btn('I lost', 'btn-dark', () => post('/api/report', { result: 'loss' })));
    }
    if (actions.children.length) el.appendChild(actions);
    el.appendChild(err);
    if (g.canReport && g.status === 'pending') { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'Either player can report. The other gets an email to confirm.'; el.appendChild(h); }
    return el;
  }

  load();
})();
