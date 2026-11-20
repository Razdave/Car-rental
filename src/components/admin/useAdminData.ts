import { useCallback, useEffect, useState } from 'react';
import type { Booking, BookingMessage, Car, CarBlock, Customer, OutboxMessage, Review } from '../../types/car';
import { backend } from '../../lib/backend';
import { useAppState } from '../../state/AppState';

export interface AdminData {
  bookings: Booking[];
  cars: Car[];
  blocks: CarBlock[];
  customers: Customer[];
  outbox: OutboxMessage[];
  messages: BookingMessage[];
  reviews: Review[];
}

const EMPTY: AdminData = { bookings: [], cars: [], blocks: [], customers: [], outbox: [], messages: [], reviews: [] };

/** Loads everything the dashboard needs and reloads live whenever bookings, fleet or messages change. */
export function useAdminData(enabled: boolean) {
  const { showToast, refreshBookings } = useAppState();
  const [data, setData] = useState<AdminData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [bookings, cars, blocks, customers, outbox, messages, reviews] = await Promise.all([
        backend.admin.listBookings(),
        backend.admin.listCars(),
        backend.admin.listBlocks(),
        backend.admin.listCustomers(),
        backend.admin.listOutbox(),
        backend.admin.listAllMessages(),
        backend.admin.listReviews()
      ]);
      setData({ bookings, cars, blocks, customers, outbox, messages, reviews });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return backend.admin.onChange(() => void reload());
  }, [enabled, reload]);

  /** Runs a staff action, shows its error as a toast, then reloads. */
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        if (success) showToast(success, 'success');
        await reload();
        void refreshBookings();
        return true;
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'That didn’t work', 'error');
        return false;
      }
    },
    [reload, refreshBookings, showToast]
  );

  return { data, loading, reload, run };
}
