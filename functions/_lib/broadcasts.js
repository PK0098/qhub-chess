// Announcements the organizer can send to every player from /admin.
// To add one: write a template in mail.js, then add an entry here.
//   label:   shown in the admin dropdown
//   prepare: (db, env, players) => shared context, computed once per send; throw bad() to refuse
//   build:   (env, ctx, player) => { subject, html, text, replyTo? }
import { bad } from './http.js';
import { getSetting, listGames } from './db.js';
import { templates } from './mail.js';
import { progressStats, playerProgress } from './progress.js';

export const broadcasts = {
  progress: {
    label: 'Progress update: thanks + please play more',
    async prepare(db, env, players) {
      if ((await getSetting(db, 'phase')) !== 'play') throw bad('Only available once the group stage is running', 409);
      const games = await listGames(db);
      return { players, games, stats: progressStats(env, players, games) };
    },
    build: (env, ctx, player) => templates.progress(env, { player, stats: ctx.stats, ...playerProgress(ctx.players, ctx.games, player.id) }),
  },
  formatChange: {
    label: 'Format update: two groups, then a knockout',
    prepare: async () => ({}),
    build: (env, ctx, player) => templates.formatChange(env, { player }),
  },
};
