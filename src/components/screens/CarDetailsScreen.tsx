import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { backend } from '../../lib/backend';
import { motion } from 'motion/react';
import {
  Award, CarFront, Check, Fuel, Gauge, Heart, MessageSquare, Share2, ShieldCheck, Star, Timer, Users
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { addDays, formatDateRange } from '../../lib/dates';
import { AvailabilityCalendar } from '../cars/AvailabilityCalendar';
import { depositFor } from '../../lib/verification';
import { PackagesSection } from '../cars/PackagesSection';
import { PHOTO_CREDITS } from '../../data/photoCredits';
import { ReviewsSection } from '../cars/ReviewsSection';
import { formatNaira } from '../../utils/currency';
import { Button, cn, IconButton, LinkButton } from '../ui/Button';
import { Card, Container, DetailHeader, EmptyState, MobileActionBar, SectionLabel } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';

export const CarDetailsScreen: React.FC = () => {
  const { carId } = useParams();
  const { getCar, fleetSource, favorites, toggleFavorite, showToast, trip, setTrip, profile, unavailableIds } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const car = getCar(carId);
  const [imageIndex, setImageIndex] = useState(0);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState('');

  if (!car) {
    return (
      <>
        <DetailHeader fallback="/explore" title="Vehicle" />
        <Container className="py-10">
          {fleetSource === 'loading' ? (
            <div className="h-72 animate-pulse rounded-[28px] bg-surface-2" aria-label="Loading vehicle" />
          ) : (
            <EmptyState
              icon={<CarFront className="size-7" />}
              title="This car isn't available"
              description="It may have been removed from the fleet or is temporarily unavailable."
              action={<LinkButton to="/explore" variant="dark">Browse the fleet</LinkButton>}
            />
          )}
        </Container>
      </>
    );
  }

  const images = car.galleryImages?.length ? car.galleryImages : [car.imageUrl];
  const saved = favorites.includes(car.id);
  const bookPath = `/cars/${car.id}/book`;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${car.name} · Aurevon`, text: `Rent the ${car.name} on Aurevon`, url });
      } catch {
        /* user dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', 'success');
    } catch {
      showToast('Could not copy the link', 'error');
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    if (!profile) {
      navigate(`/signin?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    try {
      await backend.sendMessage(`About the ${car.name}: ${message.trim()}`);
      setMessageOpen(false);
      setMessage('');
      showToast('Message sent — we usually reply within 5 minutes', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Message not sent', 'error');
    }
  };
  const bookedForTrip = unavailableIds.includes(car.id);

  const specs = [
    { icon: Gauge, label: 'Power', value: `${car.powerHp} hp` },
    { icon: Timer, label: '0–100 km/h', value: `${car.acceleration0to100}s` },
    { icon: Users, label: 'Seats', value: `${car.seats} seats` },
    { icon: Fuel, label: car.transmission, value: car.fuelType }
  ];

  return (
    <>
      <DetailHeader
        fallback="/explore"
        eyebrow={car.brand}
        title={car.name}
        actions={
          <>
            <IconButton label="Share" onClick={share}>
              <Share2 className="size-[18px]" />
            </IconButton>
            <IconButton label={saved ? 'Remove from saved' : 'Save'} onClick={() => toggleFavorite(car.id)} aria-pressed={saved}>
              <Heart className={cn('size-[18px]', saved && 'fill-brand text-brand')} />
            </IconButton>
          </>
        }
      />

      <Container className="pt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:pt-8">
        <div>
          {/* Gallery */}
          <div className="overflow-hidden rounded-[28px] bg-white shadow-card">
            <motion.img
              key={imageIndex}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              src={images[imageIndex]}
              alt={car.name}
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
          {PHOTO_CREDITS[images[imageIndex]] && (
            <p className="mt-1.5 text-right text-xs text-ink-soft">
              Photo:{' '}
              <a href={PHOTO_CREDITS[images[imageIndex]].source} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                {PHOTO_CREDITS[images[imageIndex]].author}
              </a>
              , {PHOTO_CREDITS[images[imageIndex]].license} via Wikimedia Commons (illustrative)
            </p>
          )}
          {images.length > 1 && (
            <div className="mt-3 flex gap-2" role="group" aria-label="Photos">
              {images.map((img, i) => (
                <button
                  key={img + i}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-pressed={imageIndex === i}
                  className={cn(
                    'h-14 w-20 overflow-hidden rounded-xl border-2 transition sm:h-16 sm:w-24',
                    imageIndex === i ? 'border-brand' : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                >
                  <img src={img} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand">
                {car.category} · {car.year}
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{car.name}</h1>
              <p className="mt-1 text-sm text-ink-soft">{car.location}</p>
            </div>
            {car.reviewCount > 0 ? (
              <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                {car.rating.toFixed(2)}
                <span className="font-medium text-amber-700/80">({car.reviewCount} {car.reviewCount === 1 ? 'review' : 'reviews'})</span>
              </div>
            ) : (
              <span className="rounded-xl bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand">New to the fleet</span>
            )}
          </div>

          {/* Specs */}
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {specs.map((s) => (
              <li key={s.label} className="rounded-2xl border border-line bg-white p-4">
                <s.icon className="size-5 text-brand" />
                <p className="mt-2 text-base font-extrabold">{s.value}</p>
                <p className="text-xs text-ink-soft">{s.label}</p>
              </li>
            ))}
          </ul>

          <Card className="mt-6 p-5 sm:p-6">
            <SectionLabel>About this car</SectionLabel>
            <p className="text-[15px] leading-relaxed text-ink-muted">{car.description}</p>
            <p className="mt-3 text-sm text-ink-soft">
              {car.color} · Top speed {car.topSpeedKmH} km/h · {car.mileageLimit}
            </p>
          </Card>

          <Card className="mt-4 p-5 sm:p-6">
            <SectionLabel>Features</SectionLabel>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {car.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Check className="size-3.5 stroke-[3]" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </Card>

          {Boolean(car.packages?.some((p) => p.active)) && (
            <Card className="mt-4 p-5 sm:p-6">
              <SectionLabel>Packages — one fixed price</SectionLabel>
              <PackagesSection car={car} />
            </Card>
          )}

          {Boolean(car.rules?.length) && (
            <Card className="mt-4 p-5 sm:p-6">
              <SectionLabel>Rental rules</SectionLabel>
              <ul className="space-y-2">
                {car.rules!.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="mt-4 p-5 sm:p-6">
            <SectionLabel>Availability</SectionLabel>
            <AvailabilityCalendar
              carId={car.id}
              selection={{ from: trip.pickupDate, to: trip.returnDate }}
              onPick={(d) => {
                const nights = Math.max(1, Math.round((Date.parse(trip.returnDate) - Date.parse(trip.pickupDate)) / 86400000));
                setTrip({ pickupDate: d, returnDate: addDays(d, nights) });
                showToast(`Pick-up set to ${d}`, 'success');
              }}
            />
            <p className="mt-2 text-sm text-ink-soft">Tap a free day to start your trip then. Updates live as cars are booked.</p>
          </Card>

          <Card className="mt-4 p-5 sm:p-6">
            <SectionLabel>Reviews</SectionLabel>
            <ReviewsSection car={car} />
          </Card>

          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink font-bold text-white">
                {car.hostName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{car.hostName}</span>
                  <ShieldCheck className="size-4 shrink-0 text-brand" />
                </p>
                <p className="text-sm text-ink-soft">★ {car.hostRating} host rating · Replies in ~5 min</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setMessageOpen(true)}>
              <MessageSquare className="size-4 text-brand" />
              Message host
            </Button>
          </Card>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <Award className="mt-0.5 size-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Free cancellation · Refundable deposit {formatNaira(depositFor(car))}</p>
              <p className="text-sm text-emerald-800">Cancel up to 24 hours before pick-up for a full refund. 24/7 roadside assistance included.</p>
            </div>
          </div>
        </div>

        {/* Desktop booking card */}
        <aside className="hidden lg:block">
          <Card className="sticky top-36 p-6">
            <p className="text-3xl font-extrabold">
              {formatNaira(car.pricePerDay)}
              <span className="text-base font-medium text-ink-soft"> /day</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">or {formatNaira(car.pricePerHour)} per hour</p>
            <div className="my-5 rounded-2xl bg-surface p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Your dates</p>
              <p className="mt-1 font-bold">{formatDateRange(trip.pickupDate, trip.returnDate)}</p>
              <p className={bookedForTrip ? 'font-semibold text-brand' : 'text-emerald-700'}>
                {bookedForTrip ? 'Booked for these dates — pick other dates on the next step.' : 'Available for these dates'}
              </p>
            </div>
            <LinkButton to={bookPath} size="lg" block>
              Book this car
            </LinkButton>
            <p className="mt-3 text-center text-xs text-ink-soft">
              You won't be charged yet · Refundable deposit {formatNaira(depositFor(car))} · Verified drivers 25+ only
            </p>
          </Card>
        </aside>
      </Container>

      <MobileActionBar>
        <div className="min-w-0">
          <p className="text-xl font-extrabold leading-tight">{formatNaira(car.pricePerDay)}</p>
          <p className="text-xs text-ink-soft">per day · {formatNaira(car.pricePerHour)}/hr</p>
        </div>
        <LinkButton to={bookPath} size="lg" className="flex-1">
          Book now
        </LinkButton>
      </MobileActionBar>

      <Sheet
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={`Message ${car.hostName}`}
        description="Ask about delivery, special requests or availability"
        size="sm"
      >
        <form onSubmit={sendMessage} className="space-y-3">
          <label className="block">
            <span className="sr-only">Message</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Can you deliver the ${car.name} to my hotel?`}
              className="field min-h-28 resize-none"
              autoFocus
            />
          </label>
          <Button type="submit" block disabled={!message.trim()}>
            Send message
          </Button>
        </form>
      </Sheet>
    </>
  );
};
