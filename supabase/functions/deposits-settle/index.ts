// POST { bookingId, captured, note } (staff only) → { status, refunded }
// Refunds the security deposit through Paystack (minus any amount kept for damage, fuel, late return…)
// and records the settlement. Validation runs before any money moves.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, env, HttpError, json, paystack, requireUser, serve } from '../_shared/util.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const { bookingId, captured = 0, note = '' } = await req.json().catch(() => ({}));
  if (typeof bookingId !== 'string') throw new HttpError(400, 'bookingId is required.');
  const keep = Math.round(Number(captured));
  if (!Number.isFinite(keep)) throw new HttpError(400, 'captured must be a number.');

  const admin = adminClient();
  const { data: staff } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (!staff || staff.role === 'customer') throw new HttpError(403, 'Staff only.');

  const { data: b, error } = await admin.from('bookings').select('id, status, deposit_status, deposit_amount, deposit_ref').eq('id', bookingId).single();
  if (error || !b) throw new HttpError(404, 'Booking not found.');
  if (b.deposit_status !== 'held') throw new HttpError(409, 'Only a held deposit can be released.');
  if (b.status === 'active') throw new HttpError(409, 'Complete the trip before releasing the deposit.');
  if (keep < 0 || keep > b.deposit_amount) throw new HttpError(400, 'The amount kept must be between ₦0 and the deposit.');
  if (keep > 0 && String(note).trim().length < 5) throw new HttpError(400, 'Give the reason for keeping part of the deposit.');

  const refund = b.deposit_amount - keep;
  if (refund > 0) {
    if (!b.deposit_ref) throw new HttpError(409, 'No Paystack reference for this deposit — refund it manually, then record it.');
    await paystack('/refund', {
      method: 'POST',
      body: JSON.stringify({ transaction: b.deposit_ref, amount: refund * 100, merchant_note: `Deposit release ${b.id}` })
    });
  }

  // Record through the database function (as the staff user) so the same rules and audit log apply.
  const asStaff = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
    auth: { persistSession: false }
  });
  const { error: recordError } = await asStaff.rpc('settle_deposit', { p_id: b.id, p_captured: keep, p_note: String(note) });
  if (recordError) {
    console.error('Refund sent but recording failed', b.id, recordError);
    throw new HttpError(500, `Refund of ₦${refund.toLocaleString()} was sent, but recording it failed: ${recordError.message}`);
  }
  return json(req, { status: keep > 0 ? 'captured' : 'released', refunded: refund });
});
