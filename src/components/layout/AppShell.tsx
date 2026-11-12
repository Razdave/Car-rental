import React, { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { Bell, Calendar, ChevronDown, Compass, Heart, Home, MapPin, User } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { readStored, writeStored } from '../../lib/storage';
import { cn, IconButton } from '../ui/Button';
import { Container } from '../ui/Layout';
import { Toaster } from '../ui/Toaster';
import { FilterModal } from '../modals/FilterModal';
import { LocationPickerModal } from '../modals/LocationPickerModal';
import { NotificationModal, useNotifications } from '../modals/NotificationModal';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/favorites', label: 'Saved', icon: Heart },
  { to: '/bookings', label: 'Trips', icon: Calendar },
  { to: '/profile', label: 'Profile', icon: User }
] as const;

/** Drill-down routes get their own back-button header and no tab bar on phones. */
const isDetailRoute = (path: string) =>
  path.startsWith('/cars/') || path === '/checkout' || /^\/bookings\/[^/]+/.test(path);

export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <Link to="/" className={cn('flex items-center gap-2 font-extrabold tracking-tight', className)} aria-label="Aurevon home">
    <span className="flex size-8 items-center justify-center rounded-lg bg-ink">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
        <path d="M9 22 16 9l7 13h-4l-3-6-3 6z" fill="#D61B04" />
      </svg>
    </span>
    <span className="text-lg">Aurevon</span>
  </Link>
);

export const AppShell: React.FC = () => {
  const { pathname } = useLocation();
  const { favorites, bookings, pickupLocation, openLocationPicker, profile, setNotificationsOpen } = useAppState();
  const detail = isDetailRoute(pathname);

  const notifications = useNotifications();
  const [seen, setSeen] = useState<string[]>(() => readStored('aurevon.seenNotifications', []));
  const hasUnread = notifications.some((n) => !seen.includes(n.id));
  const markAllSeen = () => {
    const ids = notifications.map((n) => n.id);
    setSeen(ids);
    writeStored('aurevon.seenNotifications', ids);
  };

  const badges = useMemo<Record<string, number>>(
    () => ({
      '/favorites': favorites.length,
      '/bookings': bookings.filter((b) => b.status === 'active' || b.status === 'upcoming').length
    }),
    [favorites, bookings]
  );

  const openNotifications = () => {
    setNotificationsOpen(true);
    markAllSeen();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar — always on desktop; on phones only for top-level tabs */}
      <header
        className={cn(
          'pt-safe sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur-md',
          detail && 'hidden lg:block'
        )}
      >
        <Container className="flex h-16 items-center gap-3">
          <Logo />

          <nav aria-label="Main" className="ml-8 hidden items-center gap-1 lg:flex">
            {NAV.slice(0, 4).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors',
                    isActive ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:bg-white/70 hover:text-ink'
                  )
                }
              >
                {item.label}
                {badges[item.to] > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[11px] font-extrabold leading-5 text-white">
                    {badges[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => openLocationPicker('both')}
              className="inline-flex min-h-11 max-w-[11rem] items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-ink-muted shadow-sm transition-colors hover:text-ink sm:max-w-[16rem]"
              aria-label={`Pick-up location: ${pickupLocation}. Change`}
            >
              <MapPin className="size-4 shrink-0 text-brand" />
              <span className="truncate">{pickupLocation.split(' - ')[0]}</span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </button>
            <IconButton label="Notifications" onClick={openNotifications} badge={hasUnread}>
              <Bell className="size-[18px]" />
            </IconButton>
            <NavLink
              to="/profile"
              aria-label="Profile"
              className={({ isActive }) =>
                cn('hidden size-11 overflow-hidden rounded-full ring-2 lg:block', isActive ? 'ring-brand' : 'ring-white')
              }
            >
              <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
            </NavLink>
          </div>
        </Container>
      </header>

      <main className={cn('flex-1', !detail && 'pb-24 lg:pb-12')}>
        <Outlet />
      </main>

      {/* Bottom tab bar — phones and tablets only */}
      {!detail && (
        <nav
          aria-label="Main"
          className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pt-1.5 shadow-[0_-4px_20px_rgb(8_8_8/0.04)] backdrop-blur-lg lg:hidden"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item ? item.end : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors',
                        isActive ? 'text-brand' : 'text-ink-soft hover:text-ink'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="relative">
                          <Icon className={cn('size-[22px]', isActive && 'stroke-[2.5]')} />
                          {badges[item.to] > 0 && (
                            <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
                              {badges[item.to]}
                            </span>
                          )}
                        </span>
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <FilterModal />
      <LocationPickerModal />
      <NotificationModal notifications={notifications} />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
};
