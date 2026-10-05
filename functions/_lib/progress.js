// Numbers for the progress-update email, from players + games (DB rows or public state).
export function progressStats(env, players, games, now = new Date()) {
  const group = games.filter((g) => g.round === 1);
  const done = group.filter((g) => g.status === 'confirmed').length;
  const total = group.length;
  const start = new Date(`${env.START_DATE || '2026-10-01'}T00:00:00Z`);
  const days = Math.max(1, Math.ceil((now - start) / 864e5));
  const perDay = done / days;
  const addDays = (n) => new Date(now.getTime() + n * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const groupDays = perDay > 0 ? Math.ceil((total - done) / perDay) : 30;
  const played = (id) => group.filter((g) => g.status === 'confirmed' && (g.p1 === id || g.p2 === id)).length;
  return {
    done, total, players: players.length, pct: total ? Math.round((done / total) * 100) : 0,
    idle: players.filter((p) => p.grp && played(p.id) === 0).length,
    perDay: perDay.toFixed(1), groupsEta: addDays(groupDays), finalEta: addDays(groupDays + 10),
  };
}

// This player's group games: how many done, how many left, and who they still owe.
export function playerProgress(players, games, id) {
  const mine = games.filter((g) => g.round === 1 && (g.p1 === id || g.p2 === id));
  const open = mine.filter((g) => g.status !== 'confirmed');
  const remaining = open.map((g) => players.find((x) => x.id === (g.p1 === id ? g.p2 : g.p1))).filter(Boolean);
  return { played: mine.length - open.length, left: open.length, remaining };
}
