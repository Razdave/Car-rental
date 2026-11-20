import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Clock, Loader2, Lock, ShieldCheck, XCircle } from 'lucide-react';
import type { CheckId, CustomerVerification } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';
import { CHECKS, emptyVerification, MIN_DRIVER_AGE, STATUS_COPY, verificationProblems } from '../../lib/verification';
import { todayISO } from '../../lib/dates';
import { Field } from '../booking/BookingParts';
import { DocUpload } from '../verification/DocUpload';
import { Button, cn } from '../ui/Button';
import { Card, Container, DetailHeader, SectionLabel } from '../ui/Layout';

const CHECK_ICON = { approved: CheckCircle2, rejected: XCircle, pending: Clock, missing: CircleDashed } as const;

export const VerificationStatusCard: React.FC<{ v: CustomerVerification }> = ({ v }) => {
  const copy = STATUS_COPY[v.status];
  return (
    <div className={cn('rounded-3xl border p-5', copy.tone)}>
      <p className="flex items-center gap-2 text-lg font-extrabold">
        <ShieldCheck className="size-5" /> {copy.title}
      </p>
      <p className="mt-1 text-sm">{copy.body}</p>
      {v.status !== 'unverified' && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {CHECKS.map((c) => {
            const check = v.checks[c.id];
            const Icon = CHECK_ICON[check.status];
            return (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <Icon className={cn('mt-0.5 size-4 shrink-0', check.status === 'approved' ? 'text-emerald-600' : check.status === 'rejected' ? 'text-brand' : 'opacity-60')} />
                <span>
                  <strong>{c.label}</strong>
                  {check.status === 'rejected' && check.reason && <span className="block text-brand">{check.reason}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {v.reviewerNote && <p className="mt-3 text-sm"><strong>Note from our team:</strong> {v.reviewerNote}</p>}
    </div>
  );
};

/** Customer screening: licence, government ID, selfie, employment/company and driving record. */
export const VerifyScreen: React.FC = () => {
  const [params] = useSearchParams();
  const next = params.get('next');
  const navigate = useNavigate();
  const { profile, authReady, verification, refreshVerification, showToast } = useAppState();
  const [form, setForm] = useState<CustomerVerification | null>(null);
  // ?update=1 opens the form straight away (e.g. from a 'renew your documents' email).
  const [editing, setEditing] = useState(params.get('update') === '1');
  const [errors, setErrors] = useState<ReturnType<typeof verificationProblems>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (verification && !form) setForm({ ...emptyVerification(verification.customerId), ...verification });
  }, [verification]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authReady && !profile) return <Navigate to={`/signin?next=${encodeURIComponent(`/verify${next ? `?next=${next}` : ''}`)}`} replace />;
  if (!form || !verification) {
    return (
      <>
        <DetailHeader fallback="/profile" title="Verify your identity" />
        <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-ink-soft" /></div>
      </>
    );
  }

  const showForm = editing || ['unverified', 'rejected', 'expired'].includes(verification.status);
  const set = <K extends keyof CustomerVerification>(k: K, v: CustomerVerification[K]) => {
    const updated = { ...form, [k]: v };
    setForm(updated);
    if (submitted) setErrors(verificationProblems(updated));
  };
  const setIn = <K extends 'licence' | 'identity' | 'employment' | 'record'>(k: K, patch: Partial<CustomerVerification[K]>) =>
    set(k, { ...form[k], ...patch } as CustomerVerification[K]);

  const submit = async () => {
    setSubmitted(true);
    const problems = verificationProblems(form);
    setErrors(problems);
    if (Object.keys(problems).length) {
      showToast('Some details are missing — see the highlighted sections', 'error');
      return;
    }
    setBusy(true);
    try {
      await backend.submitVerification(form);
      await refreshVerification();
      setEditing(false);
      showToast('Submitted for review — we’ll email you once you’re verified', 'success');
      if (next) navigate(next, { replace: true });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not submit', 'error');
    } finally {
      setBusy(false);
    }
  };

  const today = todayISO();
  const err = (k: CheckId | 'dob' | 'consent') => errors[k];

  return (
    <>
      <DetailHeader fallback={next ?? '/profile'} eyebrow="Screening" title="Verify your identity" />
      <Container className="max-w-3xl space-y-6 py-6">
        <VerificationStatusCard v={verification} />

        {!showForm ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-ink-muted">Renewed your licence or ID? Upload the new document to stay verified.</p>
            <Button variant="secondary" onClick={() => setEditing(true)}>Update documents</Button>
          </Card>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <Lock className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              Your documents are stored privately and only seen by our verification team. We screen every driver to protect our customers and fleet.
            </p>

            <section>
              <SectionLabel>1. About you</SectionLabel>
              <Card className="p-5">
                <Field label="Date of birth" error={err('dob')} hint={`Drivers must be ${MIN_DRIVER_AGE} or older.`}>
                  <input type="date" className="field" max={today} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </Field>
              </Card>
            </section>

            <section>
              <SectionLabel>2. Driving licence</SectionLabel>
              <Card className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Licence number"><input className="field uppercase" value={form.licence.number} onChange={(e) => setIn('licence', { number: e.target.value })} /></Field>
                <Field label="Issuing country"><input className="field" value={form.licence.country} onChange={(e) => setIn('licence', { country: e.target.value })} /></Field>
                <Field label="Class"><input className="field" value={form.licence.licenceClass} onChange={(e) => setIn('licence', { licenceClass: e.target.value })} placeholder="e.g. B" /></Field>
                <Field label="Expiry date"><input type="date" className="field" min={today} value={form.licence.expiry} onChange={(e) => setIn('licence', { expiry: e.target.value })} /></Field>
                <DocUpload label="Front of licence" kind="licence-front" value={form.licence.frontDoc} onChange={(r) => setIn('licence', { frontDoc: r })} />
                <DocUpload label="Back of licence" kind="licence-back" value={form.licence.backDoc} onChange={(r) => setIn('licence', { backDoc: r })} />
                {err('licence') && <p className="text-sm font-semibold text-brand sm:col-span-2">{err('licence')}</p>}
              </Card>
            </section>

            <section>
              <SectionLabel>3. Government ID</SectionLabel>
              <Card className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Document type">
                  <select className="field" value={form.identity.type} onChange={(e) => setIn('identity', { type: e.target.value as CustomerVerification['identity']['type'] })}>
                    <option value="national_id">National ID (NIN slip / card)</option>
                    <option value="passport">International passport</option>
                    <option value="voters_card">Voter’s card</option>
                    <option value="residence_permit">Residence permit</option>
                  </select>
                </Field>
                <Field label="Document number"><input className="field uppercase" value={form.identity.number} onChange={(e) => setIn('identity', { number: e.target.value })} /></Field>
                <Field label="Expiry date (if any)"><input type="date" className="field" value={form.identity.expiry} onChange={(e) => setIn('identity', { expiry: e.target.value })} /></Field>
                <DocUpload label="Photo of the document" kind="id" value={form.identity.doc} onChange={(r) => setIn('identity', { doc: r })} />
                {err('identity') && <p className="text-sm font-semibold text-brand sm:col-span-2">{err('identity')}</p>}
              </Card>
            </section>

            <section>
              <SectionLabel>4. Selfie</SectionLabel>
              <Card className="p-5">
                <DocUpload
                  label="A clear photo of your face"
                  hint="Good light, no sunglasses or hat. We compare it with your ID."
                  kind="selfie"
                  selfie
                  value={form.selfieDoc}
                  onChange={(r) => set('selfieDoc', r)}
                  error={err('selfie')}
                />
              </Card>
            </section>

            <section>
              <SectionLabel>5. Employment or company</SectionLabel>
              <Card className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="sm:col-span-2" role="radiogroup" aria-label="Employment type">
                  <div className="grid grid-cols-3 gap-2">
                    {([['employed', 'Employed'], ['self_employed', 'Self-employed'], ['corporate', 'Company booking']] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={form.employment.type === id}
                        onClick={() => setIn('employment', { type: id })}
                        className={cn('min-h-12 rounded-xl px-2 text-sm font-bold', form.employment.type === id ? 'bg-ink text-white' : 'bg-surface-2 text-ink-muted')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.employment.type === 'corporate' ? (
                  <Field label="Company name" className="sm:col-span-2"><input className="field" value={form.employment.corporateAccount} onChange={(e) => setIn('employment', { corporateAccount: e.target.value })} /></Field>
                ) : (
                  <>
                    <Field label={form.employment.type === 'self_employed' ? 'Business name' : 'Employer'}><input className="field" value={form.employment.employer} onChange={(e) => setIn('employment', { employer: e.target.value })} /></Field>
                    <Field label="Job title"><input className="field" value={form.employment.jobTitle} onChange={(e) => setIn('employment', { jobTitle: e.target.value })} /></Field>
                  </>
                )}
                <Field label="Work email (optional)" hint="Speeds up verification"><input type="email" className="field" value={form.employment.workEmail} onChange={(e) => setIn('employment', { workEmail: e.target.value })} /></Field>
                <DocUpload
                  label={form.employment.type === 'corporate' ? 'Company authorisation letter' : form.employment.type === 'self_employed' ? 'CAC certificate or recent invoice' : 'Staff ID or employment letter'}
                  kind="employment"
                  allowPdf
                  value={form.employment.doc}
                  onChange={(r) => setIn('employment', { doc: r })}
                />
                {err('employment') && <p className="text-sm font-semibold text-brand sm:col-span-2">{err('employment')}</p>}
              </Card>
            </section>

            <section>
              <SectionLabel>6. Driving record — last 5 years</SectionLabel>
              <Card className="space-y-3 p-5">
                {([
                  ['convictions', 'Motoring convictions or fines (e.g. dangerous driving, DUI)'],
                  ['accidents', 'Accidents where you were at fault'],
                  ['suspensions', 'Licence suspensions or revocations']
                ] as const).map(([k, label]) => (
                  <div key={k} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="flex shrink-0 gap-1">
                      {[false, true].map((val) => (
                        <button
                          key={String(val)}
                          type="button"
                          aria-pressed={form.record[k] === val}
                          onClick={() => setIn('record', { [k]: val } as Partial<CustomerVerification['record']>)}
                          className={cn('min-h-10 min-w-14 rounded-lg px-3 font-bold', form.record[k] === val ? 'bg-ink text-white' : 'bg-surface-2 text-ink-muted')}
                        >
                          {val ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
                {(form.record.convictions || form.record.accidents || form.record.suspensions) && (
                  <Field label="What happened and when?" error={err('record')}>
                    <textarea className="field min-h-20" value={form.record.details} onChange={(e) => setIn('record', { details: e.target.value })} />
                  </Field>
                )}
                <DocUpload label="Driving record or abstract (optional)" hint="Speeds up approval for higher-value cars" kind="record" allowPdf value={form.record.doc} onChange={(r) => setIn('record', { doc: r })} />
              </Card>
            </section>

            <Card className="p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
                <span className="text-sm">
                  I declare this information is true and complete. I consent to Aurevon verifying my licence, identity, employment and driving record,
                  and to a refundable security deposit being taken for each rental.
                </span>
              </label>
              {err('consent') && <p className="mt-2 text-sm font-semibold text-brand">{err('consent')}</p>}
              <Button size="lg" block className="mt-4" onClick={() => void submit()} disabled={busy}>
                {busy && <Loader2 className="size-5 animate-spin" />} Submit for verification
              </Button>
            </Card>
          </>
        )}
      </Container>
    </>
  );
};
