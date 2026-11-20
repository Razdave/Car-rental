// Shared helpers for Aurevon Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const env = (name: string, required = true): string => {
  const value = Deno.env.get(name) ?? '';
  if (required && !value) throw new HttpError(500, `${name} is not configured.`);
  return value;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] ?? '*';
};

export const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigin(req),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin'
});

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

/** Wraps a handler with CORS preflight and JSON error responses. */
export const serve = (handler: (req: Request) => Promise<Response>) =>
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
    try {
      return await handler(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      return json(req, { error: e instanceof Error ? e.message : 'Unexpected error' }, status);
    }
  });

export const adminClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** The signed-in user calling the function (from their JWT). */
export async function requireUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Please sign in.');
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Please sign in.');
  return data.user;
}

// ---------------------------------------------------------------- Paystack
const PAYSTACK = 'https://api.paystack.co';

export async function paystack<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json', ...init?.headers }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new HttpError(502, body.message ?? `Paystack error (${res.status}).`);
  return body.data as T;
}

/**
 * Confirms a Paystack reference server-side and marks the booking paid.
 * Checks amount and currency so a tampered or partial payment can't settle a booking.
 */
export async function settlePayment(admin: SupabaseClient, reference: string) {
  const tx = await paystack<{ status: string; amount: number; currency: string; reference: string }>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  // Security deposit references are stored separately.
  const { data: depositBooking } = await admin.from('bookings').select('id, deposit_amount, deposit_status').eq('deposit_ref', reference).maybeSingle();
  if (depositBooking) {
    if (depositBooking.deposit_status !== 'pending') return { bookingId: depositBooking.id, status: depositBooking.deposit_status };
    if (tx.status !== 'success') return { bookingId: depositBooking.id, status: tx.status };
    if (tx.currency !== 'NGN' || tx.amount !== depositBooking.deposit_amount * 100) {
      throw new HttpError(409, 'The deposit amount does not match the booking. Our team has been alerted.');
    }
    await admin.from('bookings').update({ deposit_status: 'held' }).eq('id', depositBooking.id);
    return { bookingId: depositBooking.id, status: 'held' };
  }

  const { data: booking, error } = await admin.from('bookings').select('id, total_amount, payment_status').eq('payment_ref', reference).maybeSingle();
  if (error) throw error;
  if (!booking) throw new HttpError(404, 'No booking for this payment reference.');
  if (booking.payment_status === 'paid') return { bookingId: booking.id, status: 'paid' };

  if (tx.status === 'success') {
    if (tx.currency !== 'NGN' || tx.amount !== booking.total_amount * 100) {
      console.error('Amount mismatch', reference, tx.amount, booking.total_amount);
      throw new HttpError(409, 'The payment amount does not match the booking. Our team has been alerted.');
    }
    await admin.from('bookings').update({ payment_status: 'paid' }).eq('id', booking.id);
    return { bookingId: booking.id, status: 'paid' };
  }
  if (tx.status === 'failed' || tx.status === 'abandoned') {
    await admin.from('bookings').update({ payment_status: 'failed' }).eq('id', booking.id).eq('payment_status', 'unpaid');
    return { bookingId: booking.id, status: 'failed' };
  }
  return { bookingId: booking.id, status: tx.status };
}
