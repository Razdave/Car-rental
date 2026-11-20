import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Search, ShieldCheck, XCircle } from 'lucide-react';
import type { CheckId, CheckStatus, CustomerVerification } from '../../types/car';
import { backend } from '../../lib/backend';
import { ageOn, CHECKS, MIN_DRIVER_AGE } from '../../lib/verification';
import { formatDate, todayISO } from '../../lib/dates';
import { Button, cn } from '../ui/Button';
import { Card, EmptyState } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { Pill } from './AdminParts';

type Row = CustomerVerification & { customerName: string; customerEmail: string };
type Decision = Record<CheckId, { status: Exclude<CheckStatus, 'missing'>; reason: string }>;

interface Props {
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const STATUS_PILL: Record<CustomerVerification['status'], string> = {
  unverified: 'bg-surface-2 text-ink-muted',
  pending: 'bg-sky-50 text-sky-700',
  verified: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-brand-soft text-brand',
  expired: 'bg-amber-50 text-amber-800'
};

const ID_LABEL = { passport: 'Passport', national_id: 'National ID (NIN)', voters_card: 'Voter’s card', residence_permit: 'Residence permit' };

const Doc: React.FC<{ label: string; refId: string }> = ({ label, refId }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (refId) backend.verificationDocUrl(refId).then(setUrl).catch(() => setUrl(''));
  }, [refId]);
  if (!refId) return <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-line text-xs text-ink-soft">{label}: not provided</div>;
  const pdf = refId.endsWith('.pdf') || url.startsWith('data:application/pdf');
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line" title={`Open ${label}`}>
      {pdf || !url ? (
        <span className="flex h-28 items-center justify-center gap-2 text-sm font-bold"><FileText className="size-5" /> {label}</span>
      ) : (
        <img src={url} alt={label} className="h-28 w-full object-cover" />
      )}
      <span className="block bg-surface px-2 py-1 text-xs font-bold">{label}</span>
    </a>
  );
};

