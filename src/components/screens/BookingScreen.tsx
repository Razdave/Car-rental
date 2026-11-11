import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Calendar, Clock, MapPin, 
  ShieldCheck, UserPlus, Baby, Gauge, 
  Check, ArrowRight, User, Phone, Mail, FileText 
} from 'lucide-react';
import { Car, ExtraService, DriverInfo } from '../../types/car';
import { INITIAL_EXTRA_SERVICES, USER_PROFILE } from '../../data/cars';

interface BookingScreenProps {
  car: Car;
  pickupLocation: string;
  returnLocation: string;
  onOpenLocationPicker: (type: 'pickup' | 'return') => void;
  onBack: () => void;
  onProceedToPayment: (bookingDraft: {
    car: Car;
    pickupDate: string;
    returnDate: string;
    pickupTime: string;
    returnTime: string;
    pickupLocation: string;
    returnLocation: string;
    totalDays: number;
    basePrice: number;
    extraServices: ExtraService[];
    taxAmount: number;
    totalAmount: number;
    driverInfo: DriverInfo;
  }) => void;
}

export const BookingScreen: React.FC<BookingScreenProps> = ({
  car,
  pickupLocation,
  returnLocation,
  onOpenLocationPicker,
  onBack,
  onProceedToPayment
}) => {
  const [pickupDate, setPickupDate] = useState('2026-11-14');
  const [returnDate, setReturnDate] = useState('2026-11-17');
  const [pickupTime, setPickupTime] = useState('10:00 AM');
  const [returnTime, setReturnTime] = useState('06:00 PM');
  const [extraServices, setExtraServices] = useState<ExtraService[]>(INITIAL_EXTRA_SERVICES);

  const [driverInfo, setDriverInfo] = useState<DriverInfo>({
    fullName: USER_PROFILE.fullName,
    email: USER_PROFILE.email,
    phone: USER_PROFILE.phone,
    licenseNumber: USER_PROFILE.licenseNumber,
    ageConfirmed: true
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compute rental days
  const start = new Date(pickupDate).getTime();
  const end = new Date(returnDate).getTime();
  const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const totalDays = diffDays || 3;

  const basePrice = car.pricePerDay * totalDays;
  const selectedExtras = extraServices.filter((s) => s.selected);
  const extraServicesTotal = selectedExtras.reduce(
    (acc, s) => acc + s.pricePerDay * totalDays,
    0
  );
  const taxAmount = Math.round((basePrice + extraServicesTotal) * 0.08);
  const totalAmount = basePrice + extraServicesTotal + taxAmount;

  const toggleService = (serviceId: string) => {
    setExtraServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, selected: !s.selected } : s))
    );
  };

  const getServiceIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'UserPlus':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'Baby':
        return <Baby className="w-4 h-4 text-amber-500" />;
      case 'Gauge':
      default:
        return <Gauge className="w-4 h-4 text-[#D61B04]" />;
    }
  };

  const handleContinue = () => {
    if (!driverInfo.fullName || !driverInfo.email || !driverInfo.phone || !driverInfo.licenseNumber) {
      setErrorMsg('Please complete all driver information fields.');
      return;
    }
    if (!driverInfo.ageConfirmed) {
      setErrorMsg('Driver must confirm they are at least 25 years old.');
      return;
    }

    onProceedToPayment({
      car,
      pickupDate,
      returnDate,
      pickupTime,
      returnTime,
      pickupLocation,
      returnLocation,
      totalDays,
      basePrice,
      extraServices: selectedExtras,
      taxAmount,
      totalAmount,
      driverInfo
    });
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-32">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 px-5 py-3.5 bg-[#F9F9F9]/90 backdrop-blur-md flex items-center justify-between border-b border-slate-100">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#080808] hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-bold text-[#D61B04] uppercase tracking-wider block">
            Step 1 of 3
          </span>
          <h2 className="text-sm font-extrabold text-[#080808]">Rental Details</h2>
        </div>
        <div className="w-10" />
      </div>

      {/* Selected Vehicle Preview Banner */}
      <div className="px-5 pt-4 mb-5">
        <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-24 h-16 rounded-2xl bg-[#F9F9F9] p-2 flex items-center justify-center flex-shrink-0">
            <img src={car.imageUrl} alt={car.name} className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[#B1B1B2] uppercase">{car.brand}</span>
            <h3 className="text-sm font-bold text-[#080808] leading-tight">{car.name}</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-base font-extrabold text-[#080808]">${car.pricePerDay}</span>
              <span className="text-[11px] text-[#B1B1B2]">/day</span>
            </div>
          </div>
        </div>
      </div>

      {/* Locations Section */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Pickup & Return Locations
        </h3>
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs space-y-3">
          <button
            onClick={() => onOpenLocationPicker('pickup')}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#F9F9F9] hover:bg-slate-100 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-50 text-[#D61B04] flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#B1B1B2] uppercase block">Pick-up Location</span>
                <span className="text-xs font-bold text-[#080808]">{pickupLocation}</span>
              </div>
            </div>
            <span className="text-xs font-bold text-[#D61B04]">Change</span>
          </button>

          <button
            onClick={() => onOpenLocationPicker('return')}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#F9F9F9] hover:bg-slate-100 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-200 text-[#080808] flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#B1B1B2] uppercase block">Return Location</span>
                <span className="text-xs font-bold text-[#080808]">{returnLocation}</span>
              </div>
            </div>
            <span className="text-xs font-bold text-[#D61B04]">Change</span>
          </button>
        </div>
      </div>

      {/* Rental Dates & Time Section */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056]">
            Rental Period
          </h3>
          <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-[#D61B04] text-[11px] font-bold">
            {totalDays} {totalDays === 1 ? 'Day' : 'Days'} Total
          </span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Pick-up Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Return Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Pick-up Time
              </label>
              <select
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none cursor-pointer"
              >
                <option>09:00 AM</option>
                <option>10:00 AM</option>
                <option>11:00 AM</option>
                <option>01:00 PM</option>
                <option>03:00 PM</option>
                <option>06:00 PM</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Return Time
              </label>
              <select
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none cursor-pointer"
              >
                <option>10:00 AM</option>
                <option>01:00 PM</option>
                <option>03:00 PM</option>
                <option>06:00 PM</option>
                <option>08:00 PM</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Services */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Optional Add-On Services
        </h3>
        <div className="space-y-2.5">
          {extraServices.map((service) => (
            <div
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center justify-between ${
                service.selected
                  ? 'bg-white border-[#080808] shadow-sm'
                  : 'bg-white border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F9F9F9] flex items-center justify-center flex-shrink-0">
                  {getServiceIcon(service.iconName)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#080808]">{service.name}</h4>
                  <p className="text-[11px] text-[#B1B1B2] mt-0.5">{service.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-extrabold text-[#080808] whitespace-nowrap">
                  +${service.pricePerDay}<span className="text-[10px] text-[#B1B1B2] font-normal">/day</span>
                </span>
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    service.selected
                      ? 'bg-[#080808] border-[#080808] text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {service.selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Driver Information Form */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Driver Information
        </h3>
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3.5">
          <div>
            <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
              Full Legal Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
              <input
                type="text"
                value={driverInfo.fullName}
                onChange={(e) => setDriverInfo({ ...driverInfo, fullName: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                placeholder="Alex Harrison"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
                <input
                  type="email"
                  value={driverInfo.email}
                  onChange={(e) => setDriverInfo({ ...driverInfo, email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                  placeholder="alex@gmail.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
                <input
                  type="tel"
                  value={driverInfo.phone}
                  onChange={(e) => setDriverInfo({ ...driverInfo, phone: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
              Driver's License Number
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B1B2]" />
              <input
                type="text"
                value={driverInfo.licenseNumber}
                onChange={(e) => setDriverInfo({ ...driverInfo, licenseNumber: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F9F9F9] border border-slate-200 text-xs font-bold text-[#080808] focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                placeholder="CA-9182374-DL"
              />
            </div>
          </div>

          {/* Age confirmation checkbox */}
          <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={driverInfo.ageConfirmed}
              onChange={(e) => setDriverInfo({ ...driverInfo, ageConfirmed: e.target.checked })}
              className="w-4 h-4 rounded text-[#D61B04] accent-[#D61B04]"
            />
            <span className="text-[11px] text-[#4D5056] font-medium">
              I confirm the primary driver is 25+ years of age with a valid license.
            </span>
          </label>
        </div>
      </div>

      {/* Live Price Breakdown */}
      <div className="px-5 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-3">
          Price Breakdown
        </h3>
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-2.5 text-xs">
          <div className="flex justify-between text-[#4D5056]">
            <span>
              Base Rental (${car.pricePerDay} × {totalDays} {totalDays === 1 ? 'day' : 'days'})
            </span>
            <span className="font-bold text-[#080808]">${basePrice}</span>
          </div>

          {extraServicesTotal > 0 && (
            <div className="flex justify-between text-[#4D5056]">
              <span>Selected Protection & Add-ons</span>
              <span className="font-bold text-[#080808]">+${extraServicesTotal}</span>
            </div>
          )}

          <div className="flex justify-between text-[#4D5056]">
            <span>Taxes & Concession Recovery (8%)</span>
            <span className="font-bold text-[#080808]">+${taxAmount}</span>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
            <div>
              <span className="text-sm font-black text-[#080808] block">Total Amount</span>
              <span className="text-[10px] text-emerald-600 font-semibold">Free cancellation up to 24h</span>
            </div>
            <span className="text-xl font-black text-[#D61B04]">${totalAmount}</span>
          </div>
        </div>
      </div>

      {/* Validation error */}
      {errorMsg && (
        <div className="px-5 mb-4">
          <div className="p-3 rounded-2xl bg-red-50 text-[#D61B04] text-xs font-semibold text-center border border-red-200">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Sticky Bottom Proceed Button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 p-4 px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-[#B1B1B2] block uppercase font-bold">Total Estimated</span>
            <span className="text-2xl font-black text-[#080808]">${totalAmount}</span>
          </div>

          <button
            onClick={handleContinue}
            className="flex-1 max-w-[240px] py-4 rounded-2xl bg-[#D61B04] hover:bg-[#B01402] text-white text-sm font-extrabold shadow-lg shadow-[#D61B04]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>Continue to Payment</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
