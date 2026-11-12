import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

type Variant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger' | 'light';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-[0_6px_20px_rgb(214_27_4/0.28)] hover:bg-brand-dark',
  dark: 'bg-ink text-white hover:bg-[#25262B]',
  secondary: 'bg-white text-ink border border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-white text-brand border border-brand/30 hover:bg-brand-soft',
  light: 'bg-white text-ink hover:bg-surface-2 shadow-sm'
};

// Every size meets the 44px minimum touch target.
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-sm rounded-xl gap-1.5',
  md: 'min-h-12 px-5 text-sm rounded-2xl gap-2',
  lg: 'min-h-14 px-6 text-base rounded-2xl gap-2'
};

export const buttonClasses = (variant: Variant = 'primary', size: Size = 'md', block = false) =>
  cn(
    'inline-flex items-center justify-center font-bold whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full'
  );

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', block, className, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonClasses(variant, size, block), className)} {...props} />
  )
);
Button.displayName = 'Button';

type LinkButtonProps = LinkProps & { variant?: Variant; size?: Size; block?: boolean };

export const LinkButton: React.FC<LinkButtonProps> = ({ variant = 'primary', size = 'md', block, className, ...props }) => (
  <Link className={cn(buttonClasses(variant, size, block), className)} {...props} />
);

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'light' | 'dark' | 'plain';
  badge?: boolean;
};

/** 44×44 circular icon button with a required accessible label. */
export const IconButton: React.FC<IconButtonProps> = ({ label, tone = 'light', badge, className, children, ...props }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={cn(
      'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95',
      tone === 'light' && 'bg-white text-ink border border-line shadow-sm hover:bg-surface-2',
      tone === 'dark' && 'bg-white/10 text-white hover:bg-white/20',
      tone === 'plain' && 'text-ink-muted hover:bg-surface-2 hover:text-ink',
      className
    )}
    {...props}
  >
    {children}
    {badge && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-brand ring-2 ring-white" />}
  </button>
);
