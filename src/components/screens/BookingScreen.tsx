import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Baby, Check, ChevronRight, Gauge, MapPin, PackageCheck, ShieldCheck, UserPlus } from 'lucide-react';
import type { DriverInfo, ExtraService, RatePackage } from '../../types/car';
import { INITIAL_EXTRA_SERVICES } from '../../data/cars';
import { useAppState } from '../../state/AppState';
import { completedTrips, isFreePerk, loyaltyFor } from '../../lib/loyalty';
import { depositFor } from '../../lib/verification';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { backend } from '../../lib/backend';
import { addDays, addHours, formatDate, TIME_OPTIONS, todayISO } from '../../lib/dates';
import {
  calculateQuote, durationLabel, extraUnitPrice, packageDurationLabel, packagePickupLabel, packageReturn, type DurationUnit
} from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { BookingSteps, CarSummary, Field, PriceSummary } from '../booking/BookingParts';
import { Button, cn } from '../ui/Button';
import { Card, Container, DetailHeader, MobileActionBar, SectionLabel } from '../ui/Layout';

const SERVICE_ICONS: Record<string, React.ElementType> = { ShieldCheck, UserPlus, Baby, Gauge };

type DriverErrors = Partial<Record<keyof DriverInfo, string>>;

/** First date on or after `from` whose weekday the package allows. */
const nextAllowedDate = (pkg: RatePackage, from: string) => {
  if (!pkg.pickupDays.length) return from;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    const [y, m, day] = d.split('-').map(Number);
    if (pkg.pickupDays.includes(new Date(y, m - 1, day).getDay())) return d;
  }
  return from;
};

