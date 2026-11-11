import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, CreditCard, ShieldCheck, 
  Lock, CheckCircle2, Tag, Loader2, Sparkles 
} from 'lucide-react';
import { Car, ExtraService, DriverInfo, Booking } from '../../types/car';

interface PaymentScreenProps {
  bookingDraft: {
    car: Car;
    pickupDate: string;
    returnDate: string;
    pickupTime: string;
    returnTime: string;
    pickupLocation: string;
    returnLocation: string;
    totalDays: number;
    basePrice: number;
    extraServices: ExtraService[];
    taxAmount: number;
    totalAmount: number;
    driverInfo: DriverInfo;
  };
  onBack: () => void;
  onPaymentSuccess: (newBooking: Booking) => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  bookingDraft,
  onBack,
  onPaymentSuccess
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'applepay' | 'googlepay' | 'paypal'>('card');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 8821');
  const [cardHolder, setCardHolder] = useState(bookingDraft.driverInfo.fullName || 'Alex Harrison');
  const [expiry, setExpiry] = useState('08/28');
  const [cvv, setCvv] = useState('742');
  
  // Promo code
  const [promoCode, setPromoCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Payment processing state
  const [isProcessing, setIsProcessing] = useState(false);

  const finalTotal = Math.max(0, bookingDraft.totalAmount - discountAmount);

  const handleApplyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (code === 'DRIVE20') {
      const discount = Math.round(bookingDraft.totalAmount * 0.2);
      setDiscountAmount(discount);
      setPromoApplied(true);
      setPromoError(null);
    } else if (code === 'VIP10') {
      setDiscountAmount(50);
      setPromoApplied(true);
      setPromoError(null);
    } else {
      setPromoError('Invalid coupon. Try "DRIVE20" for 20% off!');
    }
  };

  const handleConfirmPayment = () => {
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);

