import React, { useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizontal } from 'lucide-react';
import type { BookingMessage } from '../../types/car';
import { cn } from '../ui/Button';

interface ChatThreadProps {
  messages: BookingMessage[];
  viewer: 'customer' | 'staff';
  onSend: (body: string) => Promise<void>;
  emptyText: string;
  className?: string;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('en-GB', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const ChatThread: React.FC<ChatThreadProps> = ({ messages, viewer, onSend, emptyText, className }) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setDraft('');
    } catch {
      /* the caller shows the error; keep the draft so nothing is lost */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">{emptyText}</p>}
        {messages.map((m) => {
          const mine = m.sender === viewer;
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div className={cn('max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug', mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white text-ink shadow-card')}>
                {m.bookingId && <p className={cn('mb-0.5 text-xs font-bold', mine ? 'text-white/60' : 'text-brand')}>Re: {m.bookingId}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
              <p className="mt-1 px-2 text-xs text-ink-soft">
                {mine ? 'You' : m.senderName} · {timeLabel(m.createdAt)}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-white p-3">
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Write a message…"
            className="field max-h-32 min-h-12 resize-none"
          />
        </label>
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || sending}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-colors hover:bg-brand-dark disabled:opacity-40"
        >
          {sending ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
        </button>
      </form>
    </div>
  );
};
