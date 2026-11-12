import type { Booking } from '../types/car';

const to24h = (time: string) => {
  const m = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!m) return '0000';
  const h = (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}${m[2]}`;
};

const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${to24h(time)}00`;
const escape = (text: string) => text.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Downloads an .ics file with the pick-up → return window (floating local time). */
export function downloadBookingCalendar(booking: Booking): void {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aurevon//Car Rental//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@aurevon`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${stamp(booking.pickupDate, booking.pickupTime)}`,
    `DTEND:${stamp(booking.returnDate, booking.returnTime)}`,
    `SUMMARY:${escape(`${booking.car.name} rental`)}`,
    `LOCATION:${escape(booking.pickupLocation)}`,
    `DESCRIPTION:${escape(`Booking ${booking.id}\nReturn to: ${booking.returnLocation}`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `aurevon-${booking.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
