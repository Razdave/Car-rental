import React, { useState } from 'react';
import { Award, Bell, ChevronRight, CreditCard, Globe, LogOut, PhoneCall, ShieldCheck } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { Field } from '../booking/BookingParts';
import { Button, cn } from '../ui/Button';
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
  const { profile, updateProfile, bookings, favorites, showToast } = useAppState();
  const [sheet, setSheet] = useState<null | 'edit' | 'license' | 'payment' | 'support'>(null);
  const [form, setForm] = useState({ fullName: profile.fullName, email: profile.email, phone: profile.phone });
  const [notifications, setNotifications] = useState(profile.notificationsEnabled);
  const close = () => setSheet(null);

  const trips = bookings.filter((b) => b.status !== 'cancelled').length;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    updateProfile({ fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim() });
    showToast('Profile updated', 'success');
    close();
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
              <Award className="size-3.5 text-brand" /> {profile.memberTier}
            </span>
            <Button
              variant="secondary"
              size="sm"
              block
              className="mt-4"
              onClick={() => {
                setForm({ fullName: profile.fullName, email: profile.email, phone: profile.phone });
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
          <section>
            <SectionLabel>Driving & payment</SectionLabel>
            <Card className="divide-y divide-line overflow-hidden">
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
                title="Trip notifications"
                subtitle="Pick-up reminders and booking updates"
                trailing={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifications}
                    aria-label="Trip notifications"
                    onClick={() => {
                      setNotifications((v) => !v);
                      updateProfile({ notificationsEnabled: !notifications });
                    }}
                    className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', notifications ? 'bg-brand' : 'bg-line')}
                  >
                    <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-[left]', notifications ? 'left-6' : 'left-1')} />
                  </button>
                }
              />
              <Row icon={Globe} title="Currency" subtitle="Prices are shown in Nigerian naira" trailing={<span className="text-sm font-bold">NGN ₦</span>} />
            </Card>
          </section>

          <section>
            <SectionLabel>Help</SectionLabel>
            <Card className="divide-y divide-line overflow-hidden">
              <Row icon={PhoneCall} title="24/7 roadside assistance" subtitle="Call our concierge any time" onClick={() => setSheet('support')} />
              <Row icon={LogOut} title="Sign out" subtitle="Account sign-in is coming soon" danger onClick={() => showToast('Account sign-in is coming soon')} />
            </Card>
          </section>
        </div>
      </div>

      <Sheet open={sheet === 'edit'} onClose={close} size="sm" title="Edit profile">
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name">
            <input className="field" required autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="field" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="field" type="tel" required autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
