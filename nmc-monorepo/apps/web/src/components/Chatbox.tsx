// AI chatbox — a small floating panel that uses the @nmc/ai package
// to provide ticket-parsing and contact suggestions.

import { useEffect, useRef, useState } from 'react';
import { parseTicket, classify, suggestContact } from '@nmc/ai';
import { IconChat, IconX, IconSend } from '../lib/icons';

type Message = { id: string; who: 'user' | 'bot'; text: string; html?: string };

export function Chatbox({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', who: 'bot', text: 'Hi! Paste a raw ticket text and I will parse it. Try "FO link down, TT 12345".' },
  ]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const userMsg: Message = { id: crypto.randomUUID(), who: 'user', text };
    const reply: Message = { id: crypto.randomUUID(), who: 'bot', text: handle(text) };
    setMessages((prev) => [...prev, userMsg, reply]);
    setDraft('');
  }

  return (
    <div className="chatbox" role="dialog" aria-label="AI chat">
      <div className="head">
        <IconChat />
        <h4>NMC AI</h4>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat"><IconX /></button>
      </div>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.who}`}>{m.text}</div>
        ))}
      </div>
      <form className="input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type or paste a ticket…"
        />
        <button className="btn sm" type="submit"><IconSend size={14} /></button>
      </form>
    </div>
  );
}

function handle(input: string): string {
  const parsed = parseTicket(input);
  if (parsed.category) {
    const cls = classify(parsed.category, input);
    return `Category: ${parsed.category}\nDept: ${cls.department ?? '—'}\nIssue: ${cls.issue ?? '—'}\nTags: ${(cls.tags ?? []).join(', ') || '—'}`;
  }
  // try contact suggestion
  try {
    const raw = localStorage.getItem('nmc.contacts');
    const contacts = raw ? JSON.parse(raw) as { id: string; name?: string; phone?: string; zone?: string; dept?: string }[] : [];
    const top = suggestContact(input, contacts, 3);
    if (top.length) {
      return 'Possible contacts:\n' + top.map((c) => `• ${c.name ?? c.id}${c.zone ? ` (${c.zone})` : ''}${c.phone ? ` — ${c.phone}` : ''}`).join('\n');
    }
  } catch { /* ignore */ }
  return 'I couldn\'t parse that. Try pasting a ticket, contact name, or zone.';
}
