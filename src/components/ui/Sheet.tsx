import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './Button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra controls rendered left of the close button. */
  headerAction?: React.ReactNode;
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' };

/**
 * Bottom sheet on phones, centred dialog from `sm` up.
 * Handles Escape, backdrop click, focus and body scroll locking.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerAction,
  tone = 'light',
  size = 'md'
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const dark = tone === 'dark';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] shadow-2xl outline-none sm:rounded-[28px]',
              SIZES[size],
              dark ? 'bg-[#0D0E11] text-white ring-1 ring-white/10' : 'bg-white text-ink'
            )}
          >
            {/* Grab handle (phones) */}
            <div className={cn('mx-auto mt-2.5 h-1 w-10 rounded-full sm:hidden', dark ? 'bg-white/20' : 'bg-line')} />

            <div
              className={cn(
                'flex items-start justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5',
                dark ? 'border-b border-white/10' : 'border-b border-line'
              )}
            >
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-extrabold leading-tight">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className={cn('mt-0.5 text-sm', dark ? 'text-white/60' : 'text-ink-soft')}>
                    {description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerAction}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className={cn(
                    'inline-flex size-11 items-center justify-center rounded-full transition-colors -mr-2',
                    dark ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>

            {footer && (
              <div
                className={cn(
                  'pb-safe px-5 pt-3 sm:px-6 sm:pb-5',
                  dark ? 'border-t border-white/10' : 'border-t border-line bg-surface'
                )}
              >
                {footer}
              </div>
            )}
            {!footer && <div className="pb-safe sm:pb-2" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
