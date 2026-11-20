import type { Booking } from '../types/car';
import { formatNaira } from '../utils/currency';
import { formatDate } from './dates';
import { bookingDurationLabel } from './pricing';

/** Bump when the terms change; signed agreements keep the version and full text they were signed against. */
export const AGREEMENT_VERSION = '2026-11';

export interface AgreementSection {
  heading: string;
  body: string[];
}

/**
 * Template terms for a premium car rental. Have them reviewed by a lawyer for
 * the operating market before going live.
 */
export function buildAgreement(b: Booking): AgreementSection[] {
  const extras = b.extraServices.map((s) => s.name).join(', ') || 'None';
  return [
    {
      heading: '1. Parties',
      body: [
        `This Rental Agreement is between Aurevon ("the Company") and ${b.driverInfo.fullName} ("the Renter"), email ${b.driverInfo.email}, phone ${b.driverInfo.phone}, driving licence ${b.driverInfo.licenseNumber}.`
      ]
    },
    {
      heading: '2. Vehicle and rental period',
      body: [
        `Vehicle: ${b.car.year} ${b.car.name} (${b.car.color}). Booking reference ${b.id}.`,
        `Pick-up: ${formatDate(b.pickupDate)} at ${b.pickupTime}, ${b.pickupLocation}.`,
        `Return: ${formatDate(b.returnDate)} at ${b.returnTime}, ${b.returnLocation}.`,
        `Duration: ${bookingDurationLabel(b)}. Mileage allowance: ${b.car.mileageLimit}.`
      ]
    },
    {
      heading: '3. Charges',
      body: [
        `${b.packageName ? `${b.packageName} package (fixed price) ` : 'Rental '}${formatNaira(b.basePrice)}, taxes and fees ${formatNaira(b.taxAmount)}${b.discount ? `, discount −${formatNaira(b.discount)}` : ''}. Total ${formatNaira(b.totalAmount)}.`,
        `Add-ons: ${extras}.`,
        'Late returns are charged at the hourly rate for each started hour after a 30-minute grace period. Fuel or charge below the pick-up level, excess mileage, cleaning beyond normal use, traffic fines and tolls are charged to the Renter.'
      ]
    },
    {
      heading: '4. Driver requirements',
      body: [
        'The Renter confirms they are at least 25 years old and hold a full, valid driving licence, which they will present at pick-up. Only the Renter and drivers registered on this booking may drive the vehicle.'
      ]
    },
    {
      heading: '5. Use of the vehicle',
      body: [
        'The vehicle must not be used for racing, track days, towing, commercial hire, carrying passengers for payment, off-road driving, or while under the influence of alcohol or drugs. Smoking and pets are not allowed. The vehicle may not leave the country without written consent.'
      ]
    },
    ...(b.car.rules?.length
      ? [{ heading: '5a. Rules for this vehicle', body: [b.car.rules.join('. ').replace(/\.?$/, '.')] }]
      : []),
    {
      heading: '6. Damage, theft and insurance',
      body: [
        b.extraServices.some((s) => s.id === 'insurance-full')
          ? 'Full Damage Protection is included: the Renter’s liability for accidental damage and theft is reduced to ₦0, except where caused by a breach of section 5 or gross negligence.'
          : 'Full Damage Protection was not selected: the Renter is liable for the cost of damage to, or loss of, the vehicle during the rental period, up to its market value.',
        'Any accident, damage, theft or warning light must be reported to the Company immediately on the 24/7 assistance line, and to the police where required.'
      ]
    },
    {
      heading: '6a. Security deposit',
      body: [
        `A refundable security deposit of ${formatNaira(b.depositAmount ?? 0)} is held for this rental and must be in place before pick-up. It is released after the vehicle is returned and inspected. The Company may keep part or all of it to cover damage not covered by protection, fuel or charge shortfall, excess mileage, cleaning, late return, fines or tolls, and will give the Renter the reason and amount in writing.`
      ]
    },
    {
      heading: '6b. Screening',
      body: [
        'The Renter confirms that the driving licence, government ID, employment details and driving-record declaration provided during verification are true and current, and will tell the Company of any change (including new convictions or a suspension) before or during the rental. False information makes this agreement void.'
      ]
    },
    {
      heading: '7. Cancellation',
      body: [
        'Cancellations made more than 24 hours before pick-up are refunded in full. Later cancellations and no-shows may be charged one day’s rental.'
      ]
    },
    {
      heading: '8. Condition and tracking',
      body: [
        'The vehicle is handed over clean, fuelled or charged, and inspected; photos are taken at pick-up and return. The Renter accepts that the vehicle is fitted with GPS tracking used for security and recovery.'
      ]
    },
    {
      heading: '9. Electronic signature',
      body: [
        'By signing electronically the Renter confirms they have read and accept these terms, and agrees that this electronic signature is as binding as a handwritten one.'
      ]
    }
  ];
}

export const agreementToText = (b: Booking): string =>
  [`Aurevon Rental Agreement — version ${AGREEMENT_VERSION}`, ...buildAgreement(b).flatMap((s) => [s.heading, ...s.body])].join('\n\n');
