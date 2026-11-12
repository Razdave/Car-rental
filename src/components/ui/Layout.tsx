import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn, IconButton } from './Button';

/** Standard page width + gutters. 16px on phones, growing with the viewport. */
export const Container: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />
);

interface PageTitleProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

/** Title block used by top-level tab pages. */
export const PageTitle: React.FC<PageTitleProps> = ({ title, subtitle, action }) => (
  <div className="flex items-end justify-between gap-4 pb-4 pt-5 sm:pt-8">
    <div className="min-w-0">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
    </div>
    {action}
  </div>
);

interface DetailHeaderProps {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** Where Back goes when there's no in-app history (e.g. a shared deep link). */
  fallback: string;
  onBack?: () => void;
}

/** Sticky back-button bar for drill-down pages. */
export const DetailHeader: React.FC<DetailHeaderProps> = ({ title, eyebrow, actions, fallback, onBack }) => {
  const navigate = useNavigate();
  const goBack = () => {
    if (onBack) return onBack();
    // history.state.idx is set by React Router; 0 means this page was the entry point.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <div className="pt-safe sticky top-0 z-30 border-b border-line/70 bg-surface/90 backdrop-blur-md lg:top-16">
      <Container className="flex h-16 items-center gap-3">
        <IconButton label="Go back" onClick={goBack}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-brand">{eyebrow}</p>}
          {title && <p className="truncate text-base font-extrabold">{title}</p>}
        </div>
        <div className="flex min-w-11 items-center justify-end gap-2">{actions}</div>
      </Container>
    </div>
  );
};

/**
 * Fixed call-to-action bar on phones/tablets; hidden on desktop where the
 * same content lives in the sticky sidebar. Renders a spacer so content never hides behind it.
 */
export const MobileActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <div className="h-28 lg:hidden" aria-hidden="true" />
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pt-3 shadow-[0_-8px_30px_rgb(8_8_8/0.06)] backdrop-blur-md lg:hidden">
      <Container className="flex items-center gap-4">{children}</Container>
    </div>
  </>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('rounded-3xl border border-line/80 bg-white shadow-card', className)} {...props} />
);

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h2 className={cn('mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted', className)}>{children}</h2>
);

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <Card className="px-6 py-14 text-center">
    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-surface-2 text-ink-soft">{icon}</div>
    <h3 className="text-lg font-bold">{title}</h3>
    <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </Card>
);
