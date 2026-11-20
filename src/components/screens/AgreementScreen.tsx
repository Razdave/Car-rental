import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, FileQuestion, Loader2, Printer } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';
import { AGREEMENT_VERSION, agreementToText, buildAgreement } from '../../lib/agreement';
import { SignaturePad } from '../booking/SignaturePad';
import { Field } from '../booking/BookingParts';
import { Button, LinkButton } from '../ui/Button';
import { Card, Container, DetailHeader, EmptyState } from '../ui/Layout';

/** Digital rental agreement: read, type your name, draw a signature, sign. Printable. */
export const AgreementScreen: React.FC = () => {
  const { bookingId } = useParams();
  const { bookings, upsertBooking, showToast } = useAppState();
  const booking = bookings.find((b) => b.id === bookingId);
  const [name, setName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking) {
    return (
      <>
        <DetailHeader fallback="/bookings" title="Rental agreement" />
        <Container className="py-10">
          <EmptyState icon={<FileQuestion className="size-7" />} title="Booking not found" description="Open the agreement from one of your trips." action={<LinkButton to="/bookings" variant="dark">My trips</LinkButton>} />
        </Container>
      </>
    );
  }

  const sections = buildAgreement(booking);
  const signed = booking.agreement;
  const nameMatches = name.trim().toLowerCase() === booking.driverInfo.fullName.trim().toLowerCase();
  const canSign = nameMatches && signature && accepted && !busy;

  const sign = async () => {
    if (!canSign) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await backend.signAgreement(booking.id, {
        signedName: name.trim(),
        signatureImage: signature!,
        termsText: agreementToText(booking),
        version: AGREEMENT_VERSION
      });
      upsertBooking(updated);
      showToast('Agreement signed — a copy has been emailed to you', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your signature.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="print:hidden">
        <DetailHeader fallback={`/bookings/${booking.id}`} eyebrow={`Booking ${booking.id}`} title="Rental agreement" />
      </div>

      <Container className="max-w-3xl py-6 print:max-w-none print:p-0">
        {signed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:hidden">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="size-5" /> Signed {new Date(signed.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Print or save as PDF
            </Button>
          </div>
        )}

        <Card className="p-5 sm:p-8 print:border-0 print:shadow-none">
          <header className="border-b border-line pb-5">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">Aurevon · Version {signed?.version ?? AGREEMENT_VERSION}</p>
            <h1 className="mt-1 text-2xl font-extrabold">Vehicle Rental Agreement</h1>
            <p className="mt-1 text-sm text-ink-soft">Booking {booking.id} · {booking.car.name}</p>
          </header>

          <div className="mt-5 space-y-5">
            {sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-sm font-extrabold">{s.heading}</h2>
                {s.body.map((p) => (
                  <p key={p} className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{p}</p>
                ))}
              </section>
            ))}
          </div>

          {signed ? (
            <div className="mt-8 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Renter’s signature</p>
                <img src={signed.signatureImage} alt={`Signature of ${signed.signedName}`} className="mt-2 h-24 w-full max-w-xs object-contain object-left" />
                <p className="mt-1 border-t border-line pt-1 text-sm font-bold">{signed.signedName}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Signed</p>
                <p className="mt-2 text-sm font-bold">{new Date(signed.signedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}</p>
                <p className="text-sm text-ink-soft">Electronically signed via aurevon</p>
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-5 border-t border-line pt-6 print:hidden">
              <h2 className="text-lg font-extrabold">Sign the agreement</h2>
              <Field
                label="Type your full name"
                hint={`Must match the main driver: ${booking.driverInfo.fullName}`}
                error={name && !nameMatches ? `Type the name exactly as on the booking: ${booking.driverInfo.fullName}` : undefined}
              >
                <input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-bold text-ink-muted">Draw your signature</p>
                <SignaturePad onChange={setSignature} />
              </div>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
                <span className="text-sm">I have read and agree to this rental agreement, and agree to sign it electronically.</span>
              </label>
              {error && <p role="alert" className="rounded-xl bg-brand-soft p-3 text-sm font-semibold text-brand">{error}</p>}
              <Button size="lg" block onClick={sign} disabled={!canSign}>
                {busy && <Loader2 className="size-5 animate-spin" />} Sign agreement
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-4 text-center text-sm print:hidden">
          <Link to={`/bookings/${booking.id}`} className="font-bold text-brand hover:underline">Back to booking</Link>
        </p>
      </Container>
    </>
  );
};
