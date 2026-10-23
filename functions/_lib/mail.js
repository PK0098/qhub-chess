// Email via Resend. Never throws: callers must not fail a request because mail failed.
import { GROUPS } from './tournament.js';

const groupName = (key) => (GROUPS[key] ? GROUPS[key].full : 'your group');

// Without a Resend key (local dev) the email is captured in the `outbox` table
// instead, so the whole flow can be read on the admin page.
export async function sendMail(env, { to, subject, html, text, replyTo }) {
  const footerText = '\n\nMade by Pouya · Questions: chess@pouyakarimi.com';
  if (!env.RESEND_API_KEY) {
    if (!env.DB) { console.error('RESEND_API_KEY missing'); return { ok: false, error: 'no api key' }; }
    await env.DB.prepare('INSERT INTO outbox (to_addr, subject, html, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind([].concat(to).join(', '), subject, html, text ? text + footerText : null, new Date().toISOString()).run();
    return { ok: true, outbox: true };
  }
  const body = { from: env.MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html, text: text ? text + footerText : undefined };
  if (replyTo) body.reply_to = replyTo;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('resend error', res.status, JSON.stringify(data)); return { ok: false, status: res.status, error: data.message || 'send failed' }; }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('resend fetch failed', e);
    return { ok: false, error: String(e) };
  }
}

// Resend allows 2 requests per second. Send a batch one at a time with a
// gap, and report who failed, instead of firing everything at once.
// items: [{ to, subject, html, text, replyTo }]. Returns { sent, failed: [to] }.
export async function sendMany(env, items) {
  const failed = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && env.RESEND_API_KEY) await new Promise((r) => setTimeout(r, 600));
    const r = await sendMail(env, items[i]);
    if (!r.ok) failed.push(items[i].to);
  }
  return { sent: items.length - failed.length, failed };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (name) => String(name || '').trim().split(/\s+/)[0];
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); } catch { return iso; } };

function layout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#efe6d2;padding:24px 12px;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;color:#1c1a17">
<div style="max-width:560px;margin:0 auto;background:#faf6ec;border:2px solid #1c1a17;box-shadow:8px 8px 0 #e0552b">
  <div style="background:#1c1a17;color:#efe6d2;padding:14px 20px;border-bottom:3px solid #e0552b;font-weight:700;font-size:16px;letter-spacing:-0.02em">QHUB_CHESS</div>
  <div style="padding:22px 20px;font-size:14px;line-height:1.6">
    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.1;letter-spacing:-0.03em;font-family:'Space Grotesk',Arial,sans-serif">${title}</h1>
    ${inner}
  </div>
  <div style="padding:12px 20px;border-top:1px solid #1c1a17;font-size:11px;color:#5c5548">Made by Pouya · Questions: <a href="mailto:chess@pouyakarimi.com" style="color:#2b3f6b">chess@pouyakarimi.com</a></div>
</div></body></html>`;
}

const button = (href, label) => `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:#e0552b;color:#1c1a17;padding:12px 20px;border:2px solid #1c1a17;font-weight:700;text-decoration:none">${esc(label)} →</a></p>`;

const gameLink = (env, token, gameId) => `${env.SITE_URL}/game?t=${encodeURIComponent(token)}&g=${gameId}`;
const meLink = (env, token) => `${env.SITE_URL}/game?t=${encodeURIComponent(token)}`;

function opponentLine(opp) {
  return `<strong>${esc(opp.name)}</strong> (${esc(opp.company)}) · <a href="mailto:${esc(opp.email)}" style="color:#2b3f6b">${esc(opp.email)}</a>`;
}

