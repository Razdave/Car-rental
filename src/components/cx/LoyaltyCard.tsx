import React from 'react';
import { Award, Check } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { completedTrips, LOYALTY_TIERS, loyaltyFor } from '../../lib/loyalty';
import { cn } from '../ui/Button';
import { Card } from '../ui/Layout';

const TIER_STYLE: Record<string, string> = {
  member: 'from-ink to-[#2a2b30]',
  silver: 'from-[#5b6470] to-[#9aa3ad]',
  gold: 'from-[#8a6a1f] to-[#d4a93c]',
  black: 'from-black to-[#3a1410]'
};

/** Loyalty status: current tier, progress to the next, and what each tier includes. */
export const LoyaltyCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { bookings } = useAppState();
  const l = loyaltyFor(completedTrips(bookings));

  return (
    <Card className="overflow-hidden">
      <div className={cn('bg-gradient-to-br p-5 text-white', TIER_STYLE[l.tier.id])}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-lg font-extrabold">
            <Award className="size-5" /> {l.tier.name}
          </p>
          <p className="text-sm text-white/80">{l.trips} {l.trips === 1 ? 'trip' : 'trips'}</p>
        </div>
        {l.next ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.progress * 100)} aria-label={`Progress to ${l.next.name}`}>
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(6, l.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/90">
              {l.tripsToNext} more {l.tripsToNext === 1 ? 'trip' : 'trips'} to <strong>{l.next.name}</strong> — {l.next.perks[0].toLowerCase()}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-white/90">You’ve reached our highest tier. Thank you for driving with us.</p>
        )}
      </div>
      {!compact && (
        <div className="divide-y divide-line">
          {LOYALTY_TIERS.map((t) => {
            const reached = l.trips >= t.minTrips;
            return (
              <div key={t.id} className={cn('p-4', !reached && 'opacity-70')}>
                <p className="flex items-center justify-between text-sm font-extrabold">
                  <span>{t.name}</span>
                  <span className="font-semibold text-ink-soft">{t.minTrips === 0 ? 'From your first trip' : `${t.minTrips}+ trips`}</span>
                </p>
                <ul className="mt-1.5 space-y-1">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-sm text-ink-muted">
                      <Check className={cn('mt-0.5 size-4 shrink-0', reached ? 'text-emerald-600' : 'text-ink-faint')} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="p-4 text-xs text-ink-soft">Perks are applied automatically at checkout. Rates stay the same for everyone — loyalty adds extras, not discounts.</p>
        </div>
      )}
    </Card>
  );
};
