import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, CreditCard, ShieldCheck, Bell, 
  HelpCircle, LogOut, ChevronRight, PhoneCall, 
  Settings, Award, Check, Globe 
} from 'lucide-react';
import { USER_PROFILE } from '../../data/cars';

interface ProfileScreenProps {
  onLogout: () => void;
  favoritesCount: number;
  bookingsCount: number;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  onLogout,
  favoritesCount,
  bookingsCount
}) => {
  const [profile, setProfile] = useState(USER_PROFILE);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editName, setEditName] = useState(profile.fullName);
  const [editEmail, setEditEmail] = useState(profile.email);
  const [editPhone, setEditPhone] = useState(profile.phone);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [currency, setCurrency] = useState('USD ($)');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfile({
      ...profile,
      fullName: editName,
      email: editEmail,
      phone: editPhone
    });
    setIsEditingInfo(false);
  };

  return (
    <div className="pb-28 pt-2">
      {/* Title */}
      <div className="px-5 pt-3 pb-3">
        <h2 className="text-xl font-extrabold text-[#080808] tracking-tight">Account & Profile</h2>
        <p className="text-xs text-[#B1B1B2]">Personal settings and concierge support</p>
      </div>

      {/* User Hero Card */}
      <div className="px-5 mb-5">
        <div className="p-5 rounded-[28px] bg-white border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <img
              src={profile.avatarUrl}
              alt={profile.fullName}
              className="w-16 h-16 rounded-full object-cover ring-4 ring-[#F4F4F6]"
            />
            <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-extrabold text-[#080808] truncate">
                {profile.fullName}
              </h3>
              <ShieldCheck className="w-4 h-4 text-[#D61B04]" />
            </div>
            <p className="text-xs text-[#4D5056] truncate">{profile.email}</p>
            <div className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-[#080808]">
              <Award className="w-3 h-3 text-[#D61B04]" />
              <span>{profile.memberTier}</span>
            </div>
          </div>

          <button
            onClick={() => setIsEditingInfo(true)}
            className="text-xs font-bold text-[#D61B04] hover:underline"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="px-5 mb-6">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">Total Trips</span>
            <span className="text-base font-extrabold text-[#080808] mt-0.5 block">{bookingsCount}</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">Driver Rating</span>
            <span className="text-base font-extrabold text-amber-500 mt-0.5 block">★ {profile.driverRating}</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#B1B1B2] block uppercase">VIP Savings</span>
            <span className="text-base font-extrabold text-emerald-600 mt-0.5 block">${profile.totalSaved}</span>
          </div>
        </div>
      </div>

      {/* Menu Options Group 1 */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-2.5">
          Credentials & Wallet
        </h3>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
          <button
            onClick={() => setShowLicenseModal(true)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#D61B04] flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#080808] block">Driving License</span>
                <span className="text-[11px] text-[#B1B1B2]">{profile.licenseNumber} · Verified</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold">
              VERIFIED
            </span>
          </button>

          <button
            onClick={() => setShowPaymentModal(true)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#080808] flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#080808] block">Saved Payment Methods</span>
                <span className="text-[11px] text-[#B1B1B2]">Visa ending in 8821, Apple Pay</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Menu Options Group 2: Preferences */}
      <div className="px-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-2.5">
          App Preferences
        </h3>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#080808] flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#080808] block">Trip Notifications</span>
                <span className="text-[11px] text-[#B1B1B2]">Key alerts, rental updates</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="w-5 h-5 accent-[#D61B04] cursor-pointer"
            />
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#080808] flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#080808] block">Currency</span>
                <span className="text-[11px] text-[#B1B1B2]">Default pricing display</span>
              </div>
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="text-xs font-bold text-[#080808] bg-[#F9F9F9] py-1.5 px-3 rounded-xl border border-slate-200 cursor-pointer"
            >
              <option value="USD ($)">USD ($)</option>
              <option value="EUR (€)">EUR (€)</option>
              <option value="GBP (£)">GBP (£)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Menu Options Group 3: Support */}
      <div className="px-5 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4D5056] mb-2.5">
          Support & Concierge
        </h3>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
          <button
            onClick={() => setShowSupportModal(true)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#D61B04] flex items-center justify-center">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#080808] block">24/7 Roadside VIP Concierge</span>
                <span className="text-[11px] text-[#B1B1B2]">Instant assistance anywhere in California</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>

          <button
            onClick={onLogout}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-red-50/50 transition-colors text-[#D61B04]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#D61B04] flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Log Out of ApexDrive</span>
            </div>
            <ChevronRight className="w-4 h-4 text-red-300" />
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#080808] mb-1">Edit Profile Details</h3>
            <p className="text-xs text-[#B1B1B2] mb-4">Keep your legal contact info up to date</p>

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#B1B1B2] uppercase block mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-[#D61B04] focus:outline-none"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-[#4D5056]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#D61B04] text-white text-xs font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roadside Assistance Hotline Dialog */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 text-[#D61B04] mx-auto flex items-center justify-center mb-3">
              <PhoneCall className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#080808]">24/7 Roadside Assistance</h3>
            <p className="text-xs text-[#4D5056] mt-1 mb-4 leading-relaxed">
              Our emergency dispatch and vehicle support team is on standby 24 hours a day, 7 days a week.
            </p>

            <div className="p-4 rounded-2xl bg-[#F9F9F9] mb-4">
              <span className="text-[10px] uppercase font-bold text-[#B1B1B2] block">Toll-Free Hotline</span>
              <span className="text-lg font-black text-[#D61B04] mt-0.5 block tracking-wide">
                1-800-APEX-CAR
              </span>
              <span className="text-[11px] text-[#4D5056]">(1-800-273-9227)</span>
            </div>

            <button
              onClick={() => setShowSupportModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Driver License Modal */}
      {showLicenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#080808] mb-1">Driver's License</h3>
            <p className="text-xs text-[#B1B1B2] mb-4">Verified digital credential</p>

            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white space-y-3 mb-4">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  STATE OF CALIFORNIA
                </span>
                <span className="text-[10px] font-bold text-emerald-400">ACTIVE ✓</span>
              </div>
              <div className="font-mono text-sm tracking-wider font-bold">
                {profile.licenseNumber}
              </div>
              <div className="flex justify-between text-[11px] text-white/70">
                <span>{profile.fullName}</span>
                <span>EXP: {profile.licenseExpiry}</span>
              </div>
            </div>

            <button
              onClick={() => setShowLicenseModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-[#080808] text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Saved Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#080808] mb-1">Saved Payment Methods</h3>
            <p className="text-xs text-[#B1B1B2] mb-4">Cards linked to your account</p>

            <div className="space-y-2 mb-4">
              <div className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#D61B04]" />
                  <span className="font-bold">Visa ending in 8821</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  DEFAULT
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Apple Pay</span>
                </div>
                <span className="text-[10px] text-slate-400">Connected</span>
              </div>
            </div>

            <button
              onClick={() => setShowPaymentModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#080808] text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
