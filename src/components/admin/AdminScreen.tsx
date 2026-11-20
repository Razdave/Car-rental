import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarRange, CarFront, ClipboardList, HeartHandshake, Inbox, LayoutDashboard, Loader2, Send, ShieldAlert, ShieldCheck, Star, Users
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { backend, managementStatusOf } from '../../lib/backend';
import { Logo } from '../layout/AppShell';
import { cn, LinkButton } from '../ui/Button';
import { Container, EmptyState } from '../ui/Layout';
import { Toaster } from '../ui/Toaster';
import { BookingsPanel } from './BookingsPanel';
import { CustomersPanel } from './CustomersPanel';
import { ExperiencePanel } from './ExperiencePanel';
import { VerificationPanel } from './VerificationPanel';
import { FleetPanel } from './FleetPanel';
import { InboxPanel } from './InboxPanel';
import { OutboxPanel } from './OutboxPanel';
import { OverviewPanel } from './OverviewPanel';
import { ReviewsPanel } from './ReviewsPanel';
import { useAdminData } from './useAdminData';
import { VehiclesPanel } from './VehiclesPanel';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'calendar', label: 'Availability', icon: CalendarRange },
  { id: 'vehicles', label: 'Vehicles', icon: CarFront },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'experience', label: 'Experience', icon: HeartHandshake },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'notifications', label: 'Notifications', icon: Send }
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Rental management dashboard for staff, managers and admins. */
export const AdminScreen: React.FC = () => {
  const { profile, authReady, isStaff } = useAppState();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
  const allowed = authReady && isStaff;
  const { data, loading, run } = useAdminData(allowed);
  const [thread, setThread] = useState<{ customerId: string; bookingId: string | null } | null>(null);

  if (!authReady) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="size-8 animate-spin text-ink-soft" /></div>;
  if (!profile) return <Navigate to="/signin?next=/admin" replace />;
  if (!isStaff) {
    return (
      <Container className="max-w-md py-16">
        <EmptyState icon={<ShieldAlert className="size-7" />} title="Staff only" description="Your account doesn’t have access to the management dashboard." action={<LinkButton to="/" variant="dark">Back to the site</LinkButton>} />
      </Container>
    );
  }

  const go = (id: TabId) => setParams({ tab: id }, { replace: false });
  const openThread = (customerId: string, bookingId: string | null = null) => {
    setThread({ customerId, bookingId });
    go('inbox');
  };

  const badges: Partial<Record<TabId, number>> = {
    bookings: data.bookings.filter((b) => managementStatusOf(b) === 'pending').length,
    experience: data.reviews.filter((r) => r.followUp === 'open').length,
    inbox: (() => {
      const last = new Map<string, string>();
      [...data.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((m) => last.set(m.customerId, m.sender));
      return [...last.values()].filter((s) => s === 'customer').length;
    })()
  };

  return (
    <div className="min-h-dvh bg-surface">
      <header className="pt-safe sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <Container className="flex h-16 items-center gap-3">
          <Logo />
          <span className="rounded-lg bg-ink px-2 py-1 text-xs font-extrabold uppercase tracking-wider text-white">Staff</span>
          {backend.isDemo && <span className="hidden rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 sm:inline">Demo data</span>}
          <Link to="/" className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-ink-muted hover:bg-surface-2 hover:text-ink">
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Customer site</span>
          </Link>
        </Container>
        <Container>
          <nav aria-label="Dashboard" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => go(t.id)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors',
                  tab === t.id ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                )}
              >
                <t.icon className="size-4" />
                {t.label}
                {Boolean(badges[t.id]) && (
                  <span className="rounded-full bg-brand px-1.5 text-[11px] font-extrabold leading-5 text-white">{badges[t.id]}</span>
                )}
              </button>
            ))}
          </nav>
        </Container>
      </header>

      <Container className="py-6 pb-16">
        <h1 className="mb-5 text-2xl font-extrabold tracking-tight">{TABS.find((t) => t.id === tab)!.label}</h1>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-ink-soft" /></div>
        ) : (
          <>
            {tab === 'overview' && <OverviewPanel data={data} run={run} onMessage={openThread} />}
            {tab === 'bookings' && <BookingsPanel bookings={data.bookings} run={run} onMessage={openThread} />}
            {tab === 'calendar' && <FleetPanel cars={data.cars} bookings={data.bookings} blocks={data.blocks} run={run} />}
            {tab === 'vehicles' && <VehiclesPanel cars={data.cars} run={run} />}
            {tab === 'verification' && <VerificationPanel run={run} />}
            {tab === 'experience' && <ExperiencePanel data={data} run={run} onMessage={openThread} />}
            {tab === 'customers' && <CustomersPanel customers={data.customers} bookings={data.bookings} run={run} onMessage={(id) => openThread(id)} />}
            {tab === 'inbox' && <InboxPanel messages={data.messages} customers={data.customers} selected={thread} onSelect={setThread} run={run} />}
            {tab === 'reviews' && <ReviewsPanel reviews={data.reviews} cars={data.cars} run={run} />}
            {tab === 'notifications' && <OutboxPanel outbox={data.outbox} />}
          </>
        )}
      </Container>
      <Toaster />
    </div>
  );
};

export default AdminScreen;