const validateDriver = (d: DriverInfo): DriverErrors => {
  const e: DriverErrors = {};
  if (d.fullName.trim().length < 2) e.fullName = 'Enter the driver’s full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Enter a valid email address.';
  if (d.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number.';
  if (d.licenseNumber.trim().length < 4) e.licenseNumber = 'Enter the licence number.';
  if (!d.ageConfirmed) e.ageConfirmed = 'Please confirm the driver is 25 or older.';
  return e;
};

export const BookingScreen: React.FC = () => {
  const { carId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    getCar, fleetSource, trip, pickupLocation, returnLocation, openLocationPicker, profile, draft, setDraft, bookings, verification
  } = useAppState();
  const loyalty = loyaltyFor(completedTrips(bookings));
  const car = getCar(carId);

  // Returning from checkout restores what was entered; otherwise start from the search dates.
  const resume = draft && draft.car.id === carId ? draft : null;
  const today = todayISO();
  const [unit, setUnit] = useState<DurationUnit>(resume?.durationUnit ?? 'day');
  const [packageId, setPackageId] = useState<string | null>(resume ? resume.packageId ?? null : params.get('package'));
  const packages = (car?.packages ?? []).filter((p) => p.active);
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const [pickupDate, setPickupDate] = useState(() => {
    const start = resume?.pickupDate ?? (trip.pickupDate < today ? today : trip.pickupDate);
    const initial = car?.packages?.find((p) => p.id === packageId);
    return initial && !resume ? nextAllowedDate(initial, start) : start;
  });
  const [returnDate, setReturnDate] = useState(resume?.returnDate ?? trip.returnDate);
  const [pickupTime, setPickupTime] = useState(resume?.pickupTime ?? '10:00 AM');
  const [returnTime, setReturnTime] = useState(resume?.returnTime ?? '10:00 AM');
  const [sameReturn, setSameReturn] = useState(pickupLocation === returnLocation);
  const [extras, setExtras] = useState<ExtraService[]>(() =>
    INITIAL_EXTRA_SERVICES.map((s) => ({
      ...s,
      selected: resume ? resume.extraServices.some((x) => x.id === s.id) : s.selected
    }))
  );
  const [driver, setDriver] = useState<DriverInfo>(
    resume?.driverInfo ?? {
      fullName: profile?.fullName ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
      licenseNumber: profile?.licenseNumber ?? '',
      ageConfirmed: false
    }
  );
  const [errors, setErrors] = useState<DriverErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [carBusy, setCarBusy] = useState(false);

  // A package fixes the return time; otherwise the customer picks it.
  const ret = pkg ? packageReturn(pkg, pickupDate, pickupTime) : { date: returnDate, time: returnTime };
  const effectiveUnit: DurationUnit = pkg ? pkg.durationUnit : unit;

  // Live availability for the exact window chosen (re-checked when the fleet changes).
  useEffect(() => {
    if (!carId) return;
    let active = true;
    const check = () =>
      backend
        .unavailableCarIds({ pickupDate, pickupTime, returnDate: ret.date, returnTime: ret.time })
        .then((ids) => active && setCarBusy(ids.includes(carId)))
        .catch(() => {});
    const timer = window.setTimeout(check, 250);
    const off = backend.onFleetChange(check);
    return () => {
      active = false;
      window.clearTimeout(timer);
      off();
    };
  }, [carId, pickupDate, pickupTime, ret.date, ret.time]);

  // Loyalty perks: these add-ons are included free for the customer's tier (the server applies the same rule).
  const selectedExtras = extras
    .filter((s) => s.selected)
    .map((s) => (isFreePerk(loyalty.tier, s.id) ? { ...s, pricePerDay: 0 } : s));
  const quote = useMemo(
    () =>
      car
        ? calculateQuote({ car, durationUnit: effectiveUnit, pickupDate, returnDate: ret.date, pickupTime, returnTime: ret.time, extras: selectedExtras, pkg })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [car, effectiveUnit, pickupDate, ret.date, pickupTime, ret.time, extras, pkg]
  );

  if (!car) {
    return fleetSource === 'loading' ? null : <Navigate to="/explore" replace />;
  }
  if (!quote) return null;

  const effectiveReturn = sameReturn ? pickupLocation : returnLocation;

  const choosePackage = (p: RatePackage) => {
    setPackageId(p.id);
    setPickupDate((d) => nextAllowedDate(p, d < today ? today : d));
  };

  const switchUnit = (next: DurationUnit) => {
    setPackageId(null);
    setUnit(next);
    if (next === 'hour' && returnDate !== pickupDate) {
      const end = addHours(pickupDate, pickupTime, 4);
      setReturnDate(end.date);
      setReturnTime(end.time);
    }
    if (next === 'day' && returnDate <= pickupDate) setReturnDate(addDays(pickupDate, 1));
  };

  const changePickupDate = (value: string) => {
    setPickupDate(value);
    if (unit === 'day' && returnDate <= value) setReturnDate(addDays(value, 1));
    if (unit === 'hour' && returnDate < value) setReturnDate(value);
  };

  const updateDriver = <K extends keyof DriverInfo>(key: K, value: DriverInfo[K]) => {
    const next = { ...driver, [key]: value };
    setDriver(next);
    if (submitted) setErrors(validateDriver(next));
  };

  const proceed = () => {
    setSubmitted(true);
    const driverErrors = validateDriver(driver);
    setErrors(driverErrors);
    if (quote.error || carBusy) {
      document.getElementById('when')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (Object.keys(driverErrors).length) {
      document.getElementById('driver')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setDraft({
      car,
      pickupDate,
      returnDate: ret.date,
      pickupTime,
      returnTime: ret.time,
      pickupLocation,
      returnLocation: effectiveReturn,
      durationUnit: effectiveUnit,
      packageId: pkg?.id ?? null,
      packageName: pkg?.name ?? null,
      durationValue: quote.durationValue,
      totalDays: quote.totalDays,
      basePrice: quote.basePrice,
      extraServices: selectedExtras,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      driverInfo: { ...driver, fullName: driver.fullName.trim(), email: driver.email.trim() }
    });
    navigate('/checkout');
  };

  const lines = [
    pkg
      ? { label: `${pkg.name} (${packageDurationLabel(pkg)}, fixed price)`, amount: quote.basePrice }
      : { label: `${formatNaira(quote.unitPrice)} × ${durationLabel(quote.durationValue, unit)}`, amount: quote.basePrice },
    ...(quote.extrasTotal > 0 ? [{ label: 'Add-ons', amount: quote.extrasTotal }] : []),
    { label: 'Taxes & fees (8%)', amount: quote.taxAmount }
  ];

  const timeSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
      {TIME_OPTIONS.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );

  return (
    <>
      <DetailHeader fallback={`/cars/${car.id}`} eyebrow="Book" title={car.name} />

      <Container className="pt-5 lg:pt-8">
        <BookingSteps current={0} />

        {verification && !['pending', 'verified'].includes(verification.status) && (
          <Link
            to={`/verify?next=${encodeURIComponent(`/cars/${car.id}/book`)}`}
            className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:shadow-card"
          >
            <ShieldAlert className="size-5 shrink-0" />
            <span className="flex-1">
              <strong className="block">Verify your identity before paying</strong>
              Licence, government ID, selfie, employment and driving record — about 5 minutes. Your trip details stay saved.
            </span>
            <ChevronRight className="size-5 shrink-0" />
          </Link>
        )}

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          <div className="space-y-8">
            {/* Rental type */}
            <section>
              <SectionLabel>How long?</SectionLabel>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Rental type">
                {(['day', 'hour'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={!pkg && unit === u}
                    onClick={() => switchUnit(u)}
                    className={cn(
                      'min-h-20 rounded-2xl border-2 p-4 text-left transition-colors',
                      !pkg && unit === u ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink-faint'
                    )}
                  >
                    <span className="block font-extrabold">{u === 'day' ? 'By the day' : 'By the hour'}</span>
                    <span className={cn('mt-0.5 block text-sm', !pkg && unit === u ? 'text-white/70' : 'text-ink-soft')}>
                      {formatNaira(u === 'day' ? car.pricePerDay : car.pricePerHour)} / {u}
                    </span>
                  </button>
                ))}
              </div>

              {packages.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-bold text-ink-muted">Or choose a package — one fixed price</p>
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Packages">
                    {packages.map((p) => {
                      const selected = pkg?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => choosePackage(p)}
                          className={cn(
                            'rounded-2xl border-2 p-4 text-left transition-colors',
                            selected ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:border-ink-faint'
                          )}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-extrabold">{p.name}</span>
                            <span className="shrink-0 font-extrabold">{formatNaira(p.price)}</span>
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-muted">
                            {packageDurationLabel(p)} · {packagePickupLabel(p)}
                          </span>
                          {selected && p.includes.length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm">
                              {p.includes.map((i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                                  {i}
                                </li>
                              ))}
                            </ul>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* When */}
            <section id="when" className="scroll-mt-40">
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel className="mb-0">When?</SectionLabel>
                <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand">
                  {durationLabel(quote.durationValue, effectiveUnit)}
                </span>
              </div>
              <Card className="grid grid-cols-2 gap-x-3 gap-y-4 p-4 sm:p-5">
                <Field label="Pick-up date">
                  <input type="date" min={today} value={pickupDate} onChange={(e) => changePickupDate(e.target.value)} className="field" />
                </Field>
                <Field label="Pick-up time">{timeSelect(pickupTime, setPickupTime)}</Field>
                {pkg ? (
                  <div className="col-span-2 flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-sm">
                    <PackageCheck className="size-5 shrink-0 text-brand" />
                    <span>
                      Return <strong>{formatDate(ret.date)}, {ret.time}</strong> — set by the {pkg.name} package
                      {pkg.pickupDays.length > 0 && <span className="block text-ink-soft">{packagePickupLabel(pkg)} only</span>}
                    </span>
                  </div>
                ) : (
                  <>
                    <Field label="Return date">
                      <input
                        type="date"
                        min={unit === 'day' ? addDays(pickupDate, 1) : pickupDate}
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="field"
                      />
                    </Field>
                    <Field label="Return time">{timeSelect(returnTime, setReturnTime)}</Field>
                  </>
                )}
                {(quote.error || carBusy) && (
                  <p role="alert" className="col-span-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
                    {quote.error ?? 'This car is already booked for part of that time. Try different dates or times.'}
                  </p>
                )}
                {!quote.error && !carBusy && (
                  <p className="col-span-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <span className="size-2 rounded-full bg-emerald-500" /> Available for these dates
                  </p>
                )}
                {!pkg && unit === 'hour' && !quote.error && (
                  <p className="col-span-2 text-sm text-ink-soft">Minimum 1 hour. Part hours are rounded up.</p>
                )}
              </Card>
            </section>

            {/* Where */}
            <section>
              <SectionLabel>Where?</SectionLabel>
              <Card className="divide-y divide-line">
                <button
                  type="button"
                  onClick={() => openLocationPicker(sameReturn ? 'both' : 'pickup')}
                  className="flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-surface"
                >
                  <MapPin className="size-5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">Pick-up</span>
                    <span className="block truncate font-bold">{pickupLocation}</span>
                  </span>
                  <ChevronRight className="size-5 text-ink-faint" />
                </button>
                {!sameReturn && (
                  <button
                    type="button"
                    onClick={() => openLocationPicker('return')}
                    className="flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-surface"
                  >
                    <MapPin className="size-5 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">Return</span>
                      <span className="block truncate font-bold">{returnLocation}</span>
                    </span>
                    <ChevronRight className="size-5 text-ink-faint" />
                  </button>
                )}
                <label className="flex min-h-14 items-center gap-3 px-4">
                  <input
                    type="checkbox"
                    checked={sameReturn}
                    onChange={(e) => setSameReturn(e.target.checked)}
                    className="size-5 accent-brand"
                  />
                  <span className="text-sm font-semibold">Return to the same location</span>
                </label>
              </Card>
            </section>

            {/* Extras */}
            <section>
              <SectionLabel>Add-ons</SectionLabel>
              <div className="space-y-2.5">
                {extras.map((s) => {
                  const Icon = SERVICE_ICONS[s.iconName] ?? Gauge;
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white p-4 transition-colors',
                        s.selected ? 'border-ink' : 'border-line hover:border-ink-faint'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={s.selected}
                        onChange={() =>
                          setExtras((prev) => prev.map((x) => (x.id === s.id ? { ...x, selected: !x.selected } : x)))
                        }
                      />
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface text-brand">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{s.name}</span>
                        <span className="block text-sm text-ink-soft">{s.description}</span>
                        <span className="mt-1 block text-sm font-bold sm:hidden">
                          {isFreePerk(loyalty.tier, s.id) ? (
                            <span className="text-emerald-700">Free — {loyalty.tier.name} perk</span>
                          ) : (
                            <>+{formatNaira(extraUnitPrice(s, effectiveUnit))}/{effectiveUnit}</>
                          )}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-sm font-bold sm:block">
                        {isFreePerk(loyalty.tier, s.id) ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Free · {loyalty.tier.name}</span>
                        ) : (
                          <>
                            +{formatNaira(extraUnitPrice(s, effectiveUnit))}
                            <span className="font-medium text-ink-soft">/{effectiveUnit}</span>
                          </>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
                          s.selected ? 'border-ink bg-ink text-white' : 'border-line'
                        )}
                      >
                        {s.selected && <Check className="size-4 stroke-[3]" />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Driver */}
            <section id="driver" className="scroll-mt-40">
              <SectionLabel>Main driver</SectionLabel>
              <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <Field label="Full name" error={errors.fullName} className="sm:col-span-2">
                  <input
                    className="field"
                    autoComplete="name"
                    value={driver.fullName}
                    onChange={(e) => updateDriver('fullName', e.target.value)}
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input
                    className="field"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={driver.email}
                    onChange={(e) => updateDriver('email', e.target.value)}
                  />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <input
                    className="field"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={driver.phone}
                    onChange={(e) => updateDriver('phone', e.target.value)}
                  />
                </Field>
                <Field label="Driving licence number" error={errors.licenseNumber} className="sm:col-span-2">
                  <input
                    className="field uppercase"
                    autoCapitalize="characters"
                    value={driver.licenseNumber}
                    onChange={(e) => updateDriver('licenseNumber', e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={driver.ageConfirmed}
                      onChange={(e) => updateDriver('ageConfirmed', e.target.checked)}
                      aria-invalid={errors.ageConfirmed ? true : undefined}
                      className="mt-0.5 size-5 shrink-0 accent-brand"
                    />
                    <span className="text-sm">The main driver is 25 or older and holds a valid driving licence.</span>
                  </label>
                  {errors.ageConfirmed && <p className="mt-1 text-sm font-semibold text-brand">{errors.ageConfirmed}</p>}
                </div>
              </Card>
            </section>

            {/* Summary (phones/tablets) */}
            <section className="lg:hidden">
              <SectionLabel>Price</SectionLabel>
              <Card className="p-5">
                <PriceSummary lines={lines} total={quote.totalAmount} note={`Plus a refundable security deposit of ${formatNaira(depositFor(car))}, released after return`} />
              </Card>
            </section>
          </div>

          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block">
            <Card className="sticky top-36 space-y-5 p-6">
              <CarSummary car={car} detail={(pkg ? `${pkg.name} · ` : '') + durationLabel(quote.durationValue, effectiveUnit)} />
              <PriceSummary lines={lines} total={quote.totalAmount} note={`Plus a refundable security deposit of ${formatNaira(depositFor(car))}, released after return`} />
              <Button size="lg" block onClick={proceed}>
                Continue to payment
                <ArrowRight className="size-5" />
              </Button>
            </Card>
          </aside>
        </div>
      </Container>

      <MobileActionBar>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Total</p>
          <p className="text-xl font-extrabold leading-tight">{formatNaira(quote.totalAmount)}</p>
        </div>
        <Button size="lg" className="flex-1" onClick={proceed}>
          Continue
          <ArrowRight className="size-5" />
        </Button>
      </MobileActionBar>
    </>
  );
};
