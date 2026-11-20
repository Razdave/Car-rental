import type {
  Booking, BookingMessage, Car, CarBlock, CheckId, CheckStatus, Customer, CustomerVerification, DriverInfo, ManagementStatus,
  OutboxMessage, Review, Role
} from '../../types/car';
import type { DurationUnit } from '../pricing';
import { USER_PROFILE } from '../../data/cars';

export type Profile = typeof USER_PROFILE & {
  id: string;
  role: Role;
  licenseVerified: boolean;
  smsOptIn: boolean;
};

export interface CreateBookingInput {
  carId: string;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupLocation: string;
  returnLocation: string;
  durationUnit: DurationUnit;
  extraServiceIds: string[];
  driverInfo: DriverInfo;
  paymentMethod: string;
  promoCode?: string;
  /** Book a fixed-price package (promo codes don't apply). */
  packageId?: string | null;
}

export interface TripWindow {
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
}

export interface SignAgreementInput {
  signedName: string;
  signatureImage: string;
  termsText: string;
  version: string;
}

export type Unsubscribe = () => void;

export type CarInput = Omit<Car, 'id' | 'rating' | 'reviewCount' | 'hostRating'> & { id?: string };

/** Everything the UI needs from a server. Implemented by `local` (device demo) and `supabase`. */
export interface Backend {
  kind: 'local' | 'supabase';
  /** Shown in the UI when data is device-only. */
  isDemo: boolean;

  // Auth & customer data
  getProfile(): Promise<Profile | null>;
  onAuthChange(cb: (profile: Profile | null) => void): Unsubscribe;
  sendSignInCode(email: string): Promise<void>;
  verifySignInCode(email: string, code: string): Promise<Profile>;
  signOut(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;

  // Fleet
  listCars(): Promise<{ cars: Car[]; live: boolean }>;
  unavailableCarIds(window: TripWindow): Promise<string[]>;
  /** Dates (YYYY-MM-DD) between `from` and `to` inclusive on which the car is booked or blocked at any point. */
  bookedDays(carId: string, from: string, to: string): Promise<string[]>;
  /** Fires when anything that affects availability changes (bookings, blocks, car status). */
  onFleetChange(cb: () => void): Unsubscribe;

  // Favourites
  listFavorites(): Promise<string[]>;
  setFavorite(carId: string, saved: boolean): Promise<void>;

  // Bookings
  listMyBookings(): Promise<Booking[]>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
  /** Supabase: returns a Paystack checkout URL. Local: marks the booking paid. */
  startPayment(bookingId: string, returnUrl: string): Promise<{ redirectUrl: string | null; booking: Booking | null }>;
  verifyPayment(reference: string): Promise<void>;
  refreshBooking(booking: Booking): Promise<Booking | null>;
  cancelBooking(id: string): Promise<Booking>;
  extendBooking(id: string, amount: number): Promise<Booking>;
  signAgreement(bookingId: string, input: SignAgreementInput): Promise<Booking>;
  onMyBookingsChange(cb: () => void): Unsubscribe;

  // Messaging (customer ↔ staff)
  /** The signed-in customer's conversation with the rental team. */
  listMessages(): Promise<BookingMessage[]>;
  sendMessage(body: string, bookingId?: string | null): Promise<BookingMessage>;
  onMessages(cb: () => void): Unsubscribe;

  // Customer screening (KYC)
  getMyVerification(): Promise<CustomerVerification>;
  /** Stores a document privately and returns a reference to save on the verification. */
  uploadVerificationDoc(file: Blob, kind: string): Promise<string>;
  submitVerification(v: CustomerVerification): Promise<CustomerVerification>;
  /** Short-lived URL for viewing a private document (customer: own; staff: any). */
  verificationDocUrl(ref: string): Promise<string>;

  // Security deposit
  startDeposit(bookingId: string, returnUrl: string): Promise<{ redirectUrl: string | null; booking: Booking | null }>;

  // Reviews
  listReviews(carId: string): Promise<Review[]>;
  submitReview(bookingId: string, rating: number, comment: string): Promise<Review>;

  // Push notifications (Web Push subscription for this device)
  savePushSubscription(subscription: PushSubscriptionJSON): Promise<void>;

  // Staff
  admin: {
    listBookings(): Promise<Booking[]>;
    setBookingStatus(id: string, status: ManagementStatus): Promise<Booking>;
    markPaid(id: string): Promise<Booking>;
    listCars(): Promise<Car[]>;
    setCarAvailability(carId: string, available: boolean): Promise<void>;
    listBlocks(): Promise<CarBlock[]>;
    addBlock(block: Omit<CarBlock, 'id'>): Promise<CarBlock>;
    removeBlock(id: string): Promise<void>;
    listCustomers(): Promise<Customer[]>;
    updateCustomer(id: string, patch: Partial<Pick<Customer, 'notes' | 'licenseVerified' | 'blocked'>>): Promise<Customer>;
    listOutbox(): Promise<OutboxMessage[]>;
    listAllMessages(): Promise<BookingMessage[]>;
    replyMessage(customerId: string, body: string, bookingId?: string | null): Promise<BookingMessage>;
    /** Create (no id) or update a vehicle listing. */
    saveCar(car: CarInput): Promise<Car>;
    /** Uploads a photo and returns the URL/path to store on the car. */
    uploadCarImage(file: Blob): Promise<string>;
    listReviews(): Promise<Review[]>;
    setReviewHidden(id: string, hidden: boolean): Promise<void>;
    replyToReview(id: string, reply: string): Promise<void>;
    setFollowUp(id: string, status: 'open' | 'resolved', note?: string): Promise<void>;
    listVerifications(): Promise<Array<CustomerVerification & { customerName: string; customerEmail: string }>>;
    reviewVerification(customerId: string, checks: Record<CheckId, { status: Exclude<CheckStatus, 'missing'>; reason?: string }>, note: string): Promise<CustomerVerification>;
    /** Release the deposit, keeping `captured` naira (0 = full refund) for the stated reason. */
    settleDeposit(bookingId: string, captured: number, note: string): Promise<Booking>;
    onChange(cb: () => void): Unsubscribe;
  };
}

export const isOpenStatus = (s: ManagementStatus) => s === 'pending' || s === 'confirmed' || s === 'active';

export const managementStatusOf = (b: Booking): ManagementStatus =>
  b.managementStatus ?? (b.status === 'upcoming' ? 'confirmed' : b.status);
