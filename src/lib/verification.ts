import type { Car, CarCategory, CheckId, CustomerVerification } from '../types/car';
import { todayISO } from './dates';

/**
 * Customer screening rules. Mirrors review_verification() and the booking gates in
 * supabase/migrations/20261120000008_screening_deposits.sql.
 */
export const MIN_DRIVER_AGE = 25;
/** The licence must stay valid this long after the trip. */
export const LICENCE_VALID_DAYS_AFTER_RETURN = 0;

export const CHECKS: Array<{ id: CheckId; label: string; description: string }> = [
  { id: 'licence', label: 'Driving licence', description: 'Valid full licence, front and back' },
  { id: 'identity', label: 'Government ID', description: 'Passport, national ID (NIN), voter’s card or residence permit' },
  { id: 'selfie', label: 'Selfie match', description: 'A clear photo of your face to match your ID' },
  { id: 'employment', label: 'Employment or company', description: 'Employer, role and a supporting document, or a corporate account' },
  { id: 'record', label: 'Driving record', description: 'Convictions, accidents or suspensions in the last 5 years' }
];

/** Refundable security deposit by category (₦). Staff can override per car. */
export const DEFAULT_DEPOSITS: Record<Exclude<CarCategory, 'All'>, number> = {
  Sedan: 250000,
  SUV: 400000,
  Sports: 500000,
  Luxury: 750000
};

export const depositFor = (car: Car) =>
  car.depositAmount ?? DEFAULT_DEPOSITS[car.category as Exclude<CarCategory, 'All'>] ?? 300000;

export const ageOn = (dateOfBirth: string, on = todayISO()) => {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  if (!y) return 0;
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

export const emptyVerification = (customerId: string): CustomerVerification => ({
  customerId,
  status: 'unverified',
  checks: {
    licence: { status: 'missing' },
    identity: { status: 'missing' },
    selfie: { status: 'missing' },
    employment: { status: 'missing' },
    record: { status: 'missing' }
  },
  submittedAt: null,
  reviewedAt: null,
  reviewerNote: null,
  dateOfBirth: '',
  licence: { number: '', country: 'Nigeria', licenceClass: 'B', expiry: '', frontDoc: '', backDoc: '' },
  identity: { type: 'national_id', number: '', expiry: '', doc: '' },
  selfieDoc: '',
  employment: { type: 'employed', employer: '', jobTitle: '', workEmail: '', corporateAccount: '', doc: '' },
  record: { convictions: false, accidents: false, suspensions: false, details: '', doc: '' },
  consent: false
});

/** Client-side completeness check before submitting (the server re-validates). */
export function verificationProblems(v: CustomerVerification): Partial<Record<CheckId | 'dob' | 'consent', string>> {
  const p: Partial<Record<CheckId | 'dob' | 'consent', string>> = {};
  const today = todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dateOfBirth)) p.dob = 'Enter your date of birth.';
  else if (ageOn(v.dateOfBirth) < MIN_DRIVER_AGE) p.dob = `Drivers must be ${MIN_DRIVER_AGE} or older.`;
  const l = v.licence;
  if (l.number.trim().length < 5 || !l.country.trim() || !l.expiry || !l.frontDoc || !l.backDoc) p.licence = 'Add the licence number, expiry and both sides.';
  else if (l.expiry <= today) p.licence = 'Your driving licence has expired.';
  const id = v.identity;
  if (id.number.trim().length < 5 || !id.doc) p.identity = 'Add the ID number and a photo of the document.';
  else if (id.expiry && id.expiry <= today) p.identity = 'This ID has expired.';
  if (!v.selfieDoc) p.selfie = 'Take or upload a selfie.';
  const e = v.employment;
  if (e.type === 'corporate' ? !e.corporateAccount.trim() || !e.doc : !e.employer.trim() || !e.jobTitle.trim() || !e.doc)
    p.employment = e.type === 'corporate' ? 'Add the company name and an authorisation letter.' : 'Add your employer, role and a supporting document.';
  if ((v.record.convictions || v.record.accidents || v.record.suspensions) && v.record.details.trim().length < 10)
    p.record = 'Tell us briefly what happened and when.';
  if (!v.consent) p.consent = 'Please confirm the declaration.';
  return p;
}

export const STATUS_COPY: Record<CustomerVerification['status'], { title: string; body: string; tone: string }> = {
  unverified: { title: 'Verify your identity', body: 'Required before your first booking. Takes about 5 minutes.', tone: 'bg-amber-50 text-amber-900 border-amber-200' },
  pending: { title: 'Verification in review', body: 'We usually review documents within a few working hours. You can book now; we confirm once you’re verified.', tone: 'bg-sky-50 text-sky-900 border-sky-200' },
  verified: { title: 'Verified driver', body: 'Your licence, ID and record have been checked.', tone: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  rejected: { title: 'Verification needs attention', body: 'Some details couldn’t be approved. Update them and resubmit.', tone: 'bg-brand-soft text-brand border-brand/20' },
  expired: { title: 'Verification expired', body: 'Your licence or ID has expired. Upload the renewed document to keep booking.', tone: 'bg-brand-soft text-brand border-brand/20' }
};
