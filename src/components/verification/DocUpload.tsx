import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { backend } from '../../lib/backend';
import { cn } from '../ui/Button';

interface DocUploadProps {
  label: string;
  hint?: string;
  value: string;
  kind: string;
  onChange: (ref: string) => void;
  /** Open the front camera on phones (selfies). */
  selfie?: boolean;
  allowPdf?: boolean;
  error?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Upload a private verification document and show a preview. */
export const DocUpload: React.FC<DocUploadProps> = ({ label, hint, value, kind, onChange, selfie, allowPdf, error }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!value) return setPreview('');
    backend.verificationDocUrl(value).then((u) => active && setPreview(u)).catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (file.size > MAX_BYTES) return setProblem('That file is larger than 10 MB.');
    if (!file.type.startsWith('image/') && !(allowPdf && file.type === 'application/pdf')) return setProblem(allowPdf ? 'Use a photo or a PDF.' : 'Use a photo (JPG, PNG or WebP).');
    setBusy(true);
    try {
      onChange(await backend.uploadVerificationDoc(file, kind));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const isPdf = value.endsWith('.pdf') || preview.startsWith('data:application/pdf');
  const message = problem ?? error;

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-ink-muted">{label}</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'relative flex min-h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-sm font-bold transition-colors',
          value ? 'border-emerald-300 bg-emerald-50/40' : message ? 'border-brand/50 bg-brand-soft/40' : 'border-line bg-surface hover:border-ink-faint'
        )}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-ink-soft" />
        ) : value && preview && !isPdf ? (
          <>
            <img src={preview} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-emerald-700 shadow">
              <CheckCircle2 className="size-4" /> Uploaded — tap to replace
            </span>
          </>
        ) : value ? (
          <span className="inline-flex items-center gap-2 text-emerald-700"><FileText className="size-5" /> Document uploaded — tap to replace</span>
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-ink-muted">
            {selfie ? <Camera className="size-6" /> : <Upload className="size-6" />}
            {selfie ? 'Take a selfie' : 'Add photo'}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={allowPdf ? 'image/*,application/pdf' : 'image/*'}
        capture={selfie ? 'user' : undefined}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {(message || hint) && <p className={cn('mt-1.5 text-sm', message ? 'font-semibold text-brand' : 'text-ink-soft')}>{message ?? hint}</p>}
    </div>
  );
};
