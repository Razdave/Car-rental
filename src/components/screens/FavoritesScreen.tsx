import React from 'react';
import { motion } from 'motion/react';
import { Heart, Search } from 'lucide-react';
import { Car } from '../../types/car';
import { CarCard } from '../cards/CarCard';

interface FavoritesScreenProps {
  cars: Car[];
  favorites: string[];
  onToggleFavorite: (carId: string) => void;
  onSelectCar: (car: Car) => void;
  onExplore: () => void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  cars,
  favorites,
  onToggleFavorite,
  onSelectCar,
  onExplore
}) => {
  const favoriteCars = cars.filter((c) => favorites.includes(c.id));

  return (
    <div className="pb-28 pt-2">
      {/* Title */}
      <div className="px-5 pt-3 pb-4">
        <h2 className="text-xl font-extrabold text-[#080808] tracking-tight">Saved Vehicles</h2>
        <p className="text-xs text-[#B1B1B2]">
          {favoriteCars.length} {favoriteCars.length === 1 ? 'car' : 'cars'} in your wishlist
        </p>
      </div>

      <div className="px-5">
        {favoriteCars.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl p-6 border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-red-50 text-[#D61B04] mx-auto flex items-center justify-center mb-3">
              <Heart className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#080808]">No saved vehicles yet</h3>
            <p className="text-xs text-[#B1B1B2] mt-1 max-w-xs mx-auto">
              Tap the heart icon on any car to save it to your favorites list for quick booking later.
            </p>
            <button
              onClick={onExplore}
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold hover:bg-[#D61B04] transition-colors"
            >
              Explore Fleet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favoriteCars.map((car) => (
              <CarCard
                key={car.id}
                car={car}
                isFavorite={true}
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
