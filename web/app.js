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
      t.innerHTML = opts.gtag && p.grp
        ? `<div class="gtag" style="--gacc:${GROUPS[p.grp].accent}">${p.grp} · ${GROUPS[p.grp].name}</div><div class="card-piece">${p.piece}</div>`
        : `<div class="card-code">${p.code}</div><div class="card-piece">${p.piece}</div>`;
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
  const GROUPS = {
    P: { name: 'Petrosian', full: 'Group Petrosian', accent: '#e0552b', piece: '♜', note: 'Tigran Petrosian, "Iron Tigran". 9th World Champion, 1963–69. Notoriously hard to beat.' },
    A: { name: 'Aronian', full: 'Group Aronian', accent: '#d9a92f', piece: '♛', note: 'Levon Aronian. World Cup winner 2005 and 2017, three Olympiad golds with Armenia.' },
  };
  const NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen'];
  const winnerOf = (g) => (g && g.status === 'confirmed' ? (g.result === '1-0' ? g.p1 : g.result === '0-1' ? g.p2 : null) : null);

  function initPlay(state) {
    const players = decorate(state.players);
    const byId = new Map(players.map((p) => [p.id, p]));
    const games = state.games;
    const n = players.length;
    const groupGames = games.filter((g) => g.round === 1);
    const groupPlayed = groupGames.filter((g) => g.status === 'confirmed').length;
    const played = games.filter((g) => g.status === 'confirmed').length;
    const total = groupGames.length + 4;
    const sizeP = players.filter((p) => p.grp === 'P').length, sizeA = n - sizeP;
    const groupsDone = groupGames.length > 0 && groupPlayed === groupGames.length;
    const final = games.find((g) => g.round === 3 && g.slot === 0);
    const stage = state.phase === 'done' || winnerOf(final) ? 'finished' : groupsDone ? 'semis' : 'groups';

    $('play-count').textContent = n;
    $('play-group-size').textContent = sizeP === sizeA ? sizeP : `${sizeP} and ${sizeA}`;
    $('play-total').textContent = total;
    $('play-played').textContent = played;
    $('players-n-play').textContent = n;
    $('rules-n').textContent = NUM[n] || n;
    $('stage-label').textContent = { groups: 'Group stage live', semis: 'Knockouts live', finished: 'Champion crowned' }[stage];

    if (state.phase === 'done' && state.champion && byId.get(state.champion)) {
      const c = byId.get(state.champion);
      $('champion').hidden = false;
      $('champion-name').textContent = c.name; $('champion-company').textContent = c.company;
    }

    renderStages(stage, sizeP, sizeA, groupGames.length);
    const groups = state.groups || { P: [], A: [] };
    let view = 'table';
    const draw = () => renderGroups(groups, byId, groupGames, groupPlayed, view, groupsDone);
    $('view-table').onclick = () => { view = 'table'; $('view-table').classList.add('on'); $('view-cross').classList.remove('on'); draw(); };
    $('view-cross').onclick = () => { view = 'cross'; $('view-cross').classList.add('on'); $('view-table').classList.remove('on'); draw(); };
    draw();
    renderBracket(games, groups, byId, stage, groupsDone);

    let filter = 'all';
    const tiles = () => renderTiles(players.filter((p) => filter === 'all' || p.grp === filter), { sub: (p) => p.tag || p.company, claim: false, gtag: true });
    const filters = $('filters'); filters.innerHTML = '';
    [['all', `All · ${n}`], ['P', `Petrosian · ${sizeP}`], ['A', `Aronian · ${sizeA}`]].forEach(([key, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'filter' + (key === filter ? ' on' : ''); b.textContent = label;
      b.onclick = () => { filter = key; filters.querySelectorAll('.filter').forEach((x) => x.classList.toggle('on', x === b)); tiles(); };
      filters.appendChild(b);
    });
    tiles();
    initTicker();
  }

  function renderStages(stage, sizeP, sizeA, groupGames) {
    const idx = { groups: 0, semis: 1, finished: 3 }[stage];
    const sizes = sizeP === sizeA ? `2 groups of ${sizeP}` : `groups of ${sizeP} and ${sizeA}`;
    const list = [
      { title: 'Group stage', piece: '♜', count: `${groupGames} games · ${sizes}`, body: 'Group Petrosian and Group Aronian. Inside a group, every pair plays once. Win 3 · Draw 1 · Loss 0.' },
      { title: 'Semifinals', piece: '♞', count: '2 games', body: "Top two from each group go through. Each group winner plays the other group's runner-up: P1 vs A2, A1 vs P2." },
      { title: 'Final & 3rd place', piece: '♔', count: '2 games · 1 champion', body: 'Semifinal winners play the final. Semifinal losers play for third place. No draws: replay until someone wins.' },
    ];
    const wrap = $('stages'); wrap.innerHTML = '';
    list.forEach((s, i) => {
      const st = i < idx ? 'done' : i === idx ? 'now' : 'next';
      const el = document.createElement('div'); el.className = 'stage ' + st;
      el.innerHTML = `<div class="stage-top"><span>STAGE 0${i + 1}</span><span class="stage-chip">${st === 'now' ? '● Now' : st === 'done' ? '✓ Done' : 'Later'}</span></div>
        <div class="stage-title-row"><div class="stage-title">${s.title}</div><div class="stage-piece">${s.piece}</div></div>
        <div class="stage-body">${s.body}</div><div class="stage-count">${s.count}</div>`;
      wrap.appendChild(el);
    });
  }

  // Tables come ordered from the server (points, head-to-head, wins, lots); we only draw them.
  function renderGroups(groups, byId, groupGames, played, view, groupsDone) {
    $('st-played').textContent = played; $('st-total').textContent = groupGames.length;
    const last = groupGames.filter((g) => g.confirmedAt).map((g) => g.confirmedAt).sort().pop();
    $('updated-label').textContent = last ? new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'just now';
    const wrap = $('group-panels'); wrap.innerHTML = '';
    for (const key of ['P', 'A']) {
      const meta = GROUPS[key];
      const rows = groups[key] || [];
      const panel = document.createElement('div'); panel.className = 'gpanel'; panel.style.setProperty('--gacc', meta.accent);
      const mine = groupGames.filter((g) => g.p2 !== null && rows.some((r) => r.id === g.p1));
      const done = mine.filter((g) => g.status === 'confirmed').length;
      panel.innerHTML = `<div class="gpanel-head"><div><div class="gpanel-title"><span class="gid">${key}</span><span class="gname">${meta.full}</span></div><div class="gnote">${meta.note}</div></div><div class="gpiece">${meta.piece}</div></div>
        <div class="table-scroll"><table class="gtable"><thead><tr></tr></thead><tbody></tbody></table></div>
        <div class="gpanel-foot"><span class="sw">Top 2 go to the semis</span><span>${groupsDone ? 'Group complete' : `${done}/${mine.length} games played`}</span></div>`;
      const head = panel.querySelector('thead tr'), body = panel.querySelector('tbody');
      const nameCell = (r, i) => {
        const p = byId.get(r.id); const td = document.createElement('td');
        const cell = document.createElement('span'); cell.className = 'gplayer';
        if (p) cell.appendChild(avatarEl(p, 'xs'));
        const nm = document.createElement('span'); nm.textContent = p ? p.name : '?'; cell.appendChild(nm);
        if (i < 2) { const sf = document.createElement('span'); sf.className = 'sf'; sf.textContent = 'SF'; cell.appendChild(sf); }
        td.appendChild(cell); return td;
      };
      if (view === 'table') {
        head.innerHTML = `<th>#</th><th>Player</th><th class="c" title="Played">P</th><th class="c" title="Won">W</th><th class="c" title="Drawn">D</th><th class="c" title="Lost">L</th><th class="pts">Pts</th>`;
        rows.forEach((r, i) => {
          const tr = document.createElement('tr'); tr.className = (i < 2 ? 'q' : '') + (i === 1 ? ' cut' : '');
          tr.innerHTML = `<td><span class="grank">${i + 1}</span></td>`;
          tr.appendChild(nameCell(r, i));
          tr.insertAdjacentHTML('beforeend', `<td class="c muted">${r.played}</td><td class="c">${r.w}</td><td class="c">${r.d}</td><td class="c">${r.l}</td><td class="pts">${r.points}</td>`);
          body.appendChild(tr);
        });
      } else {
        head.innerHTML = `<th>#</th><th>Player</th>${rows.map((_, i) => `<th class="c">${i + 1}</th>`).join('')}<th class="pts">Pts</th>`;
        const res = new Map(); // "a-b" -> result for a
        for (const g of mine) {
          if (g.status !== 'confirmed' || !g.result) continue;
          const a = g.result === '1-0' ? 'w' : g.result === '0-1' ? 'l' : 'd';
          res.set(`${g.p1}-${g.p2}`, a); res.set(`${g.p2}-${g.p1}`, a === 'w' ? 'l' : a === 'l' ? 'w' : 'd');
        }
        rows.forEach((r, i) => {
          const tr = document.createElement('tr'); tr.className = (i < 2 ? 'q' : '') + (i === 1 ? ' cut' : '');
          const p = byId.get(r.id); const short = p ? p.name.split(' ')[0] + ' ' + (p.name.split(' ')[1] || '')[0] + '.' : '?';
          tr.innerHTML = `<td><span class="grank">${i + 1}</span></td><td><span class="gplayer"></span></td>` +
            rows.map((o) => { if (o.id === r.id) return '<td class="x"><span class="xchip self"></span></td>'; const k = res.get(`${r.id}-${o.id}`); return `<td class="x"><span class="xchip ${k || 'none'}">${k === 'w' ? '1' : k === 'l' ? '0' : k === 'd' ? '½' : '·'}</span></td>`; }).join('') +
            `<td class="pts">${r.points}</td>`;
          tr.querySelector('.gplayer').textContent = short;
          body.appendChild(tr);
        });
      }
      wrap.appendChild(panel);
    }
  }

  function renderBracket(games, groups, byId, stage, groupsDone) {
    const wrap = $('bracket-grid'); wrap.innerHTML = '';
    const find = (round, slot) => games.find((g) => g.round === round && g.slot === slot) || null;
    const name = (id) => (byId.get(id) || {}).name || '?';
    const seedSlot = (key, n) => {
      const rows = groups[key] || []; const r = rows[n - 1];
      return { seed: key + n, name: r ? name(r.id) : 'TBD', sub: groupsDone ? `${n === 1 ? 'Winner' : 'Runner-up'}, ${GROUPS[key].full}` : 'if the group ended today', prov: !groupsDone && !!r, tbd: !r };
    };
    const fromGame = (g, i, seed, label) => g ? { seed, name: name(i === 0 ? g.p1 : g.p2), sub: label } : { seed, name: 'TBD', sub: label, tbd: true };
    const mk = (cls, label, g, pair) => {
      const win = winnerOf(g);
      const known = pair.every((s) => !s.tbd && !s.prov);
      const status = win !== null ? '✓ Played' : g && g.status === 'reported' ? 'Awaiting confirmation' : g && g.status === 'disputed' ? 'Disputed' : known ? '● Next up' : !groupsDone ? 'After groups' : 'Waiting';
      const el = document.createElement('div'); el.className = 'match ' + cls + (known && win === null ? ' next' : '');
      el.innerHTML = `<div class="match-head"><span>${label}</span><span class="st">${status}</span></div>`;
      pair.forEach((s, i) => {
        const pid = g ? (i === 0 ? g.p1 : g.p2) : null;
        const row = document.createElement('div');
        row.className = 'slot' + (win !== null ? (win === pid ? ' win' : ' lost') : '') + (s.prov ? ' prov' : '') + (s.tbd ? ' tbd' : '');
        row.innerHTML = `<span class="slot-seed">${s.seed}</span><div class="slot-body"><div class="slot-name"></div><div class="slot-sub">${s.sub}</div></div><span class="slot-score">${win !== null ? (win === pid ? '1' : '0') : ''}</span>`;
        row.querySelector('.slot-name').textContent = s.name;
        el.appendChild(row);
      });
      return el;
    };
    const sf1 = find(2, 0), sf2 = find(2, 1), fin = find(3, 0), thd = find(3, 1);
    const sf1Pair = sf1 ? [fromGame(sf1, 0, 'P1', `Winner, ${GROUPS.P.full}`), fromGame(sf1, 1, 'A2', `Runner-up, ${GROUPS.A.full}`)] : [seedSlot('P', 1), seedSlot('A', 2)];
    const sf2Pair = sf2 ? [fromGame(sf2, 0, 'A1', `Winner, ${GROUPS.A.full}`), fromGame(sf2, 1, 'P2', `Runner-up, ${GROUPS.P.full}`)] : [seedSlot('A', 1), seedSlot('P', 2)];
    const finPair = [fromGame(fin, 0, 'W1', 'Winner SF1'), fromGame(fin, 1, 'W2', 'Winner SF2')];
    const thdPair = [fromGame(thd, 0, 'L1', 'Loser SF1'), fromGame(thd, 1, 'L2', 'Loser SF2')];
    wrap.append(
      mk('m-sf1', 'SF1 · Semifinal', sf1, sf1Pair),
      mk('m-sf2', 'SF2 · Semifinal', sf2, sf2Pair),
      mk('m-f', 'Final', fin, finPair),
      mk('m-3p', '3rd place', thd, thdPair),
    );
    const c1 = document.createElement('div'); c1.className = 'conn1'; c1.setAttribute('aria-hidden', 'true');
    const c2 = document.createElement('div'); c2.className = 'conn2'; c2.setAttribute('aria-hidden', 'true');
    wrap.append(c1, c2);
    const champ = winnerOf(fin), bronze = winnerOf(thd);
    const runner = champ ? (fin.p1 === champ ? fin.p2 : fin.p1) : null;
    const card = document.createElement('div'); card.className = 'champ';
    card.innerHTML = `<div class="champ-piece">♔</div><div class="champ-k">Champion</div><div class="champ-name${champ ? '' : ' tbd'}"></div><div class="champ-sub"></div>`;
    card.querySelector('.champ-name').textContent = champ ? name(champ) : 'To be decided';
    card.querySelector('.champ-sub').textContent = champ ? `Runner-up: ${name(runner)}.${bronze ? ` Third place: ${name(bronze)}.` : ''}` : 'Crowned after the final. Bragging rights for a full year.';
    wrap.appendChild(card);
    $('bracket-note').textContent = { groups: 'Names in italics are who would go through if the groups ended today.', semis: 'Groups are done. The knockouts are on.', finished: "That's a wrap. See you next season." }[stage];
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
