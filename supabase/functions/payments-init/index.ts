// POST { bookingId, callbackUrl, purpose?: 'rental' | 'deposit' } → { authorizationUrl, reference }
// Starts a Paystack checkout for the caller's unpaid booking, or for its refundable security deposit.
import { adminClient, env, HttpError, json, paystack, requireUser, serve } from '../_shared/util.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const { bookingId, callbackUrl, purpose = 'rental' } = await req.json().catch(() => ({}));
  if (purpose !== 'rental' && purpose !== 'deposit') throw new HttpError(400, 'purpose must be rental or deposit.');
  if (typeof bookingId !== 'string') throw new HttpError(400, 'bookingId is required.');

  // Only redirect back to our own site.
  const site = env('SITE_URL');
  const allowed = [site, ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')].map((s) => s.trim()).filter(Boolean);
  const callback = typeof callbackUrl === 'string' && allowed.some((o) => callbackUrl.startsWith(o)) ? callbackUrl : `${site}/bookings/${bookingId}?new=1`;

  const admin = adminClient();
  const { data: booking, error } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (error) throw error;
  if (!booking || booking.customer_id !== user.id) throw new HttpError(404, 'Booking not found.');
  if (!['pending', 'confirmed'].includes(booking.status)) throw new HttpError(409, 'This booking can’t be paid.');
  const isDeposit = purpose === 'deposit';
  if (!isDeposit && booking.payment_status === 'paid') throw new HttpError(409, 'This booking is already paid.');
  if (isDeposit && booking.deposit_status !== 'pending') throw new HttpError(409, 'No deposit is due for this booking.');
  const amount = isDeposit ? booking.deposit_amount : booking.total_amount;

  // Paystack card pre-authorisation needs merchant approval, so the deposit is a separate charge refunded after return.
  const reference = `${booking.id}-${isDeposit ? 'DEP-' : ''}${crypto.randomUUID().slice(0, 8)}`;
  const tx = await paystack<{ authorization_url: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: booking.driver.email,
      amount: amount * 100, // kobo
      currency: 'NGN',
      reference,
      callback_url: callback,
      metadata: { booking_id: booking.id, car: booking.car_snapshot?.name, purpose }
    })
  });

  const { error: updateError } = await admin
    .from('bookings')
    .update(isDeposit ? { deposit_ref: reference } : { payment_ref: reference, payment_method: 'Paystack' })
    .eq('id', booking.id);
  if (updateError) throw updateError;
  return json(req, { authorizationUrl: tx.authorization_url, reference });
});
