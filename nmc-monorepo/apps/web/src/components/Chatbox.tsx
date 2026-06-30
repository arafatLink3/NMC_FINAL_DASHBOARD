// AI chatbox — a small floating panel that uses the @nmc/api-client
// to persist manual overrides via /api/ai/train and the @nmc/ai
// package for parsing/suggestion. Replaces the legacy localStorage
// `nmc.aiTraining` key.

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTicket, classify, suggestContact } from '@nmc/ai';
import { IconChat, IconX, IconSend, IconCheck } from '../lib/icons';
import { useApi } from '../lib/api';
import { useNotif } from '../lib/notif';

type Message = { id: string; who: 'user' | 'bot'; text: string; html?: string };

const SUGGESTED_DEPTS = [
  'NCSS', 'Survey & Transmission', 'BTS & Power Infrastructure',
  'NGNC', 'BNOC', 'NMC', 'Manual select',
];

export function Chatbox({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const { push } = useNotif();
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', who: 'bot', text: 'Hi! Paste a raw ticket text and I will parse it. Try "FO link down, TT 12345".' },
  ]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<null | {
    category: string;
    text: string;
    suggestedDept: string;
  }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const userMsg: Message = { id: crypto.randomUUID(), who: 'user', text };
    const { reply, follow } = handle(text);
    setMessages((prev) => [...prev, userMsg, reply]);
    setDraft('');
    if (follow) setPending(follow);
  }

  async function acceptDept(dept: string) {
    if (!pending) return;
    const { category, text } = pending;
    try {
      await api.train({ category, department: dept });
      push(`Saved training: ${category} → ${dept}`, 'success');
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), who: 'bot', text: `Got it — next time I'll route "${category}" to ${dept}.` },
      ]);
    } catch (e) {
      push(`Could not save training: ${(e as Error).message}`, 'danger');
    } finally {
      setPending(null);
    }
  }

  async function dismiss() {
    setPending(null);
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
        {pending && (
          <div className="msg bot train">
            <div>AI suggested <b>{pending.suggestedDept}</b> for category <b>{pending.category}</b>. Confirm to teach the AI?</div>
            <div className="train-actions">
              {SUGGESTED_DEPTS.map((d) => (
                <button key={d} className="btn sm" onClick={() => void acceptDept(d)}>
                  {d === pending.suggestedDept && <IconCheck size={12} />} {d}
                </button>
              ))}
              <button className="btn ghost sm" onClick={() => void dismiss()}>Skip</button>
            </div>
          </div>
        )}
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

function handle(input: string): { reply: Message; follow: null | { category: string; text: string; suggestedDept: string } } {
  const parsed = parseTicket(input);
  if (parsed.category) {
    const cls = classify(parsed.category, input);
    const reply: Message = {
      id: crypto.randomUUID(),
      who: 'bot',
      text: `Category: ${parsed.category}\nDept: ${cls.department ?? '—'}\nIssue: ${cls.issue ?? '—'}\nTags: ${(cls.tags ?? []).join(', ') || '—'}`,
    };
    return {
      reply,
      follow: {
        category: parsed.category,
        text: input,
        suggestedDept: cls.department ?? 'NMC',
      },
    };
  }
  // try contact suggestion
  try {
    const raw = localStorage.getItem('nmc.contacts');
    const contacts = raw ? JSON.parse(raw) as { id: string; name?: string; phone?: string; zone?: string; dept?: string }[] : [];
    const top = suggestContact(input, contacts, 3);
    if (top.length) {
      return {
        reply: {
          id: crypto.randomUUID(),
          who: 'bot',
          text: 'Possible contacts:\n' + top.map((c) => `• ${c.name ?? c.id}${c.zone ? ` (${c.zone})` : ''}${c.phone ? ` — ${c.phone}` : ''}`).join('\n'),
        },
        follow: null,
      };
    }
  } catch { /* ignore */ }
  return { reply: { id: crypto.randomUUID(), who: 'bot', text: 'I couldn\'t parse that. Try pasting a ticket, contact name, or zone.' }, follow: null };
}