export const templates = {
  welcome(env, { player }) {
    const url = meLink(env, player.token);
    return {
      subject: `You're on the board, ${first(player.name)} (${player.code})`,
      html: layout(`You're on the board, ${esc(first(player.name))}.`, `
        <p>Your card is <strong>${esc(player.code)}</strong>: ${esc(player.name)}, ${esc(player.company)}.</p>
        <p>Registration closes <strong>${fmtDate(env.CLOSE_DATE)}</strong>. Games start <strong>${fmtDate(env.START_DATE)}</strong>.</p>
        <p>The format: a random draw sorts everyone into <strong>Group Petrosian</strong> and <strong>Group Aronian</strong>. You play everyone in your group once (win 3, draw 1, loss 0, excuses 0). The top two of each group go to the semi-finals, then there's a final. Once the field is set you'll get one email with your group opponents and their email addresses, so you can arrange times together.</p>
        <p>Every game: 10 minutes each, no increment. Standard rules. Be nice. Chess sets are in the kitchens on floors 4 and 5.</p>
        ${button(url, 'Your player page')}
        <p style="font-size:12px;color:#5c5548">Keep this email. The link above is personal and is how you report results.</p>`),
      text: `You're on the board, ${first(player.name)}. Card ${player.code}: ${player.name}, ${player.company}.\nRegistration closes ${fmtDate(env.CLOSE_DATE)}, games start ${fmtDate(env.START_DATE)}.\nYour player page: ${url}`,
    };
  },

  // stage: 'group' | 'semi' | 'final' | 'third' | 'decider'. games: [{id, white, opponent:{name,company,email}}]
  // Knockout stages list game 1 of the series (game 2 swaps colours); 'decider' lists game 3.
  pairings(env, { player, stage, games }) {
    const grp = groupName(player.grp);
    const colour = (g) => stage === 'group' ? '' : stage === 'decider'
      ? `<br>Game 3 (Armageddon): the coin says you have <strong>${g.white ? 'White' : 'Black'}</strong>.`
      : `<br>Game 1: you have <strong>${g.white ? 'White' : 'Black'}</strong>. Game 2: you swap.`;
    const rows = games.map((g) =>
      `<li style="margin:8px 0">${opponentLine(g.opponent)}${colour(g)}<br><a href="${esc(gameLink(env, player.token, g.id))}" style="color:#2b3f6b">Report ${stage === 'group' ? 'this result' : 'your results'}</a></li>`).join('');
    const stageName = { semi: 'Semi-final', final: 'The final', third: 'Third-place match', decider: 'Game 3' }[stage];
    const title = stage === 'group' ? `Pairings are out. You're in ${esc(grp)}.` : stage === 'decider' ? `1–1. Time for Armageddon.` : `${stageName}: your opponent.`;
    const intro = {
      group: `<p>Registration is closed and the hat has spoken: you're in <strong>${esc(grp)}</strong>. Play everyone in your group once. Win 3, draw 1, loss 0, excuses 0. The top two go to the semi-finals.</p>`,
      semi: `<p>Top two in your group. Nice. The semi-final is a best of 3: win it and you play the final, lose it and you play for bronze (still a medal, still bragging rights).</p>`,
      final: `<p>You won your semi. One more match and it's your name on the site for a whole year. No pressure.</p>`,
      third: `<p>The semi didn't go your way, but bronze is still up for grabs. One match, one podium spot.</p>`,
      decider: `<p>Your match is level after two games, so one game decides it. Both players get 10 minutes. <strong>If it's a draw, Black goes through.</strong> So White has to win, and Black just has to not lose.</p>`,
    }[stage];
    const replyTo = games.map((g) => g.opponent.email);
    const howTo = `<p>Email your opponent${games.length > 1 ? 's' : ''} to pick a time. Chess sets live in the kitchens on floors 4 and 5. Bring a phone with a chess clock app set to 10+0. Snacks optional but encouraged.</p>`;
    const tgUrl = 'https://t.me/+_gfRxTIi3tBkNGFk';
    const telegram = stage === 'group' ? `<p>Can't find your opponent, or no reply yet? Join the tournament Telegram channel: <a href="${tgUrl}" style="color:#2b3f6b">${tgUrl}</a>. Everyone can hang out there, so it's the easiest way to track down your opponents and set up games.</p>` : '';
    const noDraw = stage === 'group' || stage === 'decider' ? '' : `<p><strong>How the match works.</strong> Two games, 10 minutes each, and each player has White once. A win is 1 point, a draw ½. After two games the higher score goes through. At 1–1 the site flips a coin for colours and you play game 3 (Armageddon): 10 minutes each, and a draw means Black goes through. So never more than 3 games. Report every game on your player page.</p>`;
    const reporting = `<p>Either player reports the result. The other confirms. Silence for ${esc(env.CONFIRM_HOURS)} hours counts as a confirmation, so don't ghost your opponent.</p>`;
    return {
      subject: stage === 'group' ? `Pairings are out — you're in ${grp}` : stage === 'decider' ? `It's 1–1: game 3 (Armageddon) decides` : `${stageName}: your opponent`,
      replyTo: replyTo.length === 1 ? replyTo[0] : undefined,
      html: layout(title, `${intro}
        ${howTo}
        ${telegram}
        <ul style="padding-left:18px;margin:0">${rows}</ul>
        ${noDraw}
        ${reporting}
        ${button(meLink(env, player.token), 'Your player page')}`),
      text: `${title}\n${games.map((g) => `- ${g.opponent.name} (${g.opponent.company}) ${g.opponent.email}\n  report: ${gameLink(env, player.token, g.id)}`).join('\n')}${stage === 'group' ? `\nCan't find your opponent? Join the Telegram channel: ${tgUrl}` : stage === 'decider' ? '\nGame 3, Armageddon: 10 minutes each, a draw means Black goes through.' : '\nBest of 3: two games (White once each, draw = 1/2). At 1-1 a game 3 Armageddon decides (draw = Black goes through).'}\nYour page: ${meLink(env, player.token)}`,
    };
  },

  // One-off announcement sent from the admin page to everyone already registered.
  formatChange(env, { player }) {
    return {
      subject: `Format update: two groups, then a knockout`,
      html: layout(`Format update.`, `
        <p>Hi ${esc(first(player.name))}, small update from tournament HQ. The format no longer depends on how many people sign up. It's now fixed, whatever the headcount:</p>
        <ol style="padding-left:20px;margin:0 0 14px">
          <li style="margin:6px 0">A random draw sorts everyone into two groups: <strong>Group Petrosian</strong> and <strong>Group Aronian</strong>.</li>
          <li style="margin:6px 0">You play everyone in your group once. Win 3, draw 1, loss 0.</li>
          <li style="margin:6px 0">The <strong>top two</strong> of each group go to the semi-finals: each group winner meets the other group's runner-up.</li>
          <li style="margin:6px 0">Semi winners play the <strong>final</strong>, semi losers play for bronze. No draws in the knockout: play again until someone cracks.</li>
        </ol>
        <p>Nothing to do now. Registration still closes <strong>${fmtDate(env.CLOSE_DATE)}</strong> and your pairings land in your inbox right after. Still 10 minutes each, still no increment, still no mercy.</p>
        ${button(env.SITE_URL, 'See the site')}`),
      text: `Hi ${first(player.name)}, small update: the format is now fixed regardless of headcount.\n1. A random draw sorts everyone into Group Petrosian and Group Aronian.\n2. You play everyone in your group once (3/1/0).\n3. Top two of each group go to the semi-finals (group winner vs the other group's runner-up).\n4. Semi winners play the final, semi losers play for bronze. No draws in the knockout.\nNothing to do now. Registration closes ${fmtDate(env.CLOSE_DATE)}; pairings arrive by email right after.\n${env.SITE_URL}`,
    };
  },

  // One-off progress nudge. stats: { done, total, pct, idle, perDay, groupsEta, finalEta }.
  // played / left: this player's group games. remaining: [{name, company, email}] still to play.
  progress(env, { player, stats, played, left, remaining }) {
    const url = meLink(env, player.token);
    const zero = played === 0;
    const bar = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:2px solid #1c1a17;margin:6px 0 4px"><tr>
      <td width="${stats.pct}%" style="background:#e0552b;height:18px;font-size:0;line-height:0">&nbsp;</td>
      <td style="background:#faf6ec;height:18px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    const stat = (n, label) => `<td style="border:2px solid #1c1a17;padding:10px 6px;text-align:center;background:#efe6d2"><div style="font-size:22px;font-weight:700;font-family:'Space Grotesk',Arial,sans-serif">${n}</div><div style="font-size:11px;color:#5c5548">${label}</div></td>`;
    const n = played + left;
    const tag = !played ? 'WARMING UP' : left ? 'ON THE BOARD' : 'GROUP DONE';
    const sq = (i) => `<td width="${Math.floor(100 / n)}%" style="padding:0 3px"><div style="height:38px;border:2px solid #1c1a17;background:${i < played ? '#e0552b' : '#efe6d2'};text-align:center;line-height:38px;font-size:${i < played ? 20 : 14}px;font-weight:700;color:${i < played ? '#1c1a17' : '#9a917f'}">${i < played ? '&#9822;' : i + 1}</div></td>`;
    const caption = left ? `&rarr; Game ${played + 1} is next. ${left} to go.` : '&rarr; All games played. Nice.';
    const you = `<div style="border:2px solid #1c1a17;background:#faf6ec;margin:0 0 14px;box-shadow:4px 4px 0 #1c1a17">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1c1a17"><tr>
        <td style="padding:6px 10px;color:#efe6d2;font-size:10px;font-weight:700;letter-spacing:0.12em">YOUR GAMES</td>
        <td align="right" style="padding:5px 8px"><span style="background:#e0552b;color:#1c1a17;font-size:10px;font-weight:700;letter-spacing:0.08em;padding:3px 8px">${tag}</span></td></tr></table>
      <div style="padding:12px 12px 10px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700"><span style="font-size:36px;letter-spacing:-0.03em">${played}</span><span style="font-size:18px;color:#5c5548"> /${n}</span></td>
          <td align="right" valign="bottom" style="font-size:11px;color:#5c5548;padding-bottom:6px">played</td></tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px -3px 0;width:calc(100% + 6px)"><tr>${Array.from({ length: n }, (_, i) => sq(i)).join('')}</tr></table>
        <div style="font-size:12px;color:#e0552b;font-weight:700;padding-top:10px">${caption}</div>
      </div></div>`;
    const list = remaining.length
      ? `<p style="margin:0 0 6px"><strong>${zero ? 'Your opponents' : 'Still waiting for you'}:</strong></p>
        <ul style="padding-left:18px;margin:0 0 14px">${remaining.map((o) => `<li style="margin:4px 0">${opponentLine(o)}</li>`).join('')}</ul>` : '';
    return {
      subject: zero ? `${first(player.name)}, your pieces miss you (tournament update)` : `Tournament update: ${stats.done} of ${stats.total} games played`,
      html: layout(`Thank you. Now please play.`, `
        <p>Hi ${esc(first(player.name))}. First, the important part: <strong>thank you</strong>. A few weeks ago this was a flyer and an idea. Now ${esc(String(stats.players))} people from all over the building are playing real games of chess against each other, and that only happens because you showed up. We love that.</p>
        <p>Now, the less glamorous part. A progress report:</p>
        <table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="margin:0 -3px"><tr>
          ${stat(`${stats.done}/${stats.total}`, 'group games done')}${stat(`${stats.pct}%`, 'of the group stage')}${stat(stats.idle, 'players on 0 games')}
        </tr></table>
        ${bar}
        <p style="margin:14px 0 6px"><strong>The maths nobody asked for.</strong> The first result came in on 1 October. Since then we've averaged about <strong>${esc(String(stats.perDay))} games a day</strong>. At that pace the group stage ends around <strong>${esc(stats.groupsEta)}</strong>, and the champion gets crowned around <strong>${esc(stats.finalEta)}</strong>. By then the chess sets in the kitchens will have collected dust, and so will we.</p>
        <p>The good news is that this is easy to fix. A game takes about 15 minutes. That's one coffee break, and it moves the whole tournament forward.</p>
        ${you}
        ${list}
        <p style="margin:0 0 6px"><strong>The ask: get on Telegram.</strong> It's the fastest way to find an opponent. Join the channel, say "anyone free for chess today?", and someone will almost certainly be up for a game within the hour.</p>
        <p style="margin:12px 0"><a href="https://t.me/+_gfRxTIi3tBkNGFk" style="display:inline-block;background:#2b3f6b;color:#faf6ec;padding:12px 20px;border:2px solid #1c1a17;font-weight:700;text-decoration:none">Join the Telegram channel &rarr;</a></p>
        <p>Prefer email? That works too: message an opponent from the list above directly and agree a time. Either way, aim to play <em>this week</em>. Lunch hour and end of day both work.</p>
        ${button(url, 'Your player page')}
        <p style="font-size:12px;color:#5c5548">Reporting is easy. Either player taps the result on the page above, and the other confirms. No reply within ${esc(env.CONFIRM_HOURS)} hours counts as confirmed.</p>`),
      text: `Hi ${first(player.name)}. Thank you for making this tournament happen.
Progress: ${stats.done} of ${stats.total} group games played (${stats.pct}%), ${stats.idle} players still on 0 games. At ~${stats.perDay} games/day the group stage ends around ${stats.groupsEta} and the champion is crowned around ${stats.finalEta}.
You have played ${played} of ${played + left}. ${left ? 'Please join the Telegram channel (or email an opponent) and set a time this week.' : 'Nice work.'}
Telegram: https://t.me/+_gfRxTIi3tBkNGFk
Your page: ${url}`,
    };
  },

  // Final-push nudge near the end of the group stage. groups: from groupProgress().
  // played / left / remaining: this player's own group games, as in `progress`.
  finalPush(env, { player, groups, players, played, left, remaining }) {
    const url = meLink(env, player.token);
    const deadline = '23 October';
    const done = groups.reduce((n, g) => n + g.done, 0);
    const total = groups.reduce((n, g) => n + g.total, 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const lead = [...groups].sort((a, b) => b.pct - a.pct)[0];
    const other = groups.find((g) => g !== lead);
    const bar = (p, color) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:2px solid #1c1a17;margin:5px 0 3px"><tr>
        <td width="${p}%" style="background:${color};height:20px;font-size:0;line-height:0">&nbsp;</td>
        <td style="background:#faf6ec;height:20px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    const groupBar = (g) => `<div style="margin:0 0 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:15px">${esc(g.full)}${g === lead && other ? ' <span style="font-size:11px;color:#e0552b">&#9818; in the lead</span>' : ''}</td>
        <td align="right" style="font-size:12px;color:#5c5548"><strong style="color:#1c1a17">${g.done}/${g.total}</strong> games &middot; ${g.pct}%</td></tr></table>
      ${bar(g.pct, '#e0552b')}
      <div style="font-size:12px;color:#5c5548">${g.left ? `${g.left} game${g.left === 1 ? '' : 's'} to go` : 'All done. Take a bow.'}</div>
    </div>`;
    const n = played + left;
    const myPct = n ? Math.round((played / n) * 100) : 0;
    const you = `<div style="border:2px solid #1c1a17;background:${left ? '#faf6ec' : '#e4f1e4'};padding:14px 14px 10px;margin:0 0 16px;box-shadow:4px 4px 0 #1c1a17">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:15px">You, ${esc(first(player.name))}${left ? '' : ' <span style="font-size:11px;color:#2e7d4f">&#10003; group stage complete</span>'}</td>
        <td align="right" style="font-size:12px;color:#5c5548"><strong style="color:#1c1a17">${played}/${n}</strong> games &middot; ${myPct}%</td></tr></table>
      ${bar(myPct, left ? '#e0552b' : '#2e7d4f')}
      <div style="font-size:12px;color:#5c5548">${left ? `${left} game${left === 1 ? '' : 's'} to go` : 'All played. You can relax, heckle, and cheer.'}</div>
    </div>`;
    const list = remaining.length
      ? `<p style="margin:0 0 6px"><strong>Still on your list:</strong></p>
        <ul style="padding-left:18px;margin:0 0 14px">${remaining.map((o) => `<li style="margin:4px 0">${opponentLine(o)}</li>`).join('')}</ul>`
      : '';
    return {
      subject: left ? `Final push: ${left} game${left === 1 ? '' : 's'} to play before ${deadline}` : `Final push: group stage ends ${deadline} (you're already done)`,
      html: layout(`${pct}% there. Let's land this thing.`, `
        <p>Hi ${esc(first(player.name))}. Quick one from tournament HQ, and it starts with a thank you. ${esc(String(players))} of you signed up for something that was a flyer and a hunch a month ago, and between you you've played <strong>${done} games of chess</strong>. The kitchen chess sets have seen more action this month than in their entire previous lives. That's you. Thank you.</p>
        <p>Now the scoreboard, group by group:</p>
        <div style="border:2px solid #1c1a17;background:#efe6d2;padding:14px 14px 2px;margin:0 0 16px;box-shadow:4px 4px 0 #1c1a17">${groups.map(groupBar).join('')}</div>
        ${other ? `<p><strong>${esc(lead.full)} is ahead by a nose.</strong> ${esc(other.full)}, no pressure, but the whole building is watching.</p>` : ''}
        <p><strong>The final push, with a date on it.</strong> The group stage ends on <strong>${deadline}</strong>. At the end of that day the top two of each group advance to the semi-finals, whatever is left on the board. There are <strong>${total - done} games</strong> to go in total, so one game each this week and next gets us there. A game is 20 minutes, tops. That's one long coffee break with a slightly higher pulse.</p>
        ${you}
        ${list}
        <p>Finding an opponent is the easy part: say hi in the Telegram group, or email someone from your list and pick a time. Lunch hour and end of day both work. Then tap the result on your player page and you're done.</p>
        <p style="margin:12px 0"><a href="https://t.me/+_gfRxTIi3tBkNGFk" style="display:inline-block;background:#2b3f6b;color:#faf6ec;padding:12px 20px;border:2px solid #1c1a17;font-weight:700;text-decoration:none">Open the Telegram group &rarr;</a></p>
        ${button(url, 'Your player page')}
        <p>Go forth and castle.</p>`),
      text: `Hi ${first(player.name)}. Thank you: ${players} of you signed up and ${done} games have been played.
Scoreboard:
${groups.map((g) => `- ${g.full}: ${g.done}/${g.total} games (${g.pct}%), ${g.left} to go`).join('\n')}
The group stage ends on ${deadline}. At the end of that day the top two of each group advance to the semi-finals. ${total - done} games to go in total.
You: ${played}/${n} played${left ? `, ${left} to go. Still on your list: ${remaining.map((o) => `${o.name} (${o.email})`).join(', ')}.` : '. All done!'}
Telegram: https://t.me/+_gfRxTIi3tBkNGFk
Your page: ${url}`,
    };
  },
  // One-off after the organizer ends the group stage. tables: { P, A } ordered rows.
  // semis: [series SF1, series SF2] from seriesOf. played / closed: group game counts.
  groupsEnded(env, { player, tables, byId, semis, played, closed }) {
    const url = meLink(env, player.token);
    const deadline = 'Friday 6 November';
    const nm = (id) => (byId.get(id) || {}).name || '?';
    const groupBox = (key) => {
      const rows = tables[key] || [];
      const tied = rows.length > 1 && rows[0].points === rows[1].points;
      const line = (r, i) => `<tr><td style="padding:4px 0;width:34px;font-weight:700;color:#e0552b">${key}${i + 1}</td><td style="padding:4px 0"><strong>${esc(nm(r.id))}</strong></td><td align="right" style="padding:4px 0;font-size:12px;color:#5c5548">${r.points} pts &middot; ${r.played} games</td></tr>`;
      return `<div style="margin:0 0 12px">
        <div style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:15px;margin-bottom:2px">${esc(GROUPS[key].full)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.slice(0, 2).map(line).join('')}</table>
        ${tied ? `<div style="font-size:12px;color:#5c5548">Level on points. The tiebreak (head-to-head, then wins, then the drawing of lots) decided who is ${key}1.</div>` : ''}
      </div>`;
    };
    const sf = (s, i) => `<tr><td style="padding:6px 0;width:44px;font-weight:700">SF${i + 1}</td><td style="padding:6px 0"><strong>${esc(nm(s.a))}</strong> <span style="color:#5c5548">vs</span> <strong>${esc(nm(s.b))}</strong></td></tr>`;
    const mine = semis.find((s) => s.a === player.id || s.b === player.id);
    const opp = mine ? byId.get(mine.a === player.id ? mine.b : mine.a) : null;
    const you = opp
      ? `<div style="border:2px solid #1c1a17;background:#e4f1e4;padding:12px 14px;margin:0 0 16px;box-shadow:4px 4px 0 #1c1a17">
          <div style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:16px">&#9818; You're in the semis, ${esc(first(player.name))}!</div>
          <div style="margin-top:6px">Your opponent: ${opponentLine(opp)}. You have <strong>${mine.a === player.id ? 'White' : 'Black'}</strong> in game 1. A separate email with your report links is in your inbox too.</div></div>`
      : `<div style="border:2px solid #1c1a17;background:#efe6d2;padding:12px 14px;margin:0 0 16px">
          <div style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:15px">Your tournament run ends here, ${esc(first(player.name))}.</div>
          <div style="margin-top:6px">But the fun doesn't. Cheer for your favourite, watch the bracket, and start your secret training for next season.</div></div>`;
    return {
      subject: `Group stage: game over. Meet the final four ♞`,
      html: layout(`The groups are done. Four players remain.`, `
        <p>Hi ${esc(first(player.name))}. Beep boop, tournament HQ here. The group stage clock hit 0:00 on 23 October. Together you played <strong>${played} games</strong>. That's a lot of coffee breaks turned into chess. Thank you!</p>
        ${closed ? `<p>${closed} game${closed === 1 ? ' was' : 's were'} still on the board at the deadline. Those are now closed: no points for anyone, no hard feelings.</p>` : ''}
        <p style="margin:0 0 6px"><strong>Who goes through:</strong></p>
        <div style="border:2px solid #1c1a17;background:#faf6ec;padding:12px 14px 2px;margin:0 0 16px;box-shadow:4px 4px 0 #1c1a17">${groupBox('P')}${groupBox('A')}</div>
        <p style="margin:0 0 6px"><strong>The semi-finals</strong> (group winner vs the other group's runner-up):</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-top:1px solid #1c1a17;border-bottom:1px solid #1c1a17">${semis.map(sf).join('')}</table>
        ${you}
        <p style="margin:0 0 6px"><strong>Semi rules: best of 3, never more than 3 games.</strong></p>
        <ol style="padding-left:20px;margin:0 0 14px">
          <li style="margin:6px 0"><strong>Games 1 and 2:</strong> each player has White once. 10 minutes each, no increment. Win = 1 point, draw = ½.</li>
          <li style="margin:6px 0">After two games, the higher score goes through (2–0 or 1½–½).</li>
          <li style="margin:6px 0"><strong>1–1?</strong> Game 3 is <strong>Armageddon</strong>. The site flips a coin for colours, both get 10 minutes, and <strong>a draw means Black goes through</strong>. So there is always a winner.</li>
          <li style="margin:6px 0">Report every game on your player page, same as before.</li>
        </ol>
        <p><strong>Deadline: end of ${deadline}.</strong> That's two weeks for at most three games. Very doable, even with a full calendar.</p>
        <p>After that: the <strong>final</strong> and the <strong>bronze match</strong>, with the same best-of-3 rules. Dates follow.</p>
        ${button(url, 'Your player page')}
        <p>May your forks be royal and your flags never fall.</p>`),
      text: `Hi ${first(player.name)}. The group stage ended on 23 October after ${played} games.${closed ? ` ${closed} unplayed games are closed (no points).` : ''}
Through to the semis:
${['P', 'A'].map((k) => (tables[k] || []).slice(0, 2).map((r, i) => `- ${k}${i + 1} ${nm(r.id)} (${r.points} pts, ${GROUPS[k].full})`).join('\n')).join('\n')}
Semi-finals:
${semis.map((s, i) => `- SF${i + 1}: ${nm(s.a)} vs ${nm(s.b)}`).join('\n')}
${opp ? `You're in! Your opponent: ${opp.name} (${opp.email}). You have ${mine.a === player.id ? 'White' : 'Black'} in game 1.` : 'Your run ends here, but come cheer.'}
Semi rules: best of 3. Games 1 and 2: White once each, 10 minutes, win 1, draw 1/2. Higher score after two games goes through. At 1-1, game 3 is Armageddon: coin toss for colours, 10 minutes each, a draw means Black goes through.
Deadline: end of ${deadline}. Then the final and bronze match, same rules.
Your page: ${url}`,
    };
  },

  reported(env, { player, reporter, outcomeText, gameId }) {
    const url = gameLink(env, player.token, gameId);
    return {
      subject: `${first(reporter.name)} reported your game: ${outcomeText}`,
      replyTo: reporter.email,
      html: layout(`Result reported.`, `
        <p><strong>${esc(reporter.name)}</strong> reported: <strong>${esc(outcomeText)}</strong>.</p>
        <p>If that's right, confirm it. If not, dispute it and the organizer will sort it out.</p>
        ${button(url, 'Confirm or dispute')}
        <p style="font-size:12px;color:#5c5548">No reply within ${esc(env.CONFIRM_HOURS)} hours counts as confirmed.</p>`),
      text: `${reporter.name} reported: ${outcomeText}. Confirm or dispute: ${url}`,
    };
  },

  confirmed(env, { player, opponent, outcomeText }) {
    return {
      subject: `Confirmed: ${outcomeText}`,
      replyTo: opponent.email,
      html: layout(`Confirmed.`, `
        <p>Your game against <strong>${esc(opponent.name)}</strong> is in the books: <strong>${esc(outcomeText)}</strong>.</p>
        ${button(env.SITE_URL + '/#groups', 'See the groups')}`),
      text: `Confirmed: ${outcomeText} vs ${opponent.name}. Standings: ${env.SITE_URL}/#groups`,
    };
  },

  dispute(env, { game, p1, p2, reporter, result }) {
    return {
      subject: `Dispute on game #${game.id}: ${p1.name} vs ${p2.name}`,
      html: layout(`Dispute on game #${game.id}.`, `
        <p><strong>${esc(p1.name)}</strong> (${esc(p1.email)}) vs <strong>${esc(p2.name)}</strong> (${esc(p2.email)}).</p>
        <p>${esc(reporter.name)} reported <strong>${esc(result)}</strong> (p1 perspective). The opponent disputed it.</p>
        ${button(env.SITE_URL + '/admin', 'Open admin')}`),
      text: `Dispute on game #${game.id}: ${p1.name} (${p1.email}) vs ${p2.name} (${p2.email}). Reported ${result} by ${reporter.name}. Admin: ${env.SITE_URL}/admin`,
    };
  },

  champion(env, { champion }) {
    return {
      subject: `We have a champion: ${champion.name}`,
      html: layout(`We have a champion.`, `
        <p><strong>${esc(champion.name)}</strong> (${esc(champion.company)}) won the Q hub Friendly Chess Tournament.</p>
        <p>Thanks for playing. Go say hi to someone you played.</p>
        ${button(env.SITE_URL, 'See the final bracket')}`),
      text: `${champion.name} (${champion.company}) won the Q hub Friendly Chess Tournament. ${env.SITE_URL}`,
    };
  },
};

export function outcomeText(game, p1, p2) {
  if (game.result === '1-0') return `${p1.name} beat ${p2.name}`;
  if (game.result === '0-1') return `${p2.name} beat ${p1.name}`;
  return `${p1.name} and ${p2.name} drew`;
}
