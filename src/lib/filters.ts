import type { Car, CarCategory, FilterOptions } from '../types/car';

export const CATEGORIES: CarCategory[] = ['All', 'Sports', 'SUV', 'Electric', 'Luxury', 'Sedan'];

export const PRICE_MIN = 100000;
export const PRICE_MAX = 1000000;

export const DEFAULT_FILTERS: FilterOptions = {
  search: '',
  category: 'All',
  minPrice: PRICE_MIN,
  maxPrice: PRICE_MAX,
  transmission: 'all',
  seats: 'all',
  sortBy: 'recommended'
};

export const SORT_OPTIONS: { id: FilterOptions['sortBy']; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
  { id: 'power', label: 'Most powerful' }
];

export function filterCars(cars: Car[], filters: FilterOptions): Car[] {
  const query = filters.search.trim().toLowerCase();
  return cars
    .filter((car) => {
      if (filters.category !== 'All' && car.category !== filters.category) return false;
      if (
        query &&
        ![car.name, car.brand, car.model, car.category].some((field) => field.toLowerCase().includes(query))
      ) {
        return false;
      }
      if (car.pricePerDay < filters.minPrice || car.pricePerDay > filters.maxPrice) return false;
      if (filters.transmission !== 'all' && car.transmission !== filters.transmission) return false;
      if (filters.seats !== 'all' && car.seats < filters.seats) return false;
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
        default:
          return b.reviewCount - a.reviewCount;
      }
    });
}

/** Number of non-default refinements (search and sort excluded) — shown as a badge on the filter button. */
export function activeFilterCount(filters: FilterOptions): number {
  let count = 0;
  if (filters.category !== 'All') count++;
  if (filters.minPrice !== PRICE_MIN || filters.maxPrice !== PRICE_MAX) count++;
  if (filters.transmission !== 'all') count++;
  if (filters.seats !== 'all') count++;
  return count;
}
