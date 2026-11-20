// Paystack webhook (deploy with --no-verify-jwt). Verifies the HMAC signature, then re-checks
// the transaction with Paystack's API before marking anything paid.
import { adminClient, env, settlePayment } from '../_shared/util.ts';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('PAYSTACK_SECRET_KEY')), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const given = req.headers.get('x-paystack-signature') ?? '';
  if (!constantTimeEqual(given, expected)) return new Response('Invalid signature', { status: 401 });

  const event = JSON.parse(raw) as { event: string; data?: { reference?: string } };
  if ((event.event === 'charge.success' || event.event === 'charge.failed') && event.data?.reference) {
    try {
      await settlePayment(adminClient(), event.data.reference);
    } catch (e) {
      console.error('Webhook settle failed', event.data.reference, e);
      // 200 anyway for unknown references so Paystack doesn't retry forever; 500 for transient errors.
      if (!(e instanceof Error && /No booking/.test(e.message))) return new Response('Retry', { status: 500 });
    }
  }
  return new Response('ok');
});
