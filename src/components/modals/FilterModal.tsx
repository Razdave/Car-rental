import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, Check } from 'lucide-react';
import { CarCategory, FilterOptions } from '../../types/car';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onReset: () => void;
  carCount: number;
}

const CATEGORIES: CarCategory[] = ['All', 'Sports', 'SUV', 'Electric', 'Luxury'];

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onReset,
  carCount
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 120 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 120 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <h3 className="text-lg font-bold text-[#080808]">Filter Vehicles</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={onReset}
                className="text-xs font-semibold text-[#4D5056] hover:text-[#D61B04] flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[#4D5056] hover:text-[#080808] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Body */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Category */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4D5056] block mb-3">
                Vehicle Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const isSelected = filters.category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => onFilterChange({ ...filters, category: cat })}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-[#080808] text-white shadow-md'
                          : 'bg-[#F4F4F6] text-[#4D5056] hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Range */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#4D5056]">
                  Daily Rate (Max)
                </label>
                <span className="text-sm font-bold text-[#D61B04]">
                  ${filters.maxPrice} <span className="text-xs font-normal text-[#B1B1B2]">/day</span>
                </span>
              </div>
              <input
                type="range"
                min="150"
                max="400"
                step="10"
                value={filters.maxPrice}
                onChange={(e) =>
                  onFilterChange({ ...filters, maxPrice: Number(e.target.value) })
                }
                className="w-full accent-[#D61B04] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-[#B1B1B2] mt-1 font-mono">
                <span>$150/day</span>
                <span>$400/day</span>
              </div>
            </div>

            {/* Transmission */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4D5056] block mb-3">
                Transmission
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['all', 'Automatic', 'Manual'] as const).map((trans) => {
                  const isSelected = filters.transmission === trans;
                  return (
                    <button
                      key={trans}
                      onClick={() => onFilterChange({ ...filters, transmission: trans })}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold text-center transition-all ${
                        isSelected
                          ? 'bg-[#080808] text-white'
                          : 'bg-[#F4F4F6] text-[#4D5056] hover:bg-slate-200'
                      }`}
                    >
                      {trans === 'all' ? 'All Types' : trans}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seating Capacity */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4D5056] block mb-3">
                Seating Capacity
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([ 'all', 2, 4, 5 ] as const).map((seat) => {
                  const isSelected = filters.seats === seat;
                  return (
                    <button
                      key={String(seat)}
                      onClick={() => onFilterChange({ ...filters, seats: seat })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold text-center transition-all ${
                        isSelected
                          ? 'bg-[#080808] text-white'
                          : 'bg-[#F4F4F6] text-[#4D5056] hover:bg-slate-200'
                      }`}
                    >
                      {seat === 'all' ? 'Any' : `${seat} Seats`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sort Order */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4D5056] block mb-3">
                Sort Results By
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'recommended', label: 'Recommended & Popular' },
                  { id: 'price-asc', label: 'Price: Lowest first' },
                  { id: 'price-desc', label: 'Price: Highest first' },
                  { id: 'rating', label: 'Customer Rating' },
                  { id: 'power', label: 'Engine Horsepower (HP)' },
                ].map((item) => {
                  const isSelected = filters.sortBy === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() =>
                        onFilterChange({
                          ...filters,
                          sortBy: item.id as FilterOptions['sortBy'],
                        })
                      }
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-colors ${
                        isSelected ? 'bg-slate-100 text-[#080808]' : 'text-[#4D5056] hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-[#D61B04]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="p-6 border-t border-slate-100 bg-[#F9F9F9]">
            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-2xl bg-[#D61B04] text-white text-sm font-bold shadow-lg shadow-[#D61B04]/25 hover:bg-[#B01402] active:scale-[0.98] transition-all"
            >
              Show {carCount} Available {carCount === 1 ? 'Car' : 'Cars'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
