import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Plane, Building, Anchor, Check } from 'lucide-react';
import { AVAILABLE_LOCATIONS } from '../../data/cars';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: string;
  onSelectLocation: (locationName: string) => void;
  title?: string;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  selectedLocation,
  onSelectLocation,
  title = 'Select Location'
}) => {
  if (!isOpen) return null;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Plane':
        return <Plane className="w-4 h-4 text-sky-500" />;
      case 'Anchor':
        return <Anchor className="w-4 h-4 text-teal-500" />;
      case 'Building':
      default:
        return <Building className="w-4 h-4 text-[#D61B04]" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        >
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-[#080808]">{title}</h3>
              <p className="text-xs text-[#B1B1B2]">Choose from our luxury concierge hubs</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[#4D5056] hover:text-[#080808] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-2 overflow-y-auto">
            {AVAILABLE_LOCATIONS.map((loc) => {
              const isSelected = selectedLocation.includes(loc.name.split(' - ')[0]) || selectedLocation === loc.name;
              return (
                <button
                  key={loc.id}
                  onClick={() => {
                    onSelectLocation(loc.name);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-left transition-all ${
                    isSelected
                      ? 'bg-[#080808] text-white shadow-md'
                      : 'bg-[#F9F9F9] hover:bg-slate-100 text-[#080808]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected ? 'bg-white/10' : 'bg-white shadow-sm'
                      }`}
                    >
                      {getIcon(loc.icon)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold leading-tight">{loc.name}</h4>
                      <p className={`text-[11px] ${isSelected ? 'text-white/70' : 'text-[#4D5056]'}`}>
                        {loc.city}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#D61B04]" />}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