      const referenceId = `BK-${Math.floor(10000 + Math.random() * 90000)}`;
      const digitalPassCode = `PASS-${bookingDraft.car.brand.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newBooking: Booking = {
        id: referenceId,
        carId: bookingDraft.car.id,
        car: bookingDraft.car,
        pickupDate: bookingDraft.pickupDate,
        returnDate: bookingDraft.returnDate,
        pickupTime: bookingDraft.pickupTime,
        returnTime: bookingDraft.returnTime,
        pickupLocation: bookingDraft.pickupLocation,
        returnLocation: bookingDraft.returnLocation,
        totalDays: bookingDraft.totalDays,
        basePrice: bookingDraft.basePrice,
        extraServices: bookingDraft.extraServices,
        discount: discountAmount,
        taxAmount: bookingDraft.taxAmount,
        totalAmount: finalTotal,
        status: 'upcoming',
        driverInfo: bookingDraft.driverInfo,
        paymentMethod:
          selectedMethod === 'card'
            ? `Visa •••• ${cardNumber.slice(-4) || '8821'}`
            : selectedMethod === 'applepay'
            ? 'Apple Pay'
            : selectedMethod === 'googlepay'
            ? 'Google Pay'
            : 'PayPal',
        createdAt: new Date().toISOString(),
        digitalPassCode
      };

      onPaymentSuccess(newBooking);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-32">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 px-5 py-3.5 bg-[#F9F9F9]/90 backdrop-blur-md flex items-center justify-between border-b border-slate-100">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#080808] hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-bold text-[#D61B04] uppercase tracking-wider block">
            Step 2 of 3
          </span>
          <h2 className="text-sm font-extrabold text-[#080808]">Secure Payment</h2>
        </div>
        <div className="w-10" />
      </div>

      {/* Booking Summary Card */}
      <div className="px-5 pt-4 mb-5">
        <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-16 h-12 rounded-xl bg-[#F9F9F9] p-1.5 flex items-center justify-center flex-shrink-0">
              <img
                src={bookingDraft.car.imageUrl}
                alt={bookingDraft.car.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#080808] leading-tight">
                {bookingDraft.car.name}
              </h4>
              <p className="text-[11px] text-[#B1B1B2]">
                {bookingDraft.totalDays} Days · {bookingDraft.pickupDate}
              </p>
            </div>
          </div>
          <span className="text-sm font-black text-[#080808]">${finalTotal}</span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Select Payment Method
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { id: 'card', label: 'Credit Card', sub: 'Visa, MC, Amex' },
            { id: 'applepay', label: 'Apple Pay', sub: 'Fast & Secure' },
            { id: 'googlepay', label: 'Google Pay', sub: 'One-touch checkout' },
            { id: 'paypal', label: 'PayPal', sub: 'Instant transfer' },
          ].map((m) => {
            const isSelected = selectedMethod === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMethod(m.id as any)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? 'bg-[#080808] text-white border-[#080808] shadow-sm'
                    : 'bg-white text-[#080808] border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{m.label}</span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-[#D61B04] bg-[#D61B04]' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <span className={`text-[10px] ${isSelected ? 'text-white/60' : 'text-[#B1B1B2]'}`}>
                  {m.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Credit Card Preview & Form */}
      {selectedMethod === 'card' && (
        <div className="px-5 mb-5">
          {/* Virtual embossed card */}
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-tr from-[#080808] via-[#1A1A1E] to-[#2B2B30] text-white p-5 shadow-xl mb-4 border border-white/10">
            <div className="flex justify-between items-start mb-6">
              <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#D61B04]">
                APEX PLATINUM
              </span>
              <span className="text-xs font-bold tracking-wider text-white/80">VISA</span>
            </div>

            <div className="my-4 font-mono text-base tracking-widest text-white/95">
              {cardNumber || '•••• •••• •••• ••••'}
            </div>

            <div className="flex justify-between items-end text-xs">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/50 block">
                  Card Holder
                </span>
                <span className="font-bold tracking-wide uppercase text-white truncate max-w-[170px] block">
                  {cardHolder || 'CARDHOLDER NAME'}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/50 block text-right">
                  Expires
                </span>
                <span className="font-mono font-bold text-white/90">{expiry || 'MM/YY'}</span>
              </div>
            </div>
          </div>

          {/* Card Input fields */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3.5">
            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Cardholder Name
              </label>
              <input
                type="text"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                placeholder="Alex Harrison"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Card Number
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none font-mono"
                placeholder="4242 •••• •••• 8821"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                  Expiry Date
                </label>
                <input
                  type="text"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none font-mono"
                  placeholder="MM/YY"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                  CVV / CVC
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none font-mono"
                  placeholder="•••"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Promo Code Box */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Promo Code or Voucher
        </h3>
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
              <input
                type="text"
                placeholder='Enter promo code (e.g. "DRIVE20")'
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                disabled={promoApplied}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] uppercase placeholder:normal-case focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
              />
            </div>
            <button
              onClick={handleApplyPromo}
              disabled={promoApplied || !promoCode}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                promoApplied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#080808] text-white hover:bg-[#D61B04]'
              }`}
            >
              {promoApplied ? 'Applied ✓' : 'Apply'}
            </button>
          </div>

          {promoApplied && (
            <div className="mt-2 text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Promo applied! Saved ${discountAmount} on this rental.</span>
            </div>
          )}

          {promoError && (
            <div className="mt-2 text-xs font-semibold text-[#D61B04]">
              {promoError}
            </div>
          )}
        </div>
      </div>

      {/* Security Guarantee Badge */}
      <div className="px-5 mb-6">
        <div className="p-3.5 rounded-2xl bg-[#F4F4F6] flex items-center justify-center gap-2 text-xs font-semibold text-[#4D5056]">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>256-Bit Bank Level Encryption · PCI DSS Compliant</span>
        </div>
      </div>

      {/* Sticky Bottom Pay CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 p-4 px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-[#B1B1B2] block uppercase font-bold">Total to Pay</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#080808]">${finalTotal}</span>
              {discountAmount > 0 && (
                <span className="text-xs text-[#B1B1B2] line-through font-semibold">
                  ${bookingDraft.totalAmount}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirmPayment}
            disabled={isProcessing}
            className="flex-1 max-w-[240px] py-4 rounded-2xl bg-[#D61B04] hover:bg-[#B01402] text-white text-sm font-extrabold shadow-lg shadow-[#D61B04]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authorizing...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Confirm & Pay ${finalTotal}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
