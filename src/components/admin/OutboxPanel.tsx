import React from 'react';
import { Mail, MessageSquareText } from 'lucide-react';
import type { OutboxMessage } from '../../types/car';
import { backend } from '../../lib/backend';
import { Card } from '../ui/Layout';
import { Pill } from './AdminParts';

/** Log of automated confirmations and reminders (email + SMS). */
export const OutboxPanel: React.FC<{ outbox: OutboxMessage[] }> = ({ outbox }) => (
  <div>
    <p className="mb-4 text-sm text-ink-muted">
      {backend.isDemo
        ? 'Demo mode: these messages are simulated — nothing is actually sent. With Supabase they are delivered by email (Resend) and SMS (Termii).'
        : 'Sent automatically when bookings are created, paid, confirmed, started, completed or cancelled, plus pick-up and return reminders.'}
    </p>
    <Card className="divide-y divide-line overflow-hidden">
      {outbox.length === 0 && <p className="p-5 text-sm text-ink-soft">No messages yet. They appear here as bookings change.</p>}
      {outbox.map((m) => (
        <div key={m.id} className="flex items-start gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
            {m.channel === 'email' ? <Mail className="size-[18px]" /> : <MessageSquareText className="size-[18px]" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{m.subject}</p>
            <p className="truncate text-sm text-ink-soft">
              {m.channel.toUpperCase()} → {m.recipient} · {m.event}
              {m.bookingId ? ` · ${m.bookingId}` : ''}
            </p>
            {m.error && <p className="text-sm text-brand">{m.error}</p>}
          </div>
          <div className="shrink-0 text-right">
            <Pill className={m.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : m.status === 'failed' ? 'bg-brand-soft text-brand' : 'bg-amber-50 text-amber-800'}>{m.status}</Pill>
            <p className="mt-1 text-xs text-ink-soft">{new Date(m.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </div>
        </div>
      ))}
    </Card>
  </div>
);
