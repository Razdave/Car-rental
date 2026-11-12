import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CreditCard, Loader2, Lock, Tag, X } from 'lucide-react';
import type { Booking } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { createBooking } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { durationLabel, PROMO_CODES } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { BookingSteps, CarSummary, Field, PriceSummary } from '../booking/BookingParts';
import { Button, cn } from '../ui/Button';
import { Card, Container, DetailHeader, MobileActionBar, SectionLabel } from '../ui/Layout';

type Method = 'card' | 'applepay' | 'googlepay' | 'paypal';

const METHODS: { id: Method; label: string; sub: string }[] = [
  { id: 'card', label: 'Card', sub: 'Visa, Mastercard, Verve' },
  { id: 'applepay', label: 'Apple Pay', sub: 'Fast checkout' },
  { id: 'googlepay', label: 'Google Pay', sub: 'Fast checkout' },
  { id: 'paypal', label: 'PayPal', sub: 'Pay with your account' }
];

const digits = (v: string) => v.replace(/\D/g, '');
const formatCardNumber = (v: string) => digits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (v: string) => {
  const d = digits(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
const cardBrand = (num: string) => {
  const d = digits(num);
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^(506|507|650)/.test(d)) return 'Verve';
  if (/^3[47]/.test(d)) return 'Amex';
  return 'Card';
};

type CardErrors = Partial<Record<'holder' | 'number' | 'expiry' | 'cvc', string>>;

const validateCard = (holder: string, number: string, expiry: string, cvc: string): CardErrors => {
  const e: CardErrors = {};
  if (holder.trim().length < 2) e.holder = 'Enter the name on the card.';
  const n = digits(number);
  if (n.length < 13 || n.length > 19) e.number = 'Enter a valid card number.';
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiry = 'Use MM/YY.';
  else {
    const now = new Date();
    const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1);
    if (exp <= new Date(now.getFullYear(), now.getMonth(), 1)) e.expiry = 'This card has expired.';
  }
  if (!/^\d{3,4}$/.test(cvc)) e.cvc = '3 or 4 digits.';
  return e;
};

