// components/chatbox.js — AI chatbox (rule-based) used in Tickets page
(function (global) {
  function buildChatBox(opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'chat';
    el.innerHTML = `
      <div class="messages" data-msgs></div>
      <div class="input">
        <input type="text" placeholder="Ask: 'Parse this ticket' / 'Which dept for BGP flap?' / 'Contact for CTG Sonagazi'" data-input />
        <button class="btn" data-send>Send</button>
      </div>`;
    const msgs = el.querySelector('[data-msgs]');
    const input = el.querySelector('[data-input]');
    const send = el.querySelector('[data-send]');

    function push(role, text, html) {
      const m = document.createElement('div');
      m.className = 'msg ' + role;
      if (html) m.innerHTML = text; else m.textContent = text;
      msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight;
    }

    function ask(q) {
      push('user', q);
      setTimeout(() => {
        const r = answer(q, opts);
        if (r.html) push('bot', r.text, true); else push('bot', r.text);
        if (opts.onResult) opts.onResult(r);
      }, 200);
    }

    send.addEventListener('click', () => { const v = input.value.trim(); if (v) { ask(v); input.value = ''; } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send.click(); });

    // initial greeting
    push('bot', "Hi! I'm the NMC AI assistant. I can parse ticket text, classify incidents, and suggest contacts. Try: 'parse: ' followed by your ticket text.");
    return el;
  }

  function answer(q, opts) {
    const U = (window.NMCUI || {});
    const AI = (window.NMCAI || {});
    const S = (window.NMCStore || {});
    const lower = q.toLowerCase();

    if (lower.startsWith('parse:')) {
      const raw = q.slice(6).trim();
      const p = AI.parseTicket(raw);
      const html = `<b>Parsed:</b><br>` +
        `Category: <code>${U.escapeHtml(p.category)}</code><br>` +
        `BTS/Area: <code>${U.escapeHtml(p.bts)}</code><br>` +
        `IC: <code>${U.escapeHtml(p.icRaw)}</code> → Service Impacted: <code>${U.escapeHtml(p.serviceImpacted)}</code><br>` +
        `Fault: <code>${U.escapeHtml(p.faultTime)}</code> • TT: <code>${U.escapeHtml(p.ticketId)}</code><br>` +
        `Classified: <code>${U.escapeHtml(p.category)}</code> → Dept: <b>${(AI.classify(p.category, raw).dept)}</b>`;
      return { text: html, html: true, parsed: p };
    }

    if (lower.startsWith('dept ') || lower.startsWith('which dept')) {
      const rest = q.replace(/^(which\s+)?dept\s*/i, '');
      const r = AI.classify(rest, rest);
      return { text: `For <b>${U.escapeHtml(rest)}</b> → Forward to <b>${U.escapeHtml(r.dept)}</b> (Issue: ${U.escapeHtml(r.issue)})`, html: true };
    }

    if (lower.startsWith('contact ')) {
      const rest = q.slice(8).trim();
      const contacts = S.list('contacts');
      const r = AI.suggestContact(rest, contacts, 5);
      if (!r.length) return { text: `No contact found for "${rest}". Try a different keyword.` };
      const html = '<b>Suggested contacts:</b><br>' + r.map((c, i) =>
        `${i+1}. <b>${U.escapeHtml(c.name)}</b> — ${U.escapeHtml(c.role)} · ${U.escapeHtml(c.dept)} · ${U.escapeHtml(c.zone||'-')} · <a href="tel:${U.escapeHtml(c.phone)}">${U.escapeHtml(c.phone)}</a>`
      ).join('<br>') +
      `<br><br><button class="btn sm" onclick="window.NMCAI.learnContact('${U.escapeHtml(rest)}','${r[0].id}'); window.NMCUI.toast('Learned!','success')">👍 Use top result</button>`;
      return { text: html, html: true };
    }

    // help
    return { text: "Try: <code>parse: Incident Notification || Category: BGP Flap ...</code> · <code>dept Router Down</code> · <code>contact CTG Sonagazi</code>" };
  }

  window.NMCChat = { build: buildChatBox };
})(window);
