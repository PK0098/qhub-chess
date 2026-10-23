// Announcements the organizer can send to every player from /admin.
// To add one: write a template in mail.js, then add an entry here.
//   label:   shown in the admin dropdown
//   prepare: (db, env, players) => shared context, computed once per send; throw bad() to refuse
//   build:   (env, ctx, player) => { subject, html, text, replyTo? }
import { bad } from './http.js';
import { getSetting, listGames } from './db.js';
import { templates } from './mail.js';
import { GROUPS, seriesOf } from './tournament.js';
import { groupTables } from './sweep.js';
import { progressStats, playerProgress, groupProgress } from './progress.js';

const groupStageRunning = async (db) => {
  if ((await getSetting(db, 'phase')) !== 'play') throw bad('Only available once the group stage is running', 409);
  if (await getSetting(db, 'groups_ended_at')) throw bad('The group stage has ended', 409);
};

export const broadcasts = {
  groupsEnded: {
    label: 'Group stage over: who advanced + semi rules',
    async prepare(db, env, players) {
      if (!(await getSetting(db, 'groups_ended_at'))) throw bad('End the group stage first', 409);
      const games = await listGames(db);
      const semis = [seriesOf(games, 2, 0), seriesOf(games, 2, 1)];
      if (semis.some((s) => !s)) throw bad('The semi-finals have not been created yet', 409);
      const group = games.filter((g) => g.round === 1);
      return {
        tables: await groupTables(db, players, games),
        byId: new Map(players.map((p) => [p.id, p])),
        semis, played: group.filter((g) => g.status === 'confirmed').length, closed: group.filter((g) => g.status === 'closed').length,
      };
    },
    build: (env, ctx, player) => templates.groupsEnded(env, { player, ...ctx }),
  },
  progress: {
    label: 'Progress update: thanks + please play more',
    async prepare(db, env, players) {
      await groupStageRunning(db);
      const games = await listGames(db);
      return { players, games, stats: progressStats(env, players, games) };
    },
    build: (env, ctx, player) => templates.progress(env, { player, stats: ctx.stats, ...playerProgress(ctx.players, ctx.games, player.id) }),
  },
  finalPush: {
    label: 'Final push: group progress bars + thanks',
    async prepare(db, env, players) {
      await groupStageRunning(db);
      const games = await listGames(db);
      return { players, games, groups: groupProgress(players, games, GROUPS) };
    },
    build: (env, ctx, player) => templates.finalPush(env, { player, groups: ctx.groups, players: ctx.players.length, ...playerProgress(ctx.players, ctx.games, player.id) }),
  },
  formatChange: {
    label: 'Format update: two groups, then a knockout',
    prepare: async () => ({}),
    build: (env, ctx, player) => templates.formatChange(env, { player }),
  },
};
