// POST { reference } → { bookingId, status }
// Called by the app when Paystack redirects back, so the booking updates without waiting for the webhook.
import { adminClient, HttpError, json, requireUser, serve, settlePayment } from '../_shared/util.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const { reference } = await req.json().catch(() => ({}));
  // References are ours (BK-XXXX-[DEP-]xxxx); reject anything else before it reaches a query filter.
  if (typeof reference !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(reference)) throw new HttpError(400, 'A valid reference is required.');

  const admin = adminClient();
  const { data: booking } = await admin.from('bookings').select('customer_id').or(`payment_ref.eq.${reference},deposit_ref.eq.${reference}`).maybeSingle();
  if (!booking || booking.customer_id !== user.id) throw new HttpError(404, 'Payment not found.');

  return json(req, await settlePayment(admin, reference));
});