/** Screening queue: review documents and decide each check. */
export const VerificationPanel: React.FC<Props> = ({ run }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');

  const load = () => backend.admin.listVerifications().then(setRows).catch(() => {});
  useEffect(() => {
    void load();
    return backend.admin.onChange(() => void load());
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => filter === 'all' || r.status === 'pending')
      .filter((r) => !q || [r.customerName, r.customerEmail, r.licence.number, r.identity.number].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  }, [rows, filter, query]);

  const openRow = (r: Row) => {
    setOpen(r);
    setNote(r.reviewerNote ?? '');
    setDecision(
      Object.fromEntries(CHECKS.map((c) => [c.id, { status: r.checks[c.id].status === 'missing' ? 'pending' : r.checks[c.id].status, reason: r.checks[c.id].reason ?? '' }])) as Decision
    );
  };

  const today = todayISO();
  const flags = (r: Row) => {
    const f: string[] = [];
    if (r.dateOfBirth && ageOn(r.dateOfBirth) < MIN_DRIVER_AGE) f.push(`Under ${MIN_DRIVER_AGE}`);
    if (r.licence.expiry && r.licence.expiry <= today) f.push('Licence expired');
    else if (r.licence.expiry && r.licence.expiry < (new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10))) f.push('Licence expires within 60 days');
    if (r.identity.expiry && r.identity.expiry <= today) f.push('ID expired');
    if (r.record.convictions || r.record.accidents || r.record.suspensions) f.push('Declared incidents');
    if (r.employment.workEmail && r.employment.workEmail.split('@')[1]?.match(/^(gmail|yahoo|hotmail|outlook)\./)) f.push('Work email is a personal address');
    return f;
  };

  const save = async () => {
    if (!open || !decision) return;
    const ok = await run(() => backend.admin.reviewVerification(open.customerId, decision, note.trim()), 'Decision saved — customer notified');
    if (ok) setOpen(null);
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5">
          {(['pending', 'all'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('min-h-11 rounded-xl px-4 text-sm font-bold', filter === f ? 'bg-ink text-white' : 'border border-line bg-white text-ink-muted')}>
              {f === 'pending' ? `Awaiting review (${rows.filter((r) => r.status === 'pending').length})` : 'All customers'}
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-72">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input className="field pl-10" placeholder="Name, email, licence or ID number" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="mt-4">
        {list.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-7" />} title={filter === 'pending' ? 'Nothing to review' : 'No customers'} description="New submissions appear here live." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((r) => {
              const f = flags(r);
              return (
                <button key={r.customerId} type="button" onClick={() => openRow(r)} className="flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-surface">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{r.customerName}</span>
                      <Pill className={STATUS_PILL[r.status]}>{r.status}</Pill>
                      {f.map((x) => <Pill key={x} className="bg-amber-50 text-amber-800">{x}</Pill>)}
                    </span>
                    <span className="block truncate text-sm text-ink-soft">
                      {r.customerEmail}
                      {r.submittedAt ? ` · submitted ${new Date(r.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ' · not submitted'}
                    </span>
                  </span>
                </button>
              );
            })}
          </Card>
        )}
      </div>

      <Sheet open={open !== null} onClose={() => setOpen(null)} size="lg" title={open?.customerName ?? ''} description={open ? `${open.customerEmail} · ${open.status}` : ''}>
        {open && decision && (
          <div className="space-y-6">
            {!open.submittedAt && <p className="rounded-2xl bg-surface-2 p-4 text-sm">This customer hasn’t submitted verification yet.</p>}
            {flags(open).length > 0 && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {flags(open).join(' · ')}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs font-bold uppercase text-ink-soft">Date of birth</dt><dd className="font-bold">{open.dateOfBirth ? `${formatDate(open.dateOfBirth)} (${ageOn(open.dateOfBirth)})` : '—'}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-ink-soft">Licence</dt><dd className="font-bold">{open.licence.number || '—'} · {open.licence.country} · class {open.licence.licenceClass}</dd><dd className="text-ink-soft">Exp {open.licence.expiry || '—'}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-ink-soft">Government ID</dt><dd className="font-bold">{ID_LABEL[open.identity.type]} · {open.identity.number || '—'}</dd><dd className="text-ink-soft">{open.identity.expiry ? `Exp ${open.identity.expiry}` : 'No expiry'}</dd></div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs font-bold uppercase text-ink-soft">Employment</dt>
                <dd className="font-bold">
                  {open.employment.type === 'corporate' ? `Company booking: ${open.employment.corporateAccount}` : `${open.employment.jobTitle} at ${open.employment.employer}`}
                  {open.employment.workEmail && <span className="font-normal text-ink-soft"> · {open.employment.workEmail}</span>}
                </dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs font-bold uppercase text-ink-soft">Driving record (5 years)</dt>
                <dd className="font-bold">
                  Convictions {open.record.convictions ? 'YES' : 'no'} · At-fault accidents {open.record.accidents ? 'YES' : 'no'} · Suspensions {open.record.suspensions ? 'YES' : 'no'}
                </dd>
                {open.record.details && <dd className="text-ink-muted">{open.record.details}</dd>}
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Doc label="Licence front" refId={open.licence.frontDoc} />
              <Doc label="Licence back" refId={open.licence.backDoc} />
              <Doc label="Government ID" refId={open.identity.doc} />
              <Doc label="Selfie" refId={open.selfieDoc} />
              <Doc label="Employment" refId={open.employment.doc} />
              <Doc label="Driving record" refId={open.record.doc} />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-bold text-ink-muted">Decision per check</p>
              {CHECKS.map((c) => {
                const d = decision[c.id];
                return (
                  <div key={c.id} className="rounded-2xl border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm"><strong>{c.label}</strong> <span className="text-ink-soft">— {c.description}</span></span>
                      <span className="flex gap-1">
                        {(['approved', 'rejected'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={d.status === s}
                            onClick={() => setDecision({ ...decision, [c.id]: { ...d, status: d.status === s ? 'pending' : s } })}
                            className={cn(
                              'inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-bold',
                              d.status === s ? (s === 'approved' ? 'bg-emerald-600 text-white' : 'bg-brand text-white') : 'bg-surface-2 text-ink-muted'
                            )}
                          >
                            {s === 'approved' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {s === 'approved' ? 'Approve' : 'Reject'}
                          </button>
                        ))}
                      </span>
                    </div>
                    {d.status === 'rejected' && (
                      <input
                        className="field mt-2"
                        placeholder="Reason the customer will see, e.g. “Photo is blurry — retake in good light”"
                        value={d.reason}
                        onChange={(e) => setDecision({ ...decision, [c.id]: { ...d, reason: e.target.value } })}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink-muted">Note to the customer (optional)</span>
              <textarea className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="pb-safe sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-white px-5 pt-3 sm:-mx-6 sm:px-6">
              <Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button>
              <Button className="flex-1" disabled={!open.submittedAt} onClick={() => void save()}>
                {Object.values(decision).every((d) => d.status === 'approved') ? 'Approve customer' : 'Save decision'}
              </Button>
            </div>
            <p className="text-xs text-ink-soft">Viewing documents is recorded in the audit log. Documents are personal data — don’t download or share them outside this screen.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
};
