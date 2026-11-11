import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, SlidersHorizontal, MapPin, Bell, ArrowRight, Sparkles } from 'lucide-react';
import { Car, CarCategory } from '../../types/car';
import { CarCard } from '../cards/CarCard';

interface HomeScreenProps {
  cars: Car[];
  favorites: string[];
  onToggleFavorite: (carId: string) => void;
  onSelectCar: (car: Car) => void;
  onNavigateToExplore: () => void;
  onOpenFilter: () => void;
  onOpenLocation: () => void;
  onOpenNotifications: () => void;
  selectedLocation: string;
}

const CATEGORIES: { id: CarCategory; label: string }[] = [
  { id: 'All', label: 'All Cars' },
  { id: 'Sports', label: 'Sports' },
  { id: 'SUV', label: 'SUV' },
  { id: 'Electric', label: 'Electric' },
  { id: 'Luxury', label: 'Luxury' }
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  cars,
  favorites,
  onToggleFavorite,
  onSelectCar,
  onNavigateToExplore,
  onOpenFilter,
  onOpenLocation,
  onOpenNotifications,
  selectedLocation
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CarCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCars = cars.filter((car) => {
    const matchesCategory = selectedCategory === 'All' || car.category === selectedCategory;
    const matchesQuery =
      car.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      car.brand.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const popularCars = cars.filter((c) => c.isPopular);
  const featuredCar = cars[0]; // Audi R8

  return (
    <div className="pb-24 pt-2">
      {/* Top Header Section */}
      <div className="px-5 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                alt="Alex Harrison"
                className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#B1B1B2] block uppercase tracking-wider">
                Welcome back
              </span>
              <h2 className="text-base font-extrabold text-[#080808] leading-tight">
                Hello, Alex 👋
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenLocation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-100 shadow-sm text-xs font-semibold text-[#4D5056] hover:text-[#080808] transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-[#D61B04]" />
              <span className="max-w-[110px] truncate">{selectedLocation.split(' - ')[0]}</span>
            </button>

            <button
              onClick={onOpenNotifications}
              className="relative w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-[#4D5056] hover:text-[#080808] transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#D61B04] rounded-full" />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Quick Filter Bar */}
      <div className="px-5 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
            <input
              type="text"
              placeholder="Search car, brand or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-slate-100/90 text-xs font-medium text-[#080808] placeholder:text-[#B1B1B2] focus:outline-none focus:ring-2 focus:ring-[#D61B04]/20 focus:border-[#D61B04] shadow-sm transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
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

      {/* Promotional Banner Card */}
      <div className="px-5 mb-6">
        <div className="relative overflow-hidden rounded-[28px] bg-[#080808] text-white shadow-xl min-h-[175px]">
          {/* Banner background photo */}
          <img
            src="/src/assets/images/car_hero_banner_1794399931970.jpg"
            alt="Exotic car showroom"
            className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105"
          />
          {/* Deep dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/85 to-transparent" />

          {/* Banner Content */}
          <div className="relative z-10 p-6 flex flex-col justify-between h-full">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D61B04] text-[10px] font-extrabold tracking-wider uppercase mb-2">
                <Sparkles className="w-3 h-3" />
                <span>Special Weekend Deal</span>
              </div>
              <h3 className="text-xl font-black text-white leading-tight max-w-[220px]">
                20% OFF On Luxury Fleet
              </h3>
              <p className="text-xs text-white/70 mt-1 max-w-[200px]">
                Valid on all exotic coupes and premium SUVs this weekend.
              </p>
            </div>

            <div className="mt-4">
              <button
                onClick={() => onSelectCar(featuredCar)}
                className="px-4 py-2 rounded-xl bg-white text-[#080808] hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <span>Book Now</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D61B04]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Pills Selector */}
      <div className="mb-6">
        <div className="flex items-center gap-2 px-5 overflow-x-auto no-scrollbar py-1">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#080808] text-white shadow-md'
                    : 'bg-white text-[#4D5056] border border-slate-100 hover:bg-slate-50'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular Vehicles Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-5 mb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#080808] tracking-tight">
              Popular Vehicles
            </h3>
            <p className="text-[11px] text-[#B1B1B2]">Hand-picked luxury machines</p>
          </div>
          <button
            onClick={onNavigateToExplore}
            className="text-xs font-bold text-[#D61B04] hover:underline flex items-center gap-1"
          >
            <span>See All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Popular Cars Grid / Scroll */}
        <div className="px-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(filteredCars.length > 0 ? filteredCars : popularCars).slice(0, 4).map((car) => (
            <CarCard
              key={car.id}
              car={car}
              isFavorite={favorites.includes(car.id)}
              onToggleFavorite={onToggleFavorite}
              onSelect={onSelectCar}
            />
          ))}
        </div>
      </div>

      {/* Recommended For You Section */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#080808] tracking-tight">
              Recommended For You
            </h3>
            <p className="text-[11px] text-[#B1B1B2]">Based on your past rentals</p>
          </div>
          <button
            onClick={onNavigateToExplore}
            className="text-xs font-bold text-[#4D5056] hover:text-[#080808]"
          >
            Explore More
          </button>
        </div>

        <div className="space-y-3">
          {cars.slice(2, 5).map((car) => (
            <CarCard
              key={`rec-${car.id}`}
              car={car}
              isFavorite={favorites.includes(car.id)}
              onToggleFavorite={onToggleFavorite}
              onSelect={onSelectCar}
              layout="horizontal"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
