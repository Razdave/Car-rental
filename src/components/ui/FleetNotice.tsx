import React from 'react';
import { Info } from 'lucide-react';
import { useAppState } from '../../state/AppState';

/** Shown only when the live fleet API is unreachable and the bundled demo data is in use. */
export const FleetNotice: React.FC = () => {
  const { fleetSource } = useAppState();
  if (fleetSource !== 'demo') return null;
  return (
    <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>Showing sample vehicles — live availability is temporarily unavailable.</span>
    </p>
  );
};
