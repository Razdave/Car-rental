import React, { useState } from 'react';
import { Award, Bell, BellRing, ChevronRight, CreditCard, Globe, LayoutDashboard, LogOut, MessageSquare, PhoneCall, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../../lib/backend';
import { disablePush, enablePush, pushEnabled, pushPermission } from '../../lib/push';
import { useAppState } from '../../state/AppState';
import { Field } from '../booking/BookingParts';
import { LoyaltyCard } from '../cx/LoyaltyCard';
import { STATUS_COPY } from '../../lib/verification';
import { completedTrips, loyaltyFor } from '../../lib/loyalty';
import { Button, cn, LinkButton } from '../ui/Button';
import { Card, Container, PageTitle, SectionLabel } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';

const Row: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}> = ({ icon: Icon, title, subtitle, onClick, trailing, danger }) => {
  const content = (
    <>
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', danger ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink')}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-bold', danger && 'text-brand')}>{title}</span>
        <span className="block truncate text-sm text-ink-soft">{subtitle}</span>
      </span>
      {trailing ?? (onClick && <ChevronRight className="size-5 shrink-0 text-ink-faint" />)}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface">
      {content}
    </button>
  ) : (
    <div className="flex min-h-16 items-center gap-3 p-4">{content}</div>
  );
};

