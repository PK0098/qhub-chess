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

  // stage: 'group' | 'semi' | 'final' | 'third'. games: [{id, opponent:{name,company,email}}]
  pairings(env, { player, stage, games }) {
    const grp = groupName(player.grp);
    const rows = games.map((g) =>
      `<li style="margin:8px 0">${opponentLine(g.opponent)}<br><a href="${esc(gameLink(env, player.token, g.id))}" style="color:#2b3f6b">Report this result</a></li>`).join('');
    const stageName = { semi: 'Semi-final', final: 'The final', third: 'Third-place game' }[stage];
    const title = stage === 'group' ? `Pairings are out. You're in ${esc(grp)}.` : `${stageName}: your opponent.`;
    const intro = {
      group: `<p>Registration is closed and the hat has spoken: you're in <strong>${esc(grp)}</strong>. Play everyone in your group once. Win 3, draw 1, loss 0, excuses 0. The top two go to the semi-finals.</p>`,
      semi: `<p>Top two in your group. Nice. The semi-final is one game: win it and you play the final, lose it and you play for bronze (still a medal, still bragging rights).</p>`,
      final: `<p>You won your semi. One more game and it's your name on the site for a whole year. No pressure.</p>`,
      third: `<p>The semi didn't go your way, but bronze is still up for grabs. One game, one podium spot.</p>`,
    }[stage];
    const replyTo = games.map((g) => g.opponent.email);
    const howTo = `<p>Email your opponent${games.length > 1 ? 's' : ''} to pick a time. Chess sets live in the kitchens on floors 4 and 5. Bring a phone with a chess clock app set to 10+0. Snacks optional but encouraged.</p>`;
    const noDraw = stage === 'group' ? '' : `<p><strong>No draws from here on.</strong> If a game is drawn, play again until someone cracks, then report that result.</p>`;
    const reporting = `<p>Either player reports the result. The other confirms. Silence for ${esc(env.CONFIRM_HOURS)} hours counts as a confirmation, so don't ghost your opponent.</p>`;
    return {
      subject: stage === 'group' ? `Pairings are out — you're in ${grp}` : `${stageName}: your opponent`,
      replyTo: replyTo.length === 1 ? replyTo[0] : undefined,
      html: layout(title, `${intro}
        ${howTo}
        <ul style="padding-left:18px;margin:0">${rows}</ul>
        ${noDraw}
        ${reporting}
        ${button(meLink(env, player.token), 'Your player page')}`),
      text: `${title}\n${games.map((g) => `- ${g.opponent.name} (${g.opponent.company}) ${g.opponent.email}\n  report: ${gameLink(env, player.token, g.id)}`).join('\n')}${stage === 'group' ? '' : '\nNo draws: a drawn game is replayed until someone wins.'}\nYour page: ${meLink(env, player.token)}`,
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
