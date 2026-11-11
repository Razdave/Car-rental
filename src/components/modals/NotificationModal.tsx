import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell, CheckCircle, Gift, ShieldAlert, Sparkles } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBooking?: (bookingId: string) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onSelectBooking
}) => {
  if (!isOpen) return null;

  const notifications = [
    {
      id: 'notif-1',
      title: 'Digital Key Ready',
      message: 'Your Audi R8 V10 is parked and ready for contactless pickup at Wilshire Blvd.',
      time: '15 mins ago',
      icon: Sparkles,
      iconColor: 'text-[#D61B04] bg-red-50',
      unread: true,
      bookingId: 'BK-78921'
    },
    {
      id: 'notif-2',
      title: 'Weekend Promotion Active',
      message: 'Get 20% off all Exotic and SUV reservations using promo code DRIVE20.',
      time: '2 hours ago',
      icon: Gift,
      iconColor: 'text-amber-500 bg-amber-50',
      unread: true
    },
    {
      id: 'notif-3',
      title: 'Booking Confirmed',
      message: 'Reservation #BK-64219 for Range Rover Autobiography confirmed for Nov 20.',
      time: 'Yesterday',
      icon: CheckCircle,
      iconColor: 'text-emerald-500 bg-emerald-50',
      unread: false,
      bookingId: 'BK-64219'
    }
  ];

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
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#D61B04]" />
              <h3 className="text-lg font-bold text-[#080808]">Notifications</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[#4D5056] hover:text-[#080808] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (n.bookingId && onSelectBooking) {
                      onSelectBooking(n.bookingId);
                      onClose();
                    }
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    n.unread
                      ? 'bg-red-50/20 border-red-100 hover:bg-red-50/40'
                      : 'bg-white border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.iconColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#080808]">{n.title}</h4>
                        <span className="text-[10px] text-[#B1B1B2]">{n.time}</span>
                      </div>
                      <p className="text-xs text-[#4D5056] mt-1 leading-relaxed">{n.message}</p>
                      {n.bookingId && (
                        <span className="inline-block mt-2 text-[11px] font-bold text-[#D61B04]">
                          View Reservation →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
