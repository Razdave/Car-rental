import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  KeyRound, MapPin, Calendar, Clock, 
  ChevronRight, AlertCircle, X, Check, 
  ArrowRight, ShieldCheck, Car as CarIcon, Sparkles 
} from 'lucide-react';
import { Booking, Car } from '../../types/car';
import { formatNaira } from '../../utils/currency';
import { DigitalKeyModal } from '../modals/DigitalKeyModal';

interface MyBookingsScreenProps {
  bookings: Booking[];
  onSelectCar: (car: Car) => void;
  onExplore: () => void;
  onCancelBooking: (bookingId: string) => void;
  onExtendBooking: (bookingId: string, additionalDays: number) => void;
}

export const MyBookingsScreen: React.FC<MyBookingsScreenProps> = ({
  bookings,
  onSelectCar,
  onExplore,
  onCancelBooking,
  onExtendBooking
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'completed' | 'cancelled'>('active');
  const [selectedDigitalKeyBooking, setSelectedDigitalKeyBooking] = useState<Booking | null>(null);

  // Cancel dialog
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);

  // Extend dialog
  const [bookingToExtend, setBookingToExtend] = useState<Booking | null>(null);
  const [extendDays, setExtendDays] = useState(1);

  const filteredBookings = bookings.filter((b) => b.status === activeTab);

  const getStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-extrabold flex items-center gap-1 border border-emerald-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ACTIVE NOW
          </span>
        );
      case 'upcoming':
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-extrabold border border-blue-200/50">
            CONFIRMED
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#4D5056] text-[10px] font-bold">
            COMPLETED
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-[#D61B04] text-[10px] font-bold">
            CANCELLED
          </span>
        );
    }
  };

  const handleConfirmCancel = () => {
    if (bookingToCancel) {
      onCancelBooking(bookingToCancel.id);
      setBookingToCancel(null);
    }
  };

  const handleConfirmExtend = () => {
    if (bookingToExtend) {
      onExtendBooking(bookingToExtend.id, extendDays);
      setBookingToExtend(null);
    }
  };

  return (
    <div className="pb-28 pt-2">
      {/* Title */}
      <div className="px-5 pt-3 pb-3">
        <h2 className="text-xl font-extrabold text-[#080808] tracking-tight">My Bookings</h2>
        <p className="text-xs text-[#B1B1B2]">Manage your reservations and digital keys</p>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-5">
        <div className="flex bg-[#F4F4F6] p-1 rounded-2xl">
          {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tab) => {
            const count = bookings.filter((b) => b.status === tab).length;
            const isCurrent = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl capitalize transition-all ${
                  isCurrent
                    ? 'bg-white text-[#080808] shadow-xs'
                    : 'text-[#4D5056] hover:text-[#080808]'
                }`}
              >
                {tab} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings List */}
      <div className="px-5 space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl p-6 border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <CarIcon className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#080808] capitalize">
              No {activeTab} bookings
            </h3>
            <p className="text-xs text-[#B1B1B2] mt-1 max-w-xs mx-auto">
              You don't have any {activeTab} reservations at the moment.
            </p>
            <button
              onClick={onExplore}
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold hover:bg-[#D61B04] transition-colors"
            >
              Explore Available Fleet
            </button>
          </div>
        ) : (
          filteredBookings.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[28px] p-5 shadow-xs border border-slate-100/90"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-mono text-xs font-bold text-[#B1B1B2]">{b.id}</span>
                {getStatusBadge(b.status)}
              </div>

              {/* Car Info */}
              <div className="flex items-center gap-4 my-4">
                <div className="w-24 h-16 rounded-2xl bg-[#F9F9F9] p-2 flex items-center justify-center flex-shrink-0">
                  <img
                    src={b.car.imageUrl}
                    alt={b.car.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">
                    {b.car.brand}
                  </span>
                  <h4 className="text-sm font-bold text-[#080808] truncate">{b.car.name}</h4>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#D61B04] mt-0.5">
                    <span>{formatNaira(b.totalAmount)}</span>
                    <span className="text-[11px] text-[#B1B1B2] font-normal">
                      · {b.durationValue ?? b.totalDays} {((b.durationUnit ?? 'day') === 'hour'
                        ? (b.durationValue ?? b.totalDays) === 1 ? 'hour' : 'hours'
                        : (b.durationValue ?? b.totalDays) === 1 ? 'day' : 'days')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Date & Location Rows */}
              <div className="p-3 rounded-2xl bg-[#F9F9F9] space-y-2 text-xs mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#4D5056]">
                    <Calendar className="w-3.5 h-3.5 text-[#B1B1B2]" />
                    <span className="font-semibold">{b.pickupDate} → {b.returnDate}</span>
                  </div>
                  <span className="text-[11px] text-[#B1B1B2]">{b.pickupTime}</span>
                </div>
                <div className="flex items-center gap-2 text-[#4D5056] text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-[#D61B04] flex-shrink-0" />
                  <span className="truncate">{b.pickupLocation}</span>
                </div>
              </div>

              {/* Action Buttons based on status */}
              {b.status === 'active' && (
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedDigitalKeyBooking(b)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#080808] to-[#25262B] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.99] transition-all"
                  >
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>Open Smart Digital Key</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => setBookingToExtend(b)}
                      className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#080808] transition-colors"
                    >
                      Extend Trip
                    </button>
                    <button
                      onClick={() => onSelectCar(b.car)}
                      className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-[#4D5056] hover:bg-slate-50 transition-colors"
                    >
                      Car Specs
                    </button>
                  </div>
                </div>
              )}

              {b.status === 'upcoming' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBookingToCancel(b)}
                    className="py-2.5 rounded-xl border border-red-200 text-xs font-bold text-[#D61B04] hover:bg-red-50 transition-colors"
                  >
                    Cancel Booking
                  </button>
                  <button
                    onClick={() => setSelectedDigitalKeyBooking(b)}
                    className="py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold hover:bg-[#D61B04] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Key</span>
                  </button>
                </div>
              )}

              {b.status === 'completed' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onSelectCar(b.car)}
                    className="flex-1 py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold hover:bg-[#D61B04] transition-colors"
                  >
                    Rent Again
                  </button>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Digital Key Modal */}
      {selectedDigitalKeyBooking && (
        <DigitalKeyModal
          booking={selectedDigitalKeyBooking}
          isOpen={!!selectedDigitalKeyBooking}
          onClose={() => setSelectedDigitalKeyBooking(null)}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      {bookingToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-50 text-[#D61B04] flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#080808]">Cancel Reservation?</h3>
            <p className="text-xs text-[#4D5056] mt-1 mb-4 leading-relaxed">
              Are you sure you want to cancel your booking for <span className="font-bold text-[#080808]">{bookingToCancel.car.name}</span>? You will receive a 100% full refund of {formatNaira(bookingToCancel.totalAmount)} to your original payment method.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setBookingToCancel(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-[#4D5056]"
              >
                Keep Booking
              </button>
              <button
                onClick={handleConfirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-[#D61B04] text-xs font-bold text-white hover:bg-[#B01402] transition-colors"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Booking Dialog */}
      {bookingToExtend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#080808]">Extend Your Rental</h3>
            <p className="text-xs text-[#B1B1B2] mt-0.5 mb-4">
              Add extra days to your {bookingToExtend.car.name} reservation
            </p>

            <div className="p-4 rounded-2xl bg-[#F9F9F9] mb-4 text-center">
              <div className="flex items-center justify-center gap-4 mb-2">
                <button
                  onClick={() => setExtendDays(Math.max(1, extendDays - 1))}
                  className="w-9 h-9 rounded-full bg-white shadow-xs font-bold text-sm"
                >
                  -
                </button>
                <span className="text-lg font-black text-[#080808]">
                  +{extendDays} {extendDays === 1 ? 'Day' : 'Days'}
                </span>
                <button
                  onClick={() => setExtendDays(extendDays + 1)}
                  className="w-9 h-9 rounded-full bg-white shadow-xs font-bold text-sm"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-[#4D5056] font-semibold">
                Additional cost: <span className="text-[#D61B04] font-bold">+{formatNaira(bookingToExtend.car.pricePerDay * extendDays)}</span>
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setBookingToExtend(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-[#4D5056]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExtend}
                className="flex-1 py-2.5 rounded-xl bg-[#080808] text-xs font-bold text-white hover:bg-[#D61B04] transition-colors"
              >
                Confirm Extension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
