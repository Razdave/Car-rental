// Delivers queued rows from notifications_outbox: email (Resend), SMS (Termii), push (Web Push).
// Triggered every minute by pg_cron (dispatch_notifications) with the x-cron-secret header,
// or manually with the service role key. Deploy with --no-verify-jwt.
import webpush from 'npm:web-push@3.6.7';
import { adminClient, env } from '../_shared/util.ts';

type Row = {
  id: number; booking_id: string | null; user_id: string | null; event: string; channel: 'email' | 'sms' | 'push';
  recipient: string; subject: string; body: string; url: string; attempts: number;
};

const SITE = () => env('SITE_URL').replace(/\/$/, '');
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const emailHtml = (row: Row) => `<!doctype html><html><body style="margin:0;background:#f7f7f8;font-family:Arial,sans-serif;color:#080808">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:20px;padding:28px">
<tr><td><p style="margin:0 0 16px;font-weight:800;font-size:18px">Aurevon</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(row.subject)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4d5056">${escapeHtml(row.body)}</p>
<a href="${SITE()}${row.url}" style="display:inline-block;background:#d61b04;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Open in the app</a>
${row.booking_id ? `<p style="margin:20px 0 0;font-size:12px;color:#6b6e75">Booking ${escapeHtml(row.booking_id)}</p>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#6b6e75;margin-top:16px">You’re receiving this because you have a booking with Aurevon.</p>
</td></tr></table></body></html>`;

/** .ics attachment for confirmations. */
async function calendarAttachment(row: Row) {
  if (row.event !== 'booking.confirmed' || !row.booking_id) return undefined;
  const { data: b } = await adminClient().from('bookings').select('id, pickup_at, return_at, car_snapshot, pickup_location_id').eq('id', row.booking_id).single();
  if (!b) return undefined;
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aurevon//EN', 'BEGIN:VEVENT', `UID:${b.id}@aurevon`, `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(b.pickup_at)}`, `DTEND:${fmt(b.return_at)}`, `SUMMARY:${b.car_snapshot?.name ?? 'Car'} rental`, `DESCRIPTION:Booking ${b.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return [{ filename: `aurevon-${b.id}.ics`, content: btoa(ics) }];
}

async function sendEmail(row: Row) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('Email provider not configured (RESEND_API_KEY).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('NOTIFY_FROM_EMAIL'),
      to: row.recipient,
      subject: row.subject,
      html: emailHtml(row),
      text: `${row.subject}\n\n${row.body}\n\n${SITE()}${row.url}`,
      attachments: await calendarAttachment(row)
    })
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Termii expects international format without '+', e.g. 2348012345678. */
const normalisePhone = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') && d.length === 11 ? `234${d.slice(1)}` : d;
};

async function sendSms(row: Row) {
  const key = Deno.env.get('TERMII_API_KEY');
  if (!key) throw new Error('SMS provider not configured (TERMII_API_KEY).');
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key, to: normalisePhone(row.recipient), from: env('TERMII_SENDER_ID'), type: 'plain', channel: 'generic',
      sms: `Aurevon: ${row.subject}. ${row.body}`.slice(0, 459)
    })
  });
  if (!res.ok) throw new Error(`Termii ${res.status}: ${await res.text()}`);
}

async function sendPush(row: Row) {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) throw new Error('Push not configured (VAPID keys).');
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@aurevon.example', pub, priv);
  const admin = adminClient();
  const { data: subs } = await admin.from('push_subscriptions').select('id, subscription').eq('user_id', row.recipient);
  const payload = JSON.stringify({ title: row.subject, body: row.body, url: row.url, tag: row.booking_id ?? row.event });
  let delivered = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 3600 });
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); // device unsubscribed
      else throw e;
    }
  }
  if (!delivered && subs?.length) throw new Error('No push subscription accepted the message.');
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!(secret && req.headers.get('x-cron-secret') === secret) && bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = adminClient();
  const { data: rows, error } = await admin
    .from('notifications_outbox')
    .select('*')
    .eq('status', 'queued')
    .lt('attempts', 5)
    .order('created_at')
    .limit(25);
  if (error) return new Response(error.message, { status: 500 });

  const results = { sent: 0, failed: 0 };
  for (const row of (rows ?? []) as Row[]) {
    try {
      if (row.channel === 'email') await sendEmail(row);
      else if (row.channel === 'sms') await sendSms(row);
      else await sendPush(row);
      await admin.from('notifications_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq('id', row.id);
      results.sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      await admin
        .from('notifications_outbox')
        .update({ status: attempts >= 5 ? 'failed' : 'queued', attempts, last_error: e instanceof Error ? e.message.slice(0, 500) : String(e) })
        .eq('id', row.id);
      results.failed++;
    }
  }
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
});
