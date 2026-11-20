import React from 'react';
import { Info } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';

/**
 * Shown only when the live backend (Supabase) is configured but the fleet couldn't be loaded.
 * In demo mode the bundled fleet *is* the data source and availability is checked on the device,
 * so there's nothing to warn about.
 */
export const FleetNotice: React.FC = () => {
  const { fleetSource } = useAppState();
  if (backend.kind !== 'supabase' || fleetSource !== 'demo') return null;
  return (
    <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>We’re having trouble refreshing the fleet right now. Availability is always confirmed before you pay.</span>
    </p>
  );
};
