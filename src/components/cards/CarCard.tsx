import React from 'react';
import { motion } from 'motion/react';
import { Heart, ArrowRight, Gauge, Zap, Users, Shield } from 'lucide-react';
import { Car } from '../../types/car';

interface CarCardProps {
  car: Car;
  isFavorite: boolean;
  onToggleFavorite: (carId: string) => void;
  onSelect: (car: Car) => void;
  layout?: 'compact' | 'standard' | 'horizontal';
}

export const CarCard: React.FC<CarCardProps> = ({
  car,
  isFavorite,
  onToggleFavorite,
  onSelect,
  layout = 'standard'
}) => {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(car.id);
  };

  if (layout === 'horizontal') {
    return (
      <motion.div
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => onSelect(car)}
        className="cursor-pointer bg-white rounded-3xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all flex gap-4 items-center"
      >
        <div className="relative w-32 h-24 rounded-2xl bg-[#F9F9F9] overflow-hidden flex-shrink-0 flex items-center justify-center p-2">
          <img
            src={car.imageUrl}
            alt={car.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#B1B1B2] uppercase tracking-wider">
              {car.brand}
            </span>
            <button
              onClick={handleFavoriteClick}
              className="p-1.5 text-slate-400 hover:text-[#D61B04] transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${isFavorite ? 'fill-[#D61B04] text-[#D61B04]' : ''}`}
              />
            </button>
          </div>
          <h4 className="text-sm font-bold text-[#080808] truncate">{car.name}</h4>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-[#4D5056]">
            <span>{car.transmission}</span>
            <span>·</span>
            <span>{car.powerHp} HP</span>
            <span>·</span>
            <span>{car.seats} Seats</span>
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold text-[#080808]">${car.pricePerDay}</span>
              <span className="text-[11px] text-[#B1B1B2]">/day</span>
            </div>
            <span className="text-xs font-bold text-[#D61B04] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
              View <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(car)}
      className="group cursor-pointer bg-white rounded-[28px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100/80 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition-all flex flex-col justify-between"
    >
      {/* Card Header: Brand, Title, Favorite Heart */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#B1B1B2] uppercase tracking-wider block">
              {car.brand}
            </span>
            <h3 className="text-base font-bold text-[#080808] tracking-tight mt-0.5 line-clamp-1">
              {car.name}
            </h3>
          </div>
          <button
            onClick={handleFavoriteClick}
            aria-label="Save to favorites"
            className="w-9 h-9 rounded-full bg-[#F9F9F9] flex items-center justify-center text-slate-400 hover:text-[#D61B04] hover:bg-red-50 transition-colors"
          >
            <motion.div whileTap={{ scale: 1.3 }}>
              <Heart
                className={`w-4 h-4 transition-colors ${
                  isFavorite ? 'fill-[#D61B04] text-[#D61B04]' : 'text-slate-400'
                }`}
              />
            </motion.div>
          </button>
        </div>

        {/* Category tag */}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-[#4D5056] font-medium">{car.category}</span>
          <span className="text-[#B1B1B2]">·</span>
          <span className="text-xs text-amber-500 font-bold flex items-center gap-1">
            ★ {car.rating}
          </span>
        </div>
      </div>

      {/* Vehicle Studio Image */}
      <div className="relative my-4 h-36 sm:h-40 rounded-2xl bg-gradient-to-b from-[#F9F9F9]/80 to-[#F4F4F6]/50 flex items-center justify-center p-3 overflow-hidden">
        <motion.img
          src={car.imageUrl}
          alt={car.name}
          className="max-h-full max-w-full object-contain filter drop-shadow-sm group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
        />
      </div>

      {/* Quick Specs Strip */}
      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-2xl bg-[#F9F9F9] mb-4 text-center">
        <div>
          <span className="text-[10px] text-[#B1B1B2] block uppercase tracking-wider">Power</span>
          <span className="text-xs font-bold text-[#080808]">{car.powerHp} HP</span>
        </div>
        <div className="border-x border-slate-200/60">
          <span className="text-[10px] text-[#B1B1B2] block uppercase tracking-wider">0-100</span>
          <span className="text-xs font-bold text-[#080808]">{car.acceleration0to100}s</span>
        </div>
        <div>
          <span className="text-[10px] text-[#B1B1B2] block uppercase tracking-wider">Type</span>
          <span className="text-xs font-bold text-[#080808]">{car.transmission === 'Automatic' ? 'Auto' : 'Manual'}</span>
        </div>
      </div>

      {/* Price & Book CTA */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="text-[11px] text-[#B1B1B2] block">Price</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-[#080808]">${car.pricePerDay}</span>
            <span className="text-xs text-[#B1B1B2] font-normal">/day</span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(car);
          }}
          className="h-10 px-4 rounded-xl bg-[#080808] hover:bg-[#D61B04] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <span>Rent Now</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
