import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Lock, MapPin, Unlock, Volume2, Wind, Zap } from 'lucide-react';
import type { Booking } from '../../types/car';
import { cn } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

interface DigitalKeyModalProps {
  booking: Booking | null;
  onClose: () => void;
}

/**
 * Demo remote-key controls. No vehicle telematics are connected yet,
 * so the panel is labelled as a preview.
 */
export const DigitalKeyModal: React.FC<DigitalKeyModalProps> = ({ booking, onClose }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [isLightsOn, setIsLightsOn] = useState(false);
  const [isClimateOn, setIsClimateOn] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (msg: string) => {
    setFeedback(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFeedback(null), 2400);
  };

  const commands = [
    {
      label: 'Lights',
      icon: Zap,
      active: isLightsOn,
      onClick: () => {
        setIsLightsOn(true);
        flash('Headlights flashed');
        window.setTimeout(() => setIsLightsOn(false), 1200);
      }
    },
    { label: 'Horn', icon: Volume2, active: false, onClick: () => flash('Horn sounded') },
    {
      label: isClimateOn ? 'Climate on' : 'Climate',
      icon: Wind,
      active: isClimateOn,
      onClick: () => {
        setIsClimateOn((v) => !v);
        flash(isClimateOn ? 'Climate stopped' : 'Pre-cooling cabin to 21°C');
      }
    }
  ];

  return (
    <Sheet open={booking !== null} onClose={onClose} tone="dark" title="Digital key" description="Preview — remote commands are simulated">
      {booking && (
        <div className="space-y-4">
          <div className="flex h-8 items-center justify-center" aria-live="polite">
            <AnimatePresence>
              {feedback && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-white/10 px-3 py-1 text-sm font-medium text-emerald-300"
                >
                  <CheckCircle2 className="size-4" />
                  {feedback}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div
            className={cn(
              'rounded-2xl border bg-gradient-to-b from-white/10 to-white/5 p-4 transition-shadow duration-300',
              isLightsOn ? 'border-amber-400/80 shadow-[0_0_30px_rgb(251_191_36/0.3)]' : 'border-white/10'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{booking.car.brand}</p>
                <p className="truncate text-lg font-bold">{booking.car.name}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                  isLocked ? 'bg-white/10 text-white/70' : 'bg-brand text-white'
                )}
              >
                {isLocked ? 'Locked' : 'Unlocked'}
              </span>
            </div>
            <div className="mt-2 flex h-36 items-center justify-center overflow-hidden rounded-xl bg-black/40">
              <img src={booking.car.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsLocked((v) => !v);
              flash(isLocked ? 'Vehicle unlocked' : 'Doors locked');
            }}
            className={cn(
              'flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl text-base font-bold transition-colors active:scale-[0.98]',
              isLocked ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-white text-ink hover:bg-white/90'
            )}
          >
            {isLocked ? <Unlock className="size-5" /> : <Lock className="size-5" />}
            {isLocked ? 'Unlock vehicle' : 'Lock vehicle'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            {commands.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                aria-pressed={c.active}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold transition-colors active:scale-95',
                  c.active ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/10'
                )}
              >
                <c.icon className="size-5" />
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-white/70">
              <MapPin className="size-4 shrink-0 text-brand" />
              <span className="truncate">{booking.pickupLocation}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-white/50">{booking.digitalPassCode}</span>
          </div>
        </div>
      )}
    </Sheet>
  );
};
