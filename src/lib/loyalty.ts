import type { Booking } from '../types/car';

/**
 * Loyalty tiers reward repeat customers with service and add-ons, never with lower rental rates.
 * Mirrors loyalty_free_extras() in supabase/migrations/20261120000007_customer_experience.sql.
 */
export interface LoyaltyTier {
  id: 'member' | 'silver' | 'gold' | 'black';
  name: string;
  minTrips: number;
  /** Add-on IDs included free at this tier. */
  freeExtras: string[];
  perks: string[];
}

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { id: 'member', name: 'Member', minTrips: 0, freeExtras: [], perks: ['Saved driver details for one-tap rebooking', '24/7 roadside assistance'] },
  {
    id: 'silver',
    name: 'Silver',
    minTrips: 3,
    freeExtras: ['additional-driver'],
    perks: ['Additional driver included free', 'Priority replies from the concierge team']
  },
  {
    id: 'gold',
    name: 'Gold',
    minTrips: 6,
    freeExtras: ['additional-driver', 'unlimited-mileage'],
    perks: ['Additional driver and unlimited mileage included free', '2-hour late-return grace', 'Free upgrade when a higher category is available']
  },
  {
    id: 'black',
    name: 'Black',
    minTrips: 10,
    freeExtras: ['additional-driver', 'unlimited-mileage', 'child-seat'],
    perks: ['All Gold perks, plus a child seat included free', 'Dedicated concierge', 'First pick of new cars in the fleet']
  }
];

export const completedTrips = (bookings: Booking[]) =>
  bookings.filter((b) => (b.managementStatus ?? b.status) === 'completed').length;

export function loyaltyFor(trips: number) {
  const tier = [...LOYALTY_TIERS].reverse().find((t) => trips >= t.minTrips) ?? LOYALTY_TIERS[0];
  const next = LOYALTY_TIERS.find((t) => t.minTrips > trips) ?? null;
  return {
    trips,
    tier,
    next,
    tripsToNext: next ? next.minTrips - trips : 0,
    progress: next ? (trips - tier.minTrips) / (next.minTrips - tier.minTrips) : 1
  };
}

export const isFreePerk = (tier: LoyaltyTier, extraId: string) => tier.freeExtras.includes(extraId);
