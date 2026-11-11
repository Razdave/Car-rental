import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Heart, Share2, Star, ShieldCheck, 
  Gauge, Zap, Check, MapPin, MessageSquare, 
  Info, Clock, Award, CheckCircle2 
} from 'lucide-react';
import { Car } from '../../types/car';
import { formatNaira } from '../../utils/currency';

interface CarDetailsScreenProps {
  car: Car;
  isFavorite: boolean;
  onToggleFavorite: (carId: string) => void;
  onBack: () => void;
  onStartBooking: (car: Car) => void;
}

export const CarDetailsScreen: React.FC<CarDetailsScreenProps> = ({
  car,
  isFavorite,
  onToggleFavorite,
  onBack,
  onStartBooking
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageSent, setMessageSent] = useState(false);

  const images = car.galleryImages?.length > 0 ? car.galleryImages : [car.imageUrl];

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${car.name} - Aurevon Services Rental`,
        text: `Check out this ${car.name} available for rent from Aurevon Services!`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setMessageSent(true);
    setTimeout(() => {
      setMessageSent(false);
      setShowMessageModal(false);
      setMessageText('');
    }, 1800);
  };

  return (
    <div className="relative min-h-screen bg-[#F9F9F9] pb-32">
      {/* Toast Alert */}
      {showShareToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#080808] text-white px-4 py-2 rounded-full text-xs font-semibold shadow-xl flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Link copied to clipboard!</span>
        </div>
      )}

      {/* Top Floating App Bar */}
      <div className="sticky top-0 z-30 px-5 py-3.5 bg-[#F9F9F9]/90 backdrop-blur-md flex items-center justify-between border-b border-slate-100">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-[#080808] hover:bg-slate-50 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-xs font-extrabold uppercase tracking-wider text-[#4D5056]">
          {car.brand}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            aria-label="Share vehicle"
            className="w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-[#4D5056] hover:text-[#080808] active:scale-95 transition-all"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onToggleFavorite(car.id)}
            aria-label="Save to favorites"
            className="w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-[#4D5056] hover:text-[#D61B04] active:scale-95 transition-all"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isFavorite ? 'fill-[#D61B04] text-[#D61B04]' : 'text-slate-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Image Showcase */}
      <div className="px-5 pt-3">
        <div className="relative rounded-[32px] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          {/* Main Photo Viewport */}
          <div className="relative h-56 sm:h-64 flex items-center justify-center overflow-hidden">
            <motion.img
              key={selectedImageIndex}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              src={images[selectedImageIndex]}
              alt={car.name}
              className="max-h-full max-w-full object-contain filter drop-shadow-md"
            />
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="flex items-center justify-center gap-2.5 mt-4 pt-3 border-t border-slate-100">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-14 h-10 rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-[#F9F9F9] ${
                    selectedImageIndex === idx
                      ? 'border-[#D61B04] shadow-sm scale-105'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Car Title, Rating & Price Header */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-[#D61B04] uppercase tracking-wider">
                {car.category} Series
              </span>
              <span className="text-[#B1B1B2]">·</span>
              <span className="text-xs text-[#4D5056] font-semibold">{car.year}</span>
            </div>
            <h1 className="text-2xl font-black text-[#080808] tracking-tight">{car.name}</h1>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/50">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{car.rating}</span>
              <span className="text-amber-600/70 font-normal">({car.reviewCount})</span>
            </div>
            <p className="text-[11px] text-[#B1B1B2] mt-1">{car.mileageLimit}</p>
          </div>
        </div>
      </div>

      {/* Key Specifications Grid */}
      <div className="px-5 my-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Vehicle Performance Specs
        </h3>
        <div className="grid grid-cols-4 gap-2.5">
          <div className="bg-white p-3 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">Power</span>
            <span className="text-sm font-extrabold text-[#080808] mt-1 block">{car.powerHp} HP</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">0-100 km/h</span>
            <span className="text-sm font-extrabold text-[#080808] mt-1 block">{car.acceleration0to100}s</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">Top Speed</span>
            <span className="text-sm font-extrabold text-[#080808] mt-1 block">{car.topSpeedKmH} km/h</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">Gearbox</span>
            <span className="text-sm font-extrabold text-[#080808] mt-1 block">
              {car.transmission === 'Automatic' ? 'Auto' : 'Manual'}
            </span>
          </div>
        </div>
      </div>

      {/* Overview Description */}
      <div className="px-5 mb-5">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-2">
            Overview
          </h3>
          <p className="text-xs leading-relaxed text-[#4D5056] font-normal">
            {car.description}
          </p>
        </div>
      </div>

      {/* Features & Amenities */}
      <div className="px-5 mb-5">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
            Features & Amenities
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {car.features.map((feat, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-medium text-[#080808]">
                <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-[#D61B04]">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span className="truncate">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Host / Fleet Provider Info */}
      <div className="px-5 mb-5">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#080808] text-white flex items-center justify-center font-bold text-base shadow-sm">
              AD
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-[#080808]">{car.hostName}</h4>
                <ShieldCheck className="w-3.5 h-3.5 text-[#D61B04]" />
              </div>
              <p className="text-[11px] text-[#4D5056]">Verified Luxury Fleet Concierge</p>
              <div className="flex items-center gap-2 text-[10px] text-[#B1B1B2] mt-0.5">
                <span>★ {car.hostRating} Rating</span>
                <span>·</span>
                <span>Response time &lt; 5 mins</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowMessageModal(true)}
            className="p-2.5 rounded-xl bg-[#F9F9F9] hover:bg-slate-100 text-[#080808] text-xs font-bold flex items-center gap-1 transition-colors border border-slate-200/80"
          >
            <MessageSquare className="w-4 h-4 text-[#D61B04]" />
            <span>Message</span>
          </button>
        </div>
      </div>

      {/* Cancellation & Protection Policy */}
      <div className="px-5 mb-6">
        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 flex items-start gap-3">
          <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h5 className="text-xs font-bold text-emerald-900">Free Cancellation & Protection</h5>
            <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
              Cancel up to 24 hours prior to pickup for a 100% full refund. Includes 24/7 VIP roadside assistance.
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Booking Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 p-4 px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] text-[#B1B1B2] block uppercase tracking-wider font-semibold">
              Daily Price
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-[#080808]">{formatNaira(car.pricePerDay)}</span>
              <span className="text-xs text-[#B1B1B2]">/day</span>
            </div>
          </div>

          <button
            onClick={() => onStartBooking(car)}
            className="flex-1 max-w-[220px] py-4 rounded-2xl bg-[#D61B04] hover:bg-[#B01402] text-white text-sm font-extrabold shadow-lg shadow-[#D61B04]/30 active:scale-[0.98] transition-all text-center"
          >
            Book Now
          </button>
        </div>
      </div>

      {/* Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#080808] mb-1">Message {car.hostName}</h3>
            <p className="text-xs text-[#B1B1B2] mb-4">Inquire about car delivery, special requests or booking</p>

            {messageSent ? (
              <div className="py-6 text-center text-emerald-600 font-bold text-sm">
                Message sent to concierge! You will receive a response shortly.
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="space-y-4">
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="e.g. Can you deliver this Audi R8 directly to Beverly Hills Hotel?"
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-[#D61B04] focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMessageModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-[#4D5056]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[#080808] text-xs font-bold text-white hover:bg-[#D61B04] transition-colors"
                  >
                    Send Message
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
