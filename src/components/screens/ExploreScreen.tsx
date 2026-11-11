import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, SlidersHorizontal, MapPin, Calendar, Clock, ArrowUpDown, Check } from 'lucide-react';
import { Car, CarCategory, FilterOptions } from '../../types/car';
import { CarCard } from '../cards/CarCard';

interface ExploreScreenProps {
  cars: Car[];
  favorites: string[];
  onToggleFavorite: (carId: string) => void;
  onSelectCar: (car: Car) => void;
  onOpenFilter: () => void;
  onOpenLocation: () => void;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  selectedLocation: string;
}

const CATEGORIES: CarCategory[] = ['All', 'Sports', 'SUV', 'Electric', 'Luxury'];

export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  cars,
  favorites,
  onToggleFavorite,
  onSelectCar,
  onOpenFilter,
  onOpenLocation,
  filters,
  onFilterChange,
  selectedLocation
}) => {
  const [pickupDate, setPickupDate] = useState('2026-11-12');
  const [returnDate, setReturnDate] = useState('2026-11-15');

  // Filter cars logic
  const filteredCars = cars
    .filter((car) => {
      // Category
      if (filters.category !== 'All' && car.category !== filters.category) return false;
      // Search
      if (
        filters.search &&
        !car.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !car.brand.toLowerCase().includes(filters.search.toLowerCase())
      ) {
        return false;
      }
      // Max price
      if (car.pricePerDay > filters.maxPrice) return false;
      // Transmission
      if (filters.transmission !== 'all' && car.transmission !== filters.transmission) return false;
      // Seats
      if (filters.seats !== 'all' && car.seats !== filters.seats) return false;

      return true;
    })
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'price-asc':
          return a.pricePerDay - b.pricePerDay;
        case 'price-desc':
          return b.pricePerDay - a.pricePerDay;
        case 'rating':
          return b.rating - a.rating;
        case 'power':
          return b.powerHp - a.powerHp;
        case 'recommended':
        default:
          return b.reviewCount - a.reviewCount;
      }
    });

  return (
    <div className="pb-24 pt-2">
      {/* Header title */}
      <div className="px-5 pt-3 pb-3">
        <h2 className="text-xl font-extrabold text-[#080808] tracking-tight">Explore Fleet</h2>
        <p className="text-xs text-[#B1B1B2]">Find and reserve available vehicles</p>
      </div>

      {/* Search Input Bar */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
            <input
              type="text"
              placeholder="Search make, model, or keywords..."
              value={filters.search}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-slate-100 text-xs font-medium text-[#080808] placeholder:text-[#B1B1B2] focus:outline-none focus:ring-2 focus:ring-[#D61B04]/20 focus:border-[#D61B04] shadow-sm transition-all"
            />
            {filters.search && (
              <button
                onClick={() => onFilterChange({ ...filters, search: '' })}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={onOpenFilter}
            className="w-12 h-12 rounded-2xl bg-[#080808] hover:bg-[#D61B04] text-white flex items-center justify-center shadow-md transition-colors flex-shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Location & Date Summary Ribbon */}
      <div className="px-5 mb-4">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-between text-xs">
          <button
            onClick={onOpenLocation}
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-[#D61B04] flex-shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-[#B1B1B2] block uppercase font-bold">Pick-up Location</span>
              <span className="font-bold text-[#080808] truncate max-w-[150px] block">
                {selectedLocation.split(' - ')[0]}
              </span>
            </div>
          </button>

          <div className="h-8 w-[1px] bg-slate-200" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[#4D5056] flex-shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-[#B1B1B2] block uppercase font-bold">Dates</span>
              <span className="font-bold text-[#080808]">Nov 12 - 15</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="mb-4">
        <div className="flex items-center gap-2 px-5 overflow-x-auto no-scrollbar py-1">
          {CATEGORIES.map((cat) => {
            const isActive = filters.category === cat;
            return (
              <button
                key={cat}
                onClick={() => onFilterChange({ ...filters, category: cat })}
                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#080808] text-white shadow-md'
                    : 'bg-white text-[#4D5056] border border-slate-100 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Header: Count & Sort */}
      <div className="flex items-center justify-between px-5 mb-3">
        <span className="text-xs font-bold text-[#4D5056]">
          Found <span className="text-[#080808] font-extrabold">{filteredCars.length}</span> vehicles
        </span>

        {/* Quick sort select */}
        <div className="relative">
          <select
            value={filters.sortBy}
            onChange={(e) =>
              onFilterChange({ ...filters, sortBy: e.target.value as FilterOptions['sortBy'] })
            }
            className="text-xs font-semibold text-[#080808] bg-transparent py-1 pr-6 pl-2 rounded-lg cursor-pointer focus:outline-none"
          >
            <option value="recommended">Recommended</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
            <option value="power">Highest Power (HP)</option>
          </select>
        </div>
      </div>

      {/* Car Cards Grid */}
      <div className="px-5">
        {filteredCars.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl p-6 border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#080808]">No vehicles found</h3>
            <p className="text-xs text-[#B1B1B2] mt-1 max-w-xs mx-auto">
              We couldn't find any cars matching your current filter criteria. Try adjusting your filters.
            </p>
            <button
              onClick={() =>
                onFilterChange({
                  ...filters,
                  search: '',
                  category: 'All',
                  maxPrice: 400,
                  transmission: 'all',
                  seats: 'all'
                })
              }
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCars.map((car) => (
              <CarCard
                key={car.id}
                car={car}
                isFavorite={favorites.includes(car.id)}
                onToggleFavorite={onToggleFavorite}
                onSelect={onSelectCar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
