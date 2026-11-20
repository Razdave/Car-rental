export type CarCategory = 'All' | 'Sports' | 'SUV' | 'Luxury' | 'Sedan';

export interface Car {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  category: CarCategory;
  pricePerDay: number;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  powerHp: number;
  acceleration0to100: number; // in seconds
  topSpeedKmH: number;
  transmission: 'Automatic' | 'Manual';
  fuelType: 'Petrol' | 'Hybrid' | 'Diesel';
  seats: number;
  doors: number;
  color: string;
  imageUrl: string;
  galleryImages: string[];
  description: string;
  features: string[];
  location: string;
  isAvailable: boolean;
  isPopular?: boolean;
  isFeatured?: boolean;
  hostName: string;
  hostRating: number;
  mileageLimit: string;
  /** Rental rules shown on the listing, e.g. "No smoking", "Minimum age 25". */
  rules?: string[];
  /** Fixed-price packages offered on this car, in addition to the standard daily/hourly rates. */
  packages?: RatePackage[];
  /** Refundable security deposit held for every rental of this car (₦). */
  depositAmount?: number;
}

/**
 * A fixed-price rental package, e.g. "Weekend Escape" (Fri pick-up, 2 days) or
 * "Red Carpet & Wedding" (6-hour block). The price covers the whole duration; promo codes don't apply.
 */
export interface RatePackage {
  id: string;
  name: string;
  description: string;
  durationUnit: 'day' | 'hour';
  duration: number;
  price: number;
  includes: string[];
  /** Allowed pick-up weekdays (0 = Sunday … 6 = Saturday). Empty = any day. */
  pickupDays: number[];
  active: boolean;
}

export interface Review {
  id: string;
  carId: string;
  bookingId: string;
  authorName: string;
  rating: number; // 1–5
  comment: string;
  createdAt: string;
  hidden: boolean;
  /** Public reply from the rental team, shown under the review. */
  staffReply?: string | null;
  staffReplyAt?: string | null;
  /** Service recovery for low ratings: 'open' until a manager has followed up. */
  followUp?: 'none' | 'open' | 'resolved';
  followUpNote?: string | null;
}

export interface ExtraService {
  id: string;
  name: string;
  description: string;
  pricePerDay: number;
  selected: boolean;
  iconName: string;
}

export interface DriverInfo {
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  ageConfirmed: boolean;
}

export interface Booking {
  id: string;
  /** Account that owns the booking (Supabase). */
  customerId?: string;
  carId: string;
  car: Car;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupLocation: string;
  returnLocation: string;
  totalDays: number;
  durationUnit?: 'day' | 'hour';
  durationValue?: number;
  /** Set when booked as a fixed-price package. */
  packageId?: string | null;
  packageName?: string | null;
  /** Refundable security deposit (snapshot at booking time). */
  depositAmount?: number;
  depositStatus?: DepositStatus;
  /** Amount kept from the deposit (damage, fuel, late return…), with the reason. */
  depositCaptured?: number;
  depositNote?: string | null;
  basePrice: number;
  extraServices: ExtraService[];
  discount: number;
  taxAmount: number;
  totalAmount: number;
  status: 'active' | 'upcoming' | 'completed' | 'cancelled';
  managementStatus?: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  driverInfo: DriverInfo;
  paymentMethod: string;
  paymentStatus?: PaymentStatus;
  createdAt: string;
  digitalPassCode: string;
  agreement?: RentalAgreement | null;
}

export type PaymentStatus = 'unpaid' | 'authorized' | 'paid' | 'refunded' | 'failed';
export type DepositStatus = 'none' | 'pending' | 'held' | 'released' | 'captured';

// ---------------------------------------------------------------- customer screening (KYC)
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';
export type CheckStatus = 'missing' | 'pending' | 'approved' | 'rejected';
export type CheckId = 'licence' | 'identity' | 'selfie' | 'employment' | 'record';

export interface VerificationCheck {
  status: CheckStatus;
  reason?: string | null;
}

export interface CustomerVerification {
  customerId: string;
  status: VerificationStatus;
  checks: Record<CheckId, VerificationCheck>;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;

  dateOfBirth: string; // YYYY-MM-DD
  licence: { number: string; country: string; licenceClass: string; expiry: string; frontDoc: string; backDoc: string };
  identity: { type: 'passport' | 'national_id' | 'voters_card' | 'residence_permit'; number: string; expiry: string; doc: string };
  selfieDoc: string;
  employment: {
    type: 'employed' | 'self_employed' | 'corporate';
    employer: string;
    jobTitle: string;
    workEmail: string;
    /** Corporate accounts: the company paying for the rental. */
    corporateAccount: string;
    doc: string;
  };
  record: { convictions: boolean; accidents: boolean; suspensions: boolean; details: string; doc: string };
  consent: boolean;
}
export type ManagementStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type Role = 'customer' | 'staff' | 'manager' | 'admin';

export interface RentalAgreement {
  version: string;
  signedName: string;
  /** PNG data URL of the drawn signature. */
  signatureImage: string;
  signedAt: string;
}

export interface BookingMessage {
  id: string;
  /** Conversations are one thread per customer; a message can reference a booking. */
  customerId: string;
  bookingId: string | null;
  sender: 'customer' | 'staff';
  senderName: string;
  body: string;
  createdAt: string;
}

/** A row in the automated email/SMS queue. */
export interface OutboxMessage {
  id: string;
  bookingId: string | null;
  event: string;
  channel: 'email' | 'sms';
  recipient: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed';
  createdAt: string;
  error?: string | null;
}

export interface CarBlock {
  id: string;
  carId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  reason: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  licenseVerified: boolean;
  smsOptIn: boolean;
  notes: string;
  blocked: boolean;
  role: Role;
  createdAt: string;
}

export interface FilterOptions {
  search: string;
  category: CarCategory;
  minPrice: number;
  maxPrice: number;
  transmission: 'all' | 'Automatic' | 'Manual';
  seats: number | 'all';
  sortBy: 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'power';
}
