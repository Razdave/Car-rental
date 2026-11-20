import React, { useMemo } from 'react';
import { ChevronLeft, Inbox } from 'lucide-react';
import type { BookingMessage, Customer } from '../../types/car';
import { backend } from '../../lib/backend';
import { ChatThread } from '../messaging/ChatThread';
import { cn } from '../ui/Button';
import { Card, EmptyState } from '../ui/Layout';

interface Props {
  messages: BookingMessage[];
  customers: Customer[];
  selected: { customerId: string; bookingId: string | null } | null;
  onSelect: (s: { customerId: string; bookingId: string | null } | null) => void;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

/** Staff inbox: one thread per customer, newest first; replies go out live. */
export const InboxPanel: React.FC<Props> = ({ messages, customers, selected, onSelect, run }) => {
  const threads = useMemo(() => {
    const byCustomer = new Map<string, BookingMessage[]>();
    for (const m of messages) byCustomer.set(m.customerId, [...(byCustomer.get(m.customerId) ?? []), m]);
    return [...byCustomer.entries()]
      .map(([customerId, list]) => {
        const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return { customerId, list: sorted, last: sorted[sorted.length - 1] };
      })
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [messages]);

  const nameOf = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.fullName || c?.email || threads.find((t) => t.customerId === id)?.list.find((m) => m.sender === 'customer')?.senderName || id;
  };

  const active = selected ? threads.find((t) => t.customerId === selected.customerId) : null;
  const needsReply = (t: (typeof threads)[number]) => t.last.sender === 'customer';

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className={cn('divide-y divide-line overflow-hidden', selected && 'hidden lg:block')}>
        {threads.length === 0 && <p className="p-5 text-sm text-ink-soft">No conversations yet.</p>}
        {threads.map((t) => (
          <button
            key={t.customerId}
            type="button"
            onClick={() => onSelect({ customerId: t.customerId, bookingId: null })}
            className={cn('flex min-h-16 w-full items-start gap-3 p-4 text-left hover:bg-surface', selected?.customerId === t.customerId && 'bg-surface')}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-bold">{nameOf(t.customerId)}</span>
                {needsReply(t) && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Awaiting reply" />}
              </span>
              <span className="block truncate text-sm text-ink-soft">
                {t.last.sender === 'staff' ? 'You: ' : ''}
                {t.last.body}
              </span>
            </span>
            <span className="shrink-0 text-xs text-ink-soft">{new Date(t.last.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </button>
        ))}
      </Card>

      {selected ? (
        <Card className="flex h-[70dvh] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <button type="button" aria-label="Back to conversations" onClick={() => onSelect(null)} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2 lg:hidden">
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-bold">{nameOf(selected.customerId)}</p>
              {selected.bookingId && <p className="text-xs font-bold text-brand">Replying about {selected.bookingId}</p>}
            </div>
          </div>
          <ChatThread
            className="flex-1 bg-surface"
            viewer="staff"
            messages={active?.list ?? []}
            emptyText="Start the conversation — the customer gets it in their Messages."
            onSend={async (body) => {
              const ok = await run(() => backend.admin.replyMessage(selected.customerId, body, selected.bookingId));
              if (!ok) throw new Error('not sent');
            }}
          />
        </Card>
      ) : (
        <div className="hidden lg:block">
          <EmptyState icon={<Inbox className="size-7" />} title="Select a conversation" description="Customer messages arrive here live." />
        </div>
      )}
    </div>
  );
};