export const PaymentScreen: React.FC = () => {
  const { draft, setDraft, addBooking, fleetSource } = useAppState();
  const navigate = useNavigate();

  const [method, setMethod] = useState<Method>('card');
  const [holder, setHolder] = useState(draft?.driverInfo.fullName ?? '');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardErrors, setCardErrors] = useState<CardErrors>({});

  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) return <Navigate to="/explore" replace />;

  const discount = promo ? PROMO_CODES[promo].discount(draft.totalAmount) : 0;
  const total = Math.max(0, draft.totalAmount - discount);
  const extrasTotal = draft.totalAmount - draft.basePrice - draft.taxAmount;

  const applyPromo = (event: React.FormEvent) => {
    event.preventDefault();
    const code = promoInput.trim().toUpperCase();
    if (PROMO_CODES[code]) {
      setPromo(code);
      setPromoError(null);
    } else {
      setPromoError('That code isn’t valid. Try DRIVE20.');
    }
  };

  const pay = async () => {
    if (method === 'card') {
      const errs = validateCard(holder, number, expiry, cvc);
      setCardErrors(errs);
      if (Object.keys(errs).length) {
        document.getElementById('card-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setProcessing(true);
    setError(null);
    const paymentMethod =
      method === 'card'
        ? `${cardBrand(number)} •••• ${digits(number).slice(-4)}`
        : METHODS.find((m) => m.id === method)!.label;

    try {
      let booking: Booking;
      if (fleetSource === 'demo') {
        // The API is unreachable: keep the flow usable for demos with a device-only booking.
        await new Promise((r) => setTimeout(r, 900));
        booking = {
          ...draft,
          id: `DEMO-${Math.floor(10000 + Math.random() * 90000)}`,
          carId: draft.car.id,
          discount,
          totalAmount: total,
          status: 'upcoming',
          managementStatus: 'pending',
          paymentMethod,
          createdAt: new Date().toISOString(),
          digitalPassCode: `PASS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        };
      } else {
        booking = await createBooking({
          carId: draft.car.id,
          pickupDate: draft.pickupDate,
          returnDate: draft.returnDate,
          pickupTime: draft.pickupTime,
          returnTime: draft.returnTime,
          pickupLocation: draft.pickupLocation,
          returnLocation: draft.returnLocation,
          durationUnit: draft.durationUnit,
          extraServices: draft.extraServices.map((s) => ({ id: s.id })),
          driverInfo: draft.driverInfo,
          paymentMethod,
          promoCode: promo ?? undefined
        });
      }
      addBooking(booking);
      setDraft(null);
      navigate(`/bookings/${booking.id}?new=1`, { replace: true });
    } catch (err) {
      console.error('Unable to save the booking.', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete your booking. Please try again.');
      setProcessing(false);
    }
  };

  const lines = [
    { label: `Rental (${durationLabel(draft.durationValue, draft.durationUnit)})`, amount: draft.basePrice },
    ...(extrasTotal > 0 ? [{ label: 'Add-ons', amount: extrasTotal }] : []),
    { label: 'Taxes & fees', amount: draft.taxAmount },
    ...(discount > 0 ? [{ label: `Promo ${promo}`, amount: discount, negative: true }] : [])
  ];

  const payLabel = processing ? 'Processing…' : `Pay ${formatNaira(total)}`;
  const tripDetail = `${formatDate(draft.pickupDate)} → ${formatDate(draft.returnDate)}`;

  return (
    <>
      <DetailHeader fallback={`/cars/${draft.car.id}/book`} eyebrow="Checkout" title="Payment" />

      <Container className="pt-5 lg:pt-8">
        <BookingSteps current={1} />

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          <div className="space-y-8">
            {/* Trip recap */}
            <Card className="flex items-center justify-between gap-3 p-4">
              <CarSummary car={draft.car} detail={tripDetail} />
              <Link
                to={`/cars/${draft.car.id}/book`}
                className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-bold text-brand hover:underline"
              >
                Edit
              </Link>
            </Card>

            {/* Method */}
            <section>
              <SectionLabel>Payment method</SectionLabel>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Payment method">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      'min-h-20 rounded-2xl border-2 p-4 text-left transition-colors',
                      method === m.id ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink-faint'
                    )}
                  >
                    <span className="block font-extrabold">{m.label}</span>
                    <span className={cn('block text-sm', method === m.id ? 'text-white/70' : 'text-ink-soft')}>{m.sub}</span>
                  </button>
                ))}
              </div>
            </section>

            {method === 'card' && (
              <section id="card-form" className="scroll-mt-40">
                <SectionLabel>Card details</SectionLabel>
                <Card className="grid grid-cols-2 gap-4 p-4 sm:p-5">
                  <Field label="Name on card" error={cardErrors.holder} className="col-span-2">
                    <input className="field" autoComplete="cc-name" value={holder} onChange={(e) => setHolder(e.target.value)} />
                  </Field>
                  <Field label="Card number" error={cardErrors.number} className="col-span-2">
                    <div className="relative">
                      <input
                        className="field pr-24 font-mono tracking-wider"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="1234 5678 9012 3456"
                        value={number}
                        onChange={(e) => setNumber(formatCardNumber(e.target.value))}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-sm font-bold text-ink-soft">
                        <CreditCard className="size-4" />
                        {digits(number).length > 0 && cardBrand(number)}
                      </span>
                    </div>
                  </Field>
                  <Field label="Expiry" error={cardErrors.expiry}>
                    <input
                      className="field font-mono"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    />
                  </Field>
                  <Field label="CVC" error={cardErrors.cvc}>
                    <input
                      className="field font-mono"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      type="password"
                      placeholder="•••"
                      maxLength={4}
                      value={cvc}
                      onChange={(e) => setCvc(digits(e.target.value))}
                    />
                  </Field>
                </Card>
              </section>
            )}

            {/* Promo */}
            <section>
              <SectionLabel>Promo code</SectionLabel>
              {promo ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <span className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <Tag className="size-4" />
                    {promo} · {PROMO_CODES[promo].label} (−{formatNaira(discount)})
                  </span>
                  <button
                    type="button"
                    onClick={() => setPromo(null)}
                    aria-label="Remove promo code"
                    className="flex size-11 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-100"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={applyPromo} className="flex gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Promo code</span>
                    <input
                      className="field uppercase"
                      placeholder="Enter code"
                      autoCapitalize="characters"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoError(null);
                      }}
                      aria-invalid={promoError ? true : undefined}
                    />
                  </label>
                  <Button type="submit" variant="dark" disabled={!promoInput.trim()}>
                    Apply
                  </Button>
                </form>
              )}
              {promoError && <p className="mt-2 text-sm font-semibold text-brand">{promoError}</p>}
            </section>

            {/* Summary (phones/tablets) */}
            <section className="lg:hidden">
              <SectionLabel>Price</SectionLabel>
              <Card className="p-5">
                <PriceSummary lines={lines} total={total} />
              </Card>
            </section>

            {error && (
              <p role="alert" className="rounded-2xl bg-brand-soft p-4 text-sm font-semibold text-brand">
                {error}
              </p>
            )}

            <p className="flex items-center justify-center gap-2 text-sm text-ink-soft">
              <Lock className="size-4 text-emerald-700" />
              Demo checkout — no payment is taken.
            </p>
          </div>

          <aside className="hidden lg:block">
            <Card className="sticky top-36 space-y-5 p-6">
              <CarSummary car={draft.car} detail={tripDetail} />
              <PriceSummary lines={lines} total={total} />
              <Button size="lg" block onClick={pay} disabled={processing}>
                {processing ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
                {payLabel}
              </Button>
            </Card>
          </aside>
        </div>
      </Container>

      <MobileActionBar>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Total</p>
          <p className="text-xl font-extrabold leading-tight">{formatNaira(total)}</p>
        </div>
        <Button size="lg" className="flex-1" onClick={pay} disabled={processing}>
          {processing ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
          {processing ? 'Processing…' : 'Pay now'}
        </Button>
      </MobileActionBar>
    </>
  );
};
