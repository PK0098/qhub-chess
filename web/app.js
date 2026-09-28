(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const initials = (name) => (name || '').trim().split(/\s+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const AVATARS = ['#e0552b', '#cfd6e3', '#d9a92f', '#d9d0bb'];
  const PIECES = ['♜', '♞', '♝', '♛', '♚', '♟'];
  const TILTS = ['-1.5deg', '1deg', '-0.6deg', '1.6deg', '-1.1deg', '0.8deg'];
  const MEDAL = [{ bg: '#d9a92f', piece: '♔' }, { bg: '#b8b4ab', piece: '♕' }, { bg: '#b8794f', piece: '♖' }];
  const PGN = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#   ✦   Morphy vs. Duke Karl & Count Isouard, Paris 1858. Took 17 moves. You have 10 minutes.   ✦   ';

  // ---- state -------------------------------------------------------------
  let live = true;
  async function loadState() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      live = false;
      const params = new URLSearchParams(location.search);
      const m = JSON.parse(JSON.stringify(window.MOCK_STATE));
      m.phase = params.get('phase') === 'play' ? 'play' : 'registration';
      if (m.phase === 'registration') { m.players = m.registrants; m.games = []; }
      return m;
    }
  }

  function decorate(list) {
    return list.map((p, i) => ({ ...p, avatarBg: AVATARS[i % AVATARS.length], piece: PIECES[i % PIECES.length], tilt: TILTS[i % TILTS.length] }));
  }
  function avatarEl(p, size) {
    const a = document.createElement('div');
    a.className = 'avatar ' + size;
    a.style.backgroundColor = p.avatarBg || AVATARS[0];
    if (p.hasPhoto && live) { a.style.backgroundImage = `url('/api/photo/${p.id}')`; a.textContent = ''; }
    else if (p.photo) { a.style.backgroundImage = `url('${p.photo}')`; a.textContent = ''; }
    else a.textContent = initials(p.name) || '?';
    return a;
  }
  function renderTiles(list, opts) {
    const grid = $('player-grid');
    grid.innerHTML = '';
    list.forEach((p) => {
      const t = document.createElement('div');
      t.className = 'tile';
      t.style.setProperty('--tilt', p.tilt);
      t.innerHTML = `<div class="card-code">${p.code}</div><div class="card-piece">${p.piece}</div>`;
      t.appendChild(avatarEl(p, 'md'));
      const body = document.createElement('div');
      body.innerHTML = `<div class="tile-name"></div><div class="tile-sub"></div>`;
      body.querySelector('.tile-name').textContent = p.name;
      body.querySelector('.tile-sub').textContent = opts.sub(p);
      t.appendChild(body);
      grid.appendChild(t);
    });
    if (opts.claim) {
      const a = document.createElement('a');
      a.href = '#register'; a.className = 'tile claim';
      a.innerHTML = `<div class="avatar md">?</div><div><div class="tile-name">You, ${'P' + pad(list.length + 1)}</div><div class="tile-sub">Claim this spot →</div></div>`;
      grid.appendChild(a);
    }
  }

  // Same rules as the server: 3/1/0, sort by points then wins.
  function initRegistration(state) {
    const close = new Date(state.closeDate);
    let players = decorate(state.players);
    let photo = '';

    function refresh() {
      const n = players.length;
      $('reg-count').textContent = n; $('already-n').textContent = n; $('players-n-reg').textContent = n;
      $('reg-code').textContent = 'P' + pad(n + 1); $('done-code').textContent = 'P' + pad(n + 1);
      renderTiles(players, { sub: (p) => p.company || 'Freelance', claim: true });
    }
    function tick() {
      const ms = Math.max(0, close - Date.now());
      const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
      $('countdown').textContent = ms > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` : 'Registration closing';
      $('countdown-short').textContent = ms > 0 ? `${d}d ${pad(h)}h` : 'soon';
      $('reg-days').textContent = d;
    }
    tick(); setInterval(tick, 1000);
    refresh();

    const form = $('reg-form'), done = $('reg-done'), nameIn = $('f-name'), compIn = $('f-company'), emailIn = $('f-email'), err = $('form-error'), btn = form.querySelector('button[type=submit]');
    nameIn.addEventListener('input', () => form.classList.toggle('filled', !!nameIn.value.trim()));
    const menu = $('photo-menu'), pick = $('photo-pick');
    const setMenu = (open) => { menu.hidden = !open; pick.setAttribute('aria-expanded', String(open)); };
    pick.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    // Phones: native camera via the capture input. Desktops ignore `capture`, so use the webcam.
    const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
    $('photo-camera').addEventListener('click', async () => {
      setMenu(false);
      if (!desktop || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('photo-input-camera').click(); return; }
      try {
        const dataUrl = await webcamCapture();
        if (dataUrl) { photo = dataUrl; pick.style.backgroundImage = `url('${photo}')`; $('photo-hint').hidden = true; }
      } catch (err) {
        // No camera or permission denied: fall back to the file picker.
        $('photo-input').click();
      }
    });
    $('photo-library').addEventListener('click', () => { setMenu(false); $('photo-input').click(); });
    async function onPhotoFile(e) {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        photo = await resizeImage(f, 240);
        pick.style.backgroundImage = `url('${photo}')`; $('photo-hint').hidden = true;
      } catch { showError('That image could not be read. Try another one.'); }
      e.target.value = '';
    }
    $('photo-input').addEventListener('change', onPhotoFile);
    $('photo-input-camera').addEventListener('change', onPhotoFile);
    function showError(msg) { err.textContent = msg; err.hidden = !msg; }
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); showError('');
      const name = nameIn.value.trim(), company = compIn.value.trim() || 'Freelance', email = emailIn.value.trim();
      if (!name) { nameIn.focus(); return; }
      if (!emailIn.checkValidity()) { emailIn.focus(); emailIn.reportValidity(); return; }
      btn.disabled = true; btn.textContent = 'Registering…';
      let res;
      if (live) {
        try {
          const r = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, company, email, photo: photo || null }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { showError(data.error || 'Something went wrong. Try again.'); btn.disabled = false; btn.innerHTML = 'Register <span aria-hidden="true">→</span>'; return; }
          res = data;
        } catch { showError('Network error. Try again.'); btn.disabled = false; btn.innerHTML = 'Register <span aria-hidden="true">→</span>'; return; }
      } else res = { id: players.length + 1, code: 'P' + pad(players.length + 1) };
      players = decorate([...players, { id: res.id, code: res.code, name, company, hasPhoto: false, photo }]);
      $('done-name').textContent = name; $('done-company').textContent = company; $('done-email').textContent = email;
      const av = $('done-avatar'); av.style.backgroundImage = photo ? `url('${photo}')` : ''; av.textContent = photo ? '' : initials(name);
      form.hidden = true; done.hidden = false;
      btn.disabled = false; btn.innerHTML = 'Register <span aria-hidden="true">→</span>';
      refresh();
      showToast(name.split(/\s+/)[0], email);
    });
    $('reg-reset').addEventListener('click', () => {
      form.reset(); form.classList.remove('filled'); photo = '';
      $('photo-pick').style.backgroundImage = ''; $('photo-hint').hidden = false;
      done.hidden = true; form.hidden = false;
    });
    let toastTm;
    function showToast(name, email) {
      $('toast-name').textContent = name; $('toast-email').textContent = email; $('toast').hidden = false;
      clearTimeout(toastTm); toastTm = setTimeout(() => { $('toast').hidden = true; }, 9000);
    }
    $('toast-close').addEventListener('click', () => { clearTimeout(toastTm); $('toast').hidden = true; });
  }

  // Opens the webcam dialog; resolves with a 240px JPEG data URL, or null if cancelled. Rejects if no camera.
  function webcamCapture() {
    return new Promise(async (resolve, reject) => {
      const box = $('cam'), video = $('cam-video'), snap = $('cam-snap'), cancel = $('cam-cancel');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false }); }
      catch (e) { reject(e); return; }
      video.srcObject = stream; box.hidden = false;
      snap.disabled = true; snap.textContent = 'Starting camera…';
      video.onplaying = () => { snap.disabled = false; snap.innerHTML = 'Snap <span aria-hidden="true">📷</span>'; };
      const close = () => { stream.getTracks().forEach((t) => t.stop()); video.onplaying = null; video.srcObject = null; box.hidden = true; snap.onclick = cancel.onclick = null; document.removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') { close(); resolve(null); } };
      document.addEventListener('keydown', onKey);
      cancel.onclick = () => { close(); resolve(null); };
      snap.onclick = () => {
        const size = 240, c = document.createElement('canvas'); c.width = size; c.height = size;
        const s = Math.min(video.videoWidth, video.videoHeight);
        const ctx = c.getContext('2d');
        ctx.translate(size, 0); ctx.scale(-1, 1); // mirror to match the preview
        ctx.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, size, size);
        close(); resolve(c.toDataURL('image/jpeg', 0.8));
      };
    });
  }

  function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  // ---- play / done phase ----------------------------------------------------
  function initPlay(state) {
    const players = decorate(state.players);
    const byId = new Map(players.map((p) => [p.id, p]));
    const games = state.games;
    const n = players.length;
    const gamesPlayed = games.filter((g) => g.status === 'confirmed').length;
    const sizeA = players.filter((p) => p.grp === 'A').length, sizeB = n - sizeA;
    const total = sizeA * (sizeA - 1) / 2 + sizeB * (sizeB - 1) / 2 + 4;

    $('play-count').textContent = n;
    $('play-total').textContent = total;
    $('play-played').textContent = gamesPlayed;
    $('players-n-play').textContent = n;
    if ($('hero-format')) $('hero-format').textContent = '2 groups + knockout';

    if (state.phase === 'done' && state.champion && byId.get(state.champion)) {
      const c = byId.get(state.champion);
      $('champion').hidden = false;
      $('champion-name').textContent = c.name; $('champion-company').textContent = c.company;
    }

    renderGroups(state.groups || { A: [], B: [] }, byId, games, gamesPlayed, total);
    renderBracket(games, byId);

    renderTiles(players, { sub: (p) => (p.grp ? `Group ${p.grp} · ` : '') + (p.tag || p.company), claim: false });
    initTicker();
  }

  // Tables come ordered from the server (points, head-to-head, wins, lots); we only draw them.
  function renderGroups(groups, byId, games, played, total) {
    $('st-played').textContent = played; $('st-total').textContent = total;
    const last = games.filter((g) => g.confirmedAt).map((g) => g.confirmedAt).sort().pop();
    $('updated-label').textContent = last ? new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'just now';
    const wrap = $('groups'); wrap.innerHTML = '';
    for (const key of ['A', 'B']) {
      const box = document.createElement('div');
      box.innerHTML = `<div class="group-title">Group <span>${key}</span></div>
        <div class="table-card"><div class="table-scroll"><table class="table"><thead><tr>
          <th scope="col" class="c-rank">#</th><th scope="col">Player</th>
          <th scope="col" class="c-c" title="Played">P</th><th scope="col" class="c-c" title="Won">W</th>
          <th scope="col" class="c-c" title="Drawn">D</th><th scope="col" class="c-c" title="Lost">L</th>
          <th scope="col" class="c-form">Last 5</th><th scope="col" class="c-pts accent">Pts</th>
        </tr></thead><tbody></tbody></table></div></div>`;
      const rows = box.querySelector('tbody');
      (groups[key] || []).forEach((r, i) => {
        const p = byId.get(r.id); if (!p) return;
        const tr = document.createElement('tr');
        if (i < 2) tr.className = 'top';
        const form = r.form.map((l) => `<span class="chip ${l}">${l}</span>`).join('');
        tr.innerHTML = `
          <td><span class="rank-badge">${pad(i + 1)}</span></td>
          <td><span class="player-cell"></span></td>
          <td class="c-c muted">${r.played}</td><td class="c-c">${r.w}</td><td class="c-c">${r.d}</td><td class="c-c">${r.l}</td>
          <td><div class="form-row">${form}</div></td>
          <td class="pts">${r.points}</td>`;
        const cell = tr.querySelector('.player-cell');
        cell.appendChild(avatarEl(p, 'sm'));
        const nm = document.createElement('span'); nm.textContent = p.name; cell.appendChild(nm);
        rows.appendChild(tr);
      });
      wrap.appendChild(box);
    }
  }

  // Fixed shape: two semis, then the final with the third-place game beneath it.
  function renderBracket(games, byId) {
    const wrap = $('bracket-cols'); wrap.innerHTML = '';
    const find = (round, slot) => games.find((g) => g.round === round && g.slot === slot) || null;
    const card = (g, placeholder) => {
      const el = document.createElement('div'); el.className = 'br-game';
      if (!g) { el.classList.add('tbd'); el.innerHTML = `<div class="br-p">${placeholder[0]}</div><div class="br-p">${placeholder[1]}</div>`; return el; }
      const win = g.status === 'confirmed' ? (g.result === '1-0' ? g.p1 : g.result === '0-1' ? g.p2 : null) : null;
      [g.p1, g.p2].forEach((pid) => {
        const row = document.createElement('div'); row.className = 'br-p';
        const p = byId.get(pid); row.textContent = p ? p.name : '?';
        if (win === pid) row.classList.add('win'); else if (win !== null) row.classList.add('lost');
        el.appendChild(row);
      });
      if (g.status !== 'confirmed') { const s = document.createElement('div'); s.className = 'br-status'; s.textContent = g.status === 'reported' ? 'awaiting confirmation' : g.status === 'disputed' ? 'disputed' : 'to be played'; el.appendChild(s); }
      return el;
    };
    const semis = document.createElement('div'); semis.className = 'br-col';
    semis.innerHTML = '<div class="br-head">Semi-finals</div>';
    semis.append(card(find(2, 0), ['Winner A', 'Runner-up B']), card(find(2, 1), ['Winner B', 'Runner-up A']));
    const finals = document.createElement('div'); finals.className = 'br-col';
    finals.innerHTML = '<div class="br-head">Final</div>';
    finals.appendChild(card(find(3, 0), ['Semi 1 winner', 'Semi 2 winner']));
    const third = document.createElement('div'); third.className = 'br-head br-sub'; third.textContent = 'Third place';
    finals.append(third, card(find(3, 1), ['Semi 1 loser', 'Semi 2 loser']));
    wrap.append(semis, finals);
  }

  function initTicker() {
    const el = $('ticker'), track = $('ticker-track');
    track.textContent = PGN + PGN;
    const k = { x: 0, drag: false, lastX: 0, last: 0, vel: 0 };
    const speed = 60;
    function loop(t) {
      const dt = k.last ? Math.min((t - k.last) / 1000, 0.05) : 0; k.last = t;
      const half = track.scrollWidth / 2;
      if (!k.drag) { k.x += (-(half / speed) + k.vel) * dt; k.vel *= 0.94; }
      if (half > 0) k.x = ((k.x % half) + half) % half - half;
      track.style.transform = `translateX(${k.x}px)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    el.addEventListener('pointerdown', (e) => { k.drag = true; k.lastX = e.clientX; k.vel = 0; el.setPointerCapture(e.pointerId); el.classList.add('dragging'); });
    el.addEventListener('pointermove', (e) => { if (!k.drag) return; const dx = e.clientX - k.lastX; k.lastX = e.clientX; k.x += dx; k.vel = dx * 60; });
    const up = () => { k.drag = false; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  loadState().then((state) => {
    const phase = state.phase === 'registration' ? 'registration' : 'play';
    document.body.dataset.phase = phase;
    document.body.classList.toggle('mock', !live);
    if (phase === 'play') initPlay(state); else initRegistration(state);
    // Sections are hidden until the phase is known, so re-apply the URL hash now.
    const target = location.hash && document.querySelector(location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  });
})();
