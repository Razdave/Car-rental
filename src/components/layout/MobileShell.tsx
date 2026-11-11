import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Home, Compass, Heart, Calendar, User, 
  Wifi, Battery, Smartphone, Maximize2 
} from 'lucide-react';

export type TabId = 'home' | 'explore' | 'favorites' | 'bookings' | 'profile';

interface MobileShellProps {
  children: React.ReactNode;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  favoritesCount: number;
  activeBookingsCount: number;
  hideBottomNav?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  activeTab,
  onTabChange,
  favoritesCount,
  activeBookingsCount,
  hideBottomNav = false
}) => {
  const [deviceFrameMode, setDeviceFrameMode] = useState<boolean>(true);

  const tabs: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'favorites', label: 'Favorites', icon: Heart, badge: favoritesCount },
    { id: 'bookings', label: 'Bookings', icon: Calendar, badge: activeBookingsCount },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  return (
    <div className="min-h-screen bg-[#0E0F12] text-[#080808] flex flex-col items-center justify-start antialiased selection:bg-[#D61B04] selection:text-white">
      {/* Top Desktop Controls Bar (hidden on small screens) */}
      <header className="hidden lg:flex w-full max-w-5xl items-center justify-between px-6 py-3 text-xs text-white/70 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#D61B04]" />
          <span className="font-extrabold text-white tracking-wider uppercase text-[11px]">
            Aurevon Services · Mobile UI/UX Experience
          </span>
          <span className="text-white/30">|</span>
          <span className="text-white/60">MD Sabbir Hosen Dribbble Recreation</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeviceFrameMode(true)}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              deviceFrameMode
                ? 'bg-white text-[#080808] shadow-sm'
                : 'bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Device Mockup</span>
          </button>

          <button
            onClick={() => setDeviceFrameMode(false)}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              !deviceFrameMode
                ? 'bg-white text-[#080808] shadow-sm'
                : 'bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fluid View</span>
          </button>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="w-full flex-1 flex items-center justify-center p-0 lg:p-6">
        <div
          className={`w-full transition-all duration-300 relative ${
            deviceFrameMode
              ? 'max-w-[412px] my-0 lg:my-4 rounded-none sm:rounded-[48px] shadow-[0_25px_70px_rgba(0,0,0,0.85)] ring-0 sm:ring-[12px] sm:ring-[#23242A] border-0 sm:border-4 sm:border-[#383A42]'
              : 'max-w-2xl my-0 rounded-none sm:rounded-3xl shadow-xl'
          } bg-[#F9F9F9] overflow-hidden min-h-screen sm:min-h-[860px] flex flex-col`}
        >
          {/* Simulated iOS Status Bar (shown when mockup framing is active) */}
          <div className="pt-3 px-7 pb-1 flex items-center justify-between text-xs font-semibold text-[#080808] z-30 select-none">
            <span>9:41</span>
            {/* Dynamic Island Pill */}
            <div className="hidden sm:flex w-24 h-5 rounded-full bg-[#080808] items-center justify-end px-2 gap-1.5 shadow-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-[#18191E] border border-white/10" />
            </div>
            <div className="flex items-center gap-1.5 text-[#080808]">
              <span className="text-[10px] font-bold">5G</span>
              <Wifi className="w-3.5 h-3.5 stroke-[2.5]" />
              <Battery className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          {/* App Body Viewport */}
          <div className="flex-1 overflow-y-auto relative no-scrollbar">
            {children}
          </div>

          {/* Fixed Floating Bottom Navigation Bar (recreating MD Sabbir Hosen's Dribbble Nav) */}
          {!hideBottomNav && (
            <div className="sticky bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] px-4 py-2">
              <nav className="flex items-center justify-around h-14">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className="relative flex flex-col items-center justify-center w-14 h-full focus:outline-none group active:scale-90 transition-transform"
                    >
                      <div className="relative">
                        <Icon
                          className={`w-5 h-5 transition-colors ${
                            isActive
                              ? 'text-[#D61B04] stroke-[2.5]'
                              : 'text-[#B1B1B2] group-hover:text-[#4D5056] stroke-[2]'
                          }`}
                        />
                        {/* Notification / Count Badge */}
                        {Boolean(tab.badge && tab.badge > 0) && (
                          <span className="absolute -top-1.5 -right-2 px-1.5 min-w-[16px] h-4 rounded-full bg-[#D61B04] text-white text-[9px] font-extrabold flex items-center justify-center shadow-xs">
                            {tab.badge}
                          </span>
                        )}
                      </div>

                      {/* Label */}
                      <span
                        className={`text-[10px] font-bold mt-1 tracking-tight transition-colors ${
                          isActive ? 'text-[#D61B04]' : 'text-[#B1B1B2]'
                        }`}
                      >
                        {tab.label}
                      </span>

                      {/* Active indicator dot */}
                      {isActive && (
                        <motion.div
                          layoutId="activeNavDot"
                          className="w-1 h-1 rounded-full bg-[#D61B04] mt-0.5"
                        />
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* iOS Home Indicator Bar */}
              <div className="hidden sm:block w-32 h-1 bg-[#080808]/20 rounded-full mx-auto mt-1" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
