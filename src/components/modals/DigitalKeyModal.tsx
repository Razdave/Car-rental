import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Lock, Unlock, Zap, Wind, 
  Volume2, Car as CarIcon, BatteryCharging, 
  MapPin, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { Booking } from '../../types/car';

interface DigitalKeyModalProps {
  booking: Booking;
  isOpen: boolean;
  onClose: () => void;
}

export const DigitalKeyModal: React.FC<DigitalKeyModalProps> = ({ booking, isOpen, onClose }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [isLightsOn, setIsLightsOn] = useState(false);
  const [isClimateOn, setIsClimateOn] = useState(true);
  const [targetTemp, setTargetTemp] = useState(70);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const triggerFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 2500);
  };

  const handleToggleLock = () => {
    const nextState = !isLocked;
    setIsLocked(nextState);
    triggerFeedback(nextState ? 'Doors locked & alarmed' : 'Vehicle unlocked & ready to drive');
  };

  const handleFlashLights = () => {
    setIsLightsOn(true);
    triggerFeedback('Headlights flashed twice');
    setTimeout(() => setIsLightsOn(false), 1200);
  };

  const handleHonk = () => {
    triggerFeedback('Horn sounded (Beep Beep!)');
  };

  const handleToggleClimate = () => {
    const next = !isClimateOn;
    setIsClimateOn(next);
    triggerFeedback(next ? `Pre-conditioning cabin to ${targetTemp}°F` : 'Climate system stopped');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full sm:max-w-md bg-[#0D0E11] text-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden border border-white/10 shadow-2xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#D61B04]/20 border border-[#D61B04]/40 flex items-center justify-center text-[#D61B04]">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-white">Smart Digital Key</h3>
                <p className="text-xs text-white/60">Bluetooth Low Energy Connected</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback banner */}
          <div className="h-8 flex items-center justify-center px-4">
            <AnimatePresence>
              {feedbackMessage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 rounded-full text-xs font-medium text-emerald-400 border border-emerald-500/30"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{feedbackMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Vehicle visual card */}
          <div className="px-6 py-2">
            <div className={`relative p-5 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border transition-all duration-300 ${isLightsOn ? 'border-amber-400/80 shadow-[0_0_30px_rgba(251,191,36,0.3)]' : 'border-white/10'}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">{booking.car.brand}</span>
                  <h4 className="text-lg font-bold text-white leading-tight">{booking.car.name}</h4>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${isLocked ? 'bg-white/10 text-white/70' : 'bg-[#D61B04] text-white'}`}>
                  {isLocked ? 'LOCKED' : 'UNLOCKED'}
                </span>
              </div>

              {/* Car photo */}
              <div className="relative h-36 flex items-center justify-center my-1 overflow-hidden rounded-xl bg-black/40">
                <img
                  src={booking.car.imageUrl}
                  alt={booking.car.name}
                  className={`max-h-full max-w-full object-contain transition-all duration-500 ${isLightsOn ? 'filter drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]' : ''}`}
                />
                {isLightsOn && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.4, 1, 0] }}
                    transition={{ duration: 1.2 }}
                    className="absolute inset-0 bg-amber-400/20 pointer-events-none"
                  />
                )}
              </div>

              {/* Telemetry info */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
                <div className="p-2 rounded-xl bg-black/30">
                  <span className="text-[10px] text-white/50 block">Fuel / Battery</span>
                  <span className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1">
                    <BatteryCharging className="w-3.5 h-3.5" /> 88%
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-black/30">
                  <span className="text-[10px] text-white/50 block">Range</span>
                  <span className="text-sm font-bold text-white">295 mi</span>
                </div>
                <div className="p-2 rounded-xl bg-black/30">
                  <span className="text-[10px] text-white/50 block">Cabin Temp</span>
                  <span className="text-sm font-bold text-amber-300">{targetTemp}°F</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key control actions */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* Primary Lock/Unlock giant button */}
            <button
              onClick={handleToggleLock}
              className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98] shadow-lg ${
                isLocked 
                  ? 'bg-gradient-to-r from-[#D61B04] to-[#B01402] text-white shadow-[#D61B04]/30' 
                  : 'bg-white text-[#080808] hover:bg-white/90 shadow-white/20'
              }`}
            >
              {isLocked ? (
                <>
                  <Unlock className="w-5 h-5" />
                  <span>Tap to Unlock Vehicle</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Tap to Lock Vehicle</span>
                </>
              )}
            </button>

            {/* Remote commands grid */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleFlashLights}
                className="p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-1.5"
              >
                <Zap className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-semibold text-white/90">Flash Lights</span>
              </button>

              <button
                onClick={handleHonk}
                className="p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-1.5"
              >
                <Volume2 className="w-5 h-5 text-blue-400" />
                <span className="text-xs font-semibold text-white/90">Honk Horn</span>
              </button>

              <button
                onClick={handleToggleClimate}
                className={`p-3.5 rounded-2xl border active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-1.5 ${
                  isClimateOn 
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                    : 'bg-white/5 border-white/10 text-white/90'
                }`}
              >
                <Wind className="w-5 h-5" />
                <span className="text-xs font-semibold">{isClimateOn ? 'Climate On' : 'Climate Off'}</span>
              </button>
            </div>

            {/* Location & Passcode */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-white/70">
                <MapPin className="w-4 h-4 text-[#D61B04]" />
                <span>{booking.pickupLocation}</span>
              </div>
              <span className="font-mono text-white/50">{booking.digitalPassCode}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
