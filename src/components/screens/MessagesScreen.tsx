import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import type { BookingMessage } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';
import { ChatThread } from '../messaging/ChatThread';
import { markMessagesSeen } from '../layout/LiveEvents';
import { Container, DetailHeader } from '../ui/Layout';

/** The customer's conversation with the rental team (live). `?booking=ID` tags new messages. */
export const MessagesScreen: React.FC = () => {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const { profile, authReady, showToast } = useAppState();
  const [messages, setMessages] = useState<BookingMessage[]>([]);

  const load = useCallback(() => {
    backend.listMessages().then((m) => { setMessages(m); markMessagesSeen(); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return;
    load();
    return backend.onMessages(load);
  }, [profile, load]);

  if (authReady && !profile) return <Navigate to={`/signin?next=${encodeURIComponent(`/messages${bookingId ? `?booking=${bookingId}` : ''}`)}`} replace />;

  return (
    <>
      <DetailHeader
        fallback="/profile"
        eyebrow={bookingId ? `About ${bookingId}` : 'Concierge'}
        title="Messages"
        actions={
          <a href="tel:+18002739227" aria-label="Call us" className="flex size-11 items-center justify-center rounded-full border border-line bg-white shadow-sm">
            <PhoneCall className="size-[18px]" />
          </a>
        }
      />
      <Container className="max-w-2xl px-0 sm:px-6">
        <ChatThread
          className="h-[calc(100dvh-4rem)] sm:my-6 sm:h-[70dvh] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-line lg:h-[calc(100dvh-14rem)]"
          viewer="customer"
          messages={messages}
          emptyText="Ask us anything — delivery, timing, the car. We usually reply within 5 minutes, 7am–11pm."
          onSend={async (body) => {
            try {
              const m = await backend.sendMessage(body, bookingId);
              setMessages((prev) => [...prev.filter((x) => x.id !== m.id), m]);
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'Message not sent', 'error');
              throw e;
            }
          }}
        />
      </Container>
    </>
  );
};
