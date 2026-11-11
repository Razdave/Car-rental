export type CarCategory = 'All' | 'Sports' | 'SUV' | 'Electric' | 'Luxury' | 'Sedan';

export interface Car {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  category: CarCategory;
  pricePerDay: number;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  powerHp: number;
  acceleration0to100: number; // in seconds
  topSpeedKmH: number;
  transmission: 'Automatic' | 'Manual';
  fuelType: 'Petrol' | 'Electric' | 'Hybrid' | 'Diesel';
  seats: number;
  doors: number;
  color: string;
  imageUrl: string;
  galleryImages: string[];
  description: string;
  features: string[];
  location: string;
  isAvailable: boolean;
  isPopular?: boolean;
  isFeatured?: boolean;
  hostName: string;
  hostRating: number;
  mileageLimit: string;
}

export interface ExtraService {
  id: string;
  name: string;
  description: string;
  pricePerDay: number;
  selected: boolean;
  iconName: string;
}

export interface DriverInfo {
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  ageConfirmed: boolean;
}

export interface Booking {
  id: string;
  carId: string;
  car: Car;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupLocation: string;
  returnLocation: string;
  totalDays: number;
  durationUnit?: 'day' | 'hour';
  durationValue?: number;
  basePrice: number;
  extraServices: ExtraService[];
  discount: number;
  taxAmount: number;
  totalAmount: number;
  status: 'active' | 'upcoming' | 'completed' | 'cancelled';
  managementStatus?: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  driverInfo: DriverInfo;
  paymentMethod: string;
  createdAt: string;
  digitalPassCode: string;
}

export interface FilterOptions {
  search: string;
  category: CarCategory;
  minPrice: number;
  maxPrice: number;
  transmission: 'all' | 'Automatic' | 'Manual';
  seats: number | 'all';
  sortBy: 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'power';
}