export const ProfileScreen: React.FC = () => {
  const { profile, updateProfile, bookings, favorites, showToast, isStaff, signOut, verification } = useAppState();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<null | 'edit' | 'license' | 'payment' | 'support'>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', licenseNumber: '', licenseExpiry: '' });
  const close = () => setSheet(null);
  const [push, setPush] = useState(pushEnabled());

  if (!profile) {
    return (
      <Container className="max-w-md py-12">
        <Card className="p-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
            <UserRound className="size-7" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold">Sign in to Aurevon</h1>
          <p className="mt-1 text-sm text-ink-soft">See your trips, sign rental agreements and message the team.</p>
          <LinkButton to="/signin?next=/profile" block size="lg" className="mt-5">
            Sign in or create account
          </LinkButton>
        </Card>
      </Container>
    );
  }
  const notifications = profile.smsOptIn;
  const togglePush = async () => {
    if (push) {
      disablePush();
      setPush(false);
      return;
    }
    const ok = await enablePush();
    setPush(ok);
    showToast(ok ? 'Push notifications on for this device' : pushPermission() === 'denied' ? 'Notifications are blocked — allow them in your browser settings' : 'Push notifications aren’t supported on this browser', ok ? 'success' : 'error');
  };

  const trips = bookings.filter((b) => b.status !== 'cancelled').length;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        licenseNumber: form.licenseNumber.trim().toUpperCase(),
        licenseExpiry: form.licenseExpiry.trim()
      });
      showToast('Profile updated', 'success');
      close();
    } catch {
      /* toast shown by updateProfile */
    }
  };

  return (
    <Container className="max-w-5xl">
      <PageTitle title="Profile" subtitle={profile.joinedDate} />

      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8">
        <div className="space-y-4">
          <Card className="p-5 text-center">
            <img src={profile.avatarUrl} alt="" className="mx-auto size-20 rounded-full object-cover ring-4 ring-surface-2" />
            <p className="mt-3 flex items-center justify-center gap-1.5 text-lg font-extrabold">
              {profile.fullName}
              <ShieldCheck className="size-5 text-brand" aria-label="Verified" />
            </p>
            <p className="truncate text-sm text-ink-soft">{profile.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs font-bold">
              <Award className="size-3.5 text-brand" /> {loyaltyFor(completedTrips(bookings)).tier.id === 'member' ? 'Member' : `${loyaltyFor(completedTrips(bookings)).tier.name} member`}
            </span>
            <Button
              variant="secondary"
              size="sm"
              block
              className="mt-4"
              onClick={() => {
                setForm({ fullName: profile.fullName, phone: profile.phone, licenseNumber: profile.licenseNumber, licenseExpiry: profile.licenseExpiry });
                setSheet('edit');
              }}
            >
              Edit profile
            </Button>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Trips', value: trips },
              { label: 'Saved', value: favorites.length },
              { label: 'Rating', value: `★ ${profile.driverRating}` }
            ].map((s) => (
              <Card key={s.label} className="p-3 text-center">
                <p className="text-lg font-extrabold">{s.value}</p>
                <p className="text-xs text-ink-soft">{s.label}</p>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-6 lg:mt-0">
          <section id="loyalty" className="scroll-mt-24">
            <SectionLabel>Loyalty</SectionLabel>
            <LoyaltyCard />
          </section>

          {isStaff && (
            <section>
              <SectionLabel>Staff</SectionLabel>
              <Card className="overflow-hidden">
                <Row
                  icon={LayoutDashboard}
                  title="Rental management dashboard"
                  subtitle={backend.isDemo ? 'Demo mode — manage bookings, fleet and customers' : 'Bookings, fleet, customers and messages'}
                  onClick={() => navigate('/admin')}
                />
              </Card>
            </section>
          )}

          <section>
            <SectionLabel>Driving & payment</SectionLabel>
            <Card className="divide-y divide-line overflow-hidden">
              <Row
                icon={ShieldCheck}
                title="Identity verification"
                subtitle={verification ? STATUS_COPY[verification.status].title : 'Loading…'}
                onClick={() => navigate('/verify')}
                trailing={
                  verification && (
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', verification.status === 'verified' ? 'bg-emerald-50 text-emerald-700' : verification.status === 'pending' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800')}>
                      {verification.status === 'verified' ? 'Verified' : verification.status === 'pending' ? 'In review' : 'Action needed'}
                    </span>
                  )
                }
              />
              <Row
                icon={ShieldCheck}
                title="Driving licence"
                subtitle={`${profile.licenseNumber} · expires ${profile.licenseExpiry}`}
                onClick={() => setSheet('license')}
                trailing={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Verified</span>}
              />
              <Row icon={CreditCard} title="Payment methods" subtitle="Visa •••• 8821, Apple Pay" onClick={() => setSheet('payment')} />
            </Card>
          </section>

          <section>
            <SectionLabel>Preferences</SectionLabel>
            <Card className="divide-y divide-line overflow-hidden">
              <Row
                icon={Bell}
                title="Text message reminders"
                subtitle="Pick-up and return reminders by SMS. Booking emails are always sent."
                trailing={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications}
                    aria-label="Text message reminders"
                    onClick={() => void updateProfile({ smsOptIn: !notifications, notificationsEnabled: !notifications })}
                    className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', notifications ? 'bg-brand' : 'bg-line')}
                  >
                    <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-[left]', notifications ? 'left-6' : 'left-1')} />
                  </button>
                }
              />
              <Row
                icon={BellRing}
                title="Push notifications"
                subtitle="Booking updates and replies on this device"
                trailing={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={push}
                    aria-label="Push notifications"
                    onClick={() => void togglePush()}
                    className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', push ? 'bg-brand' : 'bg-line')}
                  >
                    <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-[left]', push ? 'left-6' : 'left-1')} />
                  </button>
                }
              />
              <Row icon={Globe} title="Currency" subtitle="Prices are shown in Nigerian naira" trailing={<span className="text-sm font-bold">NGN ₦</span>} />
            </Card>
          </section>

          <section>
            <SectionLabel>Help</SectionLabel>
            <Card className="divide-y divide-line overflow-hidden">
              <Row icon={MessageSquare} title="Messages" subtitle="Chat with the rental team" onClick={() => navigate('/messages')} />
              <Row icon={PhoneCall} title="24/7 roadside assistance" subtitle="Call our concierge any time" onClick={() => setSheet('support')} />
              {backend.kind === 'supabase' && (
                <Row icon={LogOut} title="Sign out" subtitle={profile.email} danger onClick={() => void signOut()} />
              )}
            </Card>
          </section>
        </div>
      </div>

      <Sheet open={sheet === 'edit'} onClose={close} size="sm" title="Edit profile">
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name">
            <input className="field" required autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>

          <Field label="Phone">
            <input className="field" type="tel" required autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Driving licence number">
            <input className="field uppercase" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
          </Field>
          <Field label="Licence expiry" hint="As printed on your licence, e.g. 11/2029">
            <input className="field" value={form.licenseExpiry} onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })} />
          </Field>
          <Button type="submit" block size="lg">
            Save changes
          </Button>
        </form>
      </Sheet>

      <Sheet open={sheet === 'license'} onClose={close} size="sm" title="Driving licence" description="Verified credential">
        <div className="space-y-3 rounded-2xl bg-ink p-5 text-white">
          <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
            <span className="text-amber-400">Driving licence</span>
            <span className="text-emerald-400">Active</span>
          </div>
          <p className="font-mono text-lg font-bold tracking-wider">{profile.licenseNumber}</p>
          <div className="flex justify-between text-sm text-white/70">
            <span>{profile.fullName}</span>
            <span>Exp {profile.licenseExpiry}</span>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'payment'} onClose={close} size="sm" title="Payment methods">
        <ul className="space-y-2">
          <li className="flex min-h-14 items-center justify-between rounded-2xl border border-line px-4">
            <span className="flex items-center gap-2 text-sm font-bold">
              <CreditCard className="size-4 text-brand" /> Visa •••• 8821
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Default</span>
          </li>
          <li className="flex min-h-14 items-center justify-between rounded-2xl border border-line px-4">
            <span className="text-sm font-bold">Apple Pay</span>
            <span className="text-sm text-ink-soft">Connected</span>
          </li>
        </ul>
      </Sheet>

      <Sheet open={sheet === 'support'} onClose={close} size="sm" title="Roadside assistance" description="We’re here 24 hours a day, 7 days a week.">
        <a
          href="tel:+18002739227"
          className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-brand text-lg font-extrabold text-white hover:bg-brand-dark"
        >
          <PhoneCall className="size-5" /> 1-800-273-9227
        </a>
        <p className="mt-3 text-center text-sm text-ink-soft">Tap to call from your phone.</p>
      </Sheet>
    </Container>
  );
};
