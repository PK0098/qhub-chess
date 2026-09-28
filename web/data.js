// Mock state used only when /api/state is unreachable (e.g. the GitHub Pages preview).
// Shape mirrors the API response.
(function () {
  const names = [
    ['Ani Petrosyan', 'Q hub', 'Plays the London System. Unironically.'],
    ['Davit Hakobyan', 'Freelance', 'Reigning coffee-break champion.'],
    ['Narek Sargsyan', 'Q hub', 'Sicilian or nothing.'],
    ['Lilit Avetisyan', 'Pharmabits', 'Has never lost on time. Has never finished a game either.'],
    ['Tigran Grigoryan', 'Q hub', 'Castles early. Regrets nothing.'],
    ['Mariam Karapetyan', 'Freelance', 'Will offer a draw. Decline at your own risk.'],
    ['Hayk Mkrtchyan', 'Q hub', 'Learned chess last month. Dangerous.'],
    ['Sona Harutyunyan', 'Pharmabits', 'Queen’s Gambit, accepted.'],
    ['Aram Vardanyan', 'Freelance', 'Plays the bongcloud. Has won with it.'],
    ['Anahit Hovhannisyan', 'Q hub', 'Endgame specialist (the snacks part).'],
    ['Levon Galstyan', 'Q hub', 'Knight before bishop. Always.'],
    ['Nare Simonyan', 'Freelance', 'Here for the vibes and the en passant.'],
  ];
  const players = names.map(([name, company, tag], i) => ({ id: i + 1, code: 'P' + String(i + 1).padStart(2, '0'), name, company, tag, grp: i % 2 ? 'A' : 'P', hasPhoto: false }));
  // Deterministic pseudo-random results for a group stage in progress.
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const games = []; let id = 1, slot = 0;
  for (const grp of ['P', 'A']) {
    const ids = players.filter((p) => p.grp === grp).map((p) => p.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const r = rnd();
      const played = rnd() < 0.7;
      games.push({
        id: id++, round: 1, slot: slot++, p1: ids[i], p2: ids[j],
        result: played ? (r < 0.42 ? '1-0' : r < 0.8 ? '0-1' : '1/2') : null,
        status: played ? 'confirmed' : 'pending',
        confirmedAt: played ? new Date(2026, 9, 1 + Math.floor(rnd() * 20)).toISOString() : null,
      });
    }
  }
  // Mock-only table: the real one is ordered by the API (points, head-to-head, wins, lots).
  function table(grp) {
    const rows = players.filter((p) => p.grp === grp).map((p) => ({ id: p.id, played: 0, w: 0, d: 0, l: 0, points: 0, form: [] }));
    const by = new Map(rows.map((r) => [r.id, r]));
    for (const g of games.filter((g) => g.status === 'confirmed' && by.has(g.p1))) {
      const a = by.get(g.p1), b = by.get(g.p2); a.played++; b.played++;
      if (g.result === '1-0') { a.w++; b.l++; a.form.push('W'); b.form.push('L'); }
      else if (g.result === '0-1') { b.w++; a.l++; b.form.push('W'); a.form.push('L'); }
      else { a.d++; b.d++; a.form.push('D'); b.form.push('D'); }
    }
    return rows.map((r) => ({ ...r, points: r.w * 3 + r.d, form: r.form.slice(-5) })).sort((x, y) => y.points - x.points || y.w - x.w);
  }
  window.MOCK_STATE = {
    phase: 'registration', format: 'groups', champion: null,
    closeDate: '2026-09-30T23:59:59+04:00', startDate: '2026-10-01', confirmHours: 48,
    players, games, groups: { P: table('P'), A: table('A') },
    registrants: players.slice(0, 7),
  };
})();
