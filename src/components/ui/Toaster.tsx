import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useAppState } from '../../state/AppState';

/** Toasts sit above the bottom nav on phones and top-right on desktop. */
export const Toaster: React.FC = () => {
  const { toasts, dismissToast } = useAppState();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-auto lg:left-auto lg:right-6 lg:top-20 lg:items-end"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertCircle : Info;
          return (
            <motion.button
              key={toast.id}
              layout
              type="button"
              onClick={() => dismissToast(toast.id)}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift"
            >
              <Icon
                className={
                  toast.tone === 'success' ? 'size-4 text-emerald-400' : toast.tone === 'error' ? 'size-4 text-red-400' : 'size-4 text-white/70'
                }
              />
              <span>{toast.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
