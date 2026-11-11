import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, QrCode, Calendar, MapPin, 
  Download, ArrowRight, ShieldCheck, Sparkles, Check 
} from 'lucide-react';
import { Booking } from '../../types/car';
import { formatNaira } from '../../utils/currency';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isManagementStatus = (value: unknown): value is NonNullable<Booking['managementStatus']> =>
  value === 'pending' ||
  value === 'confirmed' ||
  value === 'active' ||
  value === 'completed' ||
  value === 'cancelled';

interface ConfirmationScreenProps {
  booking: Booking;
  onGoToBookings: () => void;
  onGoHome: () => void;
}

export const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({
  booking,
  onGoToBookings,
  onGoHome
}) => {
  const [downloaded, setDownloaded] = useState(false);
  const [managementStatus, setManagementStatus] = useState(booking.managementStatus);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking.managementStatus) return;
    let active = true;
    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/status`, {
          headers: { 'X-Booking-Email': booking.driverInfo.email }
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = isRecord(result) && typeof result.error === 'string'
            ? result.error
            : 'Could not refresh the booking status.';
          throw new Error(message);
        }
        if (
          !isRecord(result) ||
          !isManagementStatus(result.managementStatus)
        ) {
          throw new Error('Booking status response is invalid.');
        }
        if (active) {
          setManagementStatus(result.managementStatus);
          setStatusError(null);
        }
      } catch (error) {
        console.error('Unable to refresh booking status.', error);
        if (active) setStatusError('Booking status could not be refreshed. Please check again later.');
      }
    };

    void refreshStatus();
    const intervalId = window.setInterval(refreshStatus, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [booking.driverInfo.email, booking.id, booking.managementStatus]);

  const handleDownloadPass = () => {
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-24 pt-6 px-5">
      {/* Animated Success Badge */}
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#D61B04] to-[#FF4528] text-white mx-auto flex items-center justify-center shadow-xl shadow-[#D61B04]/30 mb-4"
        >
          <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
        </motion.div>

        <h1 className="text-2xl font-black text-[#080808] tracking-tight">
          {managementStatus === 'pending'
            ? 'Booking Received'
            : managementStatus === 'cancelled'
            ? 'Booking Cancelled'
            : managementStatus === 'active'
            ? 'Rental In Progress'
            : managementStatus === 'completed'
            ? 'Rental Completed'
            : 'Booking Confirmed!'}
        </h1>
        <p className="text-xs text-[#4D5056] mt-1">
          {managementStatus === 'pending'
            ? 'Your reservation is awaiting staff confirmation.'
            : managementStatus === 'cancelled'
            ? 'This reservation was cancelled by the rental team.'
            : 'Your reservation has been confirmed.'}
        </p>
        {statusError && <p role="status" className="text-[11px] text-amber-700 mt-2">{statusError}</p>}
        <div className="inline-block mt-2 px-3 py-1 rounded-full bg-slate-200/60 font-mono text-xs font-bold text-[#080808]">
          Reference: {booking.id}
        </div>
      </div>

      {/* Digital Pass / Ticket Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-[32px] overflow-hidden shadow-lg border border-slate-100 mb-6"
      >
        {/* Car header */}
        <div className="p-5 bg-gradient-to-r from-[#080808] to-[#1F2024] text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#D61B04]">
              {booking.car.brand} {managementStatus === 'pending' ? 'BOOKING REQUEST' : 'VIP RENTAL PASS'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              managementStatus === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : managementStatus === 'cancelled'
                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}>
              {managementStatus === 'pending' ? 'PENDING REVIEW' : (managementStatus ?? 'confirmed').toUpperCase()}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold leading-tight">{booking.car.name}</h3>
              <p className="text-xs text-white/60 mt-0.5">{booking.car.transmission} · {booking.car.powerHp} HP</p>
            </div>
            <div className="w-20 h-14 bg-white/10 rounded-xl p-1 flex items-center justify-center flex-shrink-0">
              <img src={booking.car.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        </div>

        {/* Pass Details */}
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Pick-up Date</span>
              <span className="font-extrabold text-[#080808] text-sm block mt-0.5">
                {booking.pickupDate}
              </span>
              <span className="text-[11px] text-[#4D5056]">{booking.pickupTime}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Return Date</span>
              <span className="font-extrabold text-[#080808] text-sm block mt-0.5">
                {booking.returnDate}
              </span>
              <span className="text-[11px] text-[#4D5056]">{booking.returnTime}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Concierge Pickup Hub</span>
            <span className="font-bold text-[#080808] block mt-0.5">{booking.pickupLocation}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Primary Driver</span>
              <span className="font-bold text-[#080808] block">{booking.driverInfo.fullName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Booking Total</span>
              <span className="font-extrabold text-sm text-[#D61B04] block">{formatNaira(booking.totalAmount)}</span>
            </div>
          </div>

          {/* QR Code section */}
          {managementStatus === 'pending' || managementStatus === 'cancelled' ? (
            <p className="pt-4 border-t border-dashed border-slate-200 text-center text-[10px] text-[#B1B1B2]">
              {managementStatus === 'pending'
                ? 'A digital pass will be available after staff confirms your reservation.'
                : 'A digital pass is unavailable for a cancelled reservation.'}
            </p>
          ) : (
            <div className="pt-4 border-t border-dashed border-slate-200 text-center flex flex-col items-center">
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs mb-2">
                <QrCode className="w-24 h-24 text-[#080808]" />
              </div>
              <span className="font-mono text-xs font-bold text-[#080808]">{booking.digitalPassCode}</span>
              <p className="text-[10px] text-[#B1B1B2] mt-0.5">
                Scan at vehicle door scanner or show to concierge for contactless access
              </p>
            </div>
          )}
        </div>

        {/* Download Ticket Button */}
        {managementStatus !== 'pending' && managementStatus !== 'cancelled' && (
          <div className="p-4 bg-[#F9F9F9] border-t border-slate-100">
            <button
              onClick={handleDownloadPass}
              className="w-full py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-[#080808] flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              {downloaded ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Digital Pass Saved to Apple Wallet</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#D61B04]" />
                  <span>Save Pass / Add to Wallet</span>
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>

      {/* Navigation CTAs */}
      <div className="space-y-3">
        <button
          onClick={onGoToBookings}
          className="w-full py-4 rounded-2xl bg-[#D61B04] hover:bg-[#B01402] text-white text-sm font-extrabold shadow-lg shadow-[#D61B04]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <span>View in My Bookings</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onGoHome}
          className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-[#080808] transition-colors"
        >
          Back to Fleet & Home
        </button>
      </div>
    </div>
  );
};
