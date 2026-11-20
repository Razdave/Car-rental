import React, { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';
import { Field } from '../booking/BookingParts';
import { Button } from '../ui/Button';
import { Card, Container, DetailHeader } from '../ui/Layout';

/** Passwordless sign-in: email → 6-digit code. Accounts are created on first sign-in. */
export const SignInScreen: React.FC = () => {
  const [params] = useSearchParams();
  const next = params.get('next') || '/profile';
  const navigate = useNavigate();
  const { profile, setProfile, showToast } = useAppState();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile) return <Navigate to={next} replace />;

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    try {
      await backend.sendSignInCode(email.trim());
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await backend.verifySignInCode(email.trim(), code.trim());
      setProfile(p);
      showToast(`Welcome, ${p.fullName.split(' ')[0]}`, 'success');
      navigate(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DetailHeader fallback="/" title="Sign in" />
      <Container className="max-w-md py-8">
        <Card className="p-6">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Mail className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">{step === 'email' ? 'Sign in or create an account' : 'Check your email'}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {step === 'email'
              ? 'We’ll email you a 6-digit code — no password needed.'
              : `We sent a code to ${email}. It expires in 10 minutes.`}
          </p>

          {step === 'email' ? (
            <form onSubmit={sendCode} className="mt-6 space-y-4">
              <Field label="Email" error={error ?? undefined}>
                <input className="field" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button type="submit" block size="lg" disabled={busy}>
                {busy && <Loader2 className="size-5 animate-spin" />} Email me a code
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <Field label="6-digit code" error={error ?? undefined}>
                <input
                  className="field text-center font-mono text-2xl tracking-[0.5em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Button type="submit" block size="lg" disabled={busy || code.length < 6}>
                {busy && <Loader2 className="size-5 animate-spin" />} Sign in
              </Button>
              <Button variant="ghost" block onClick={() => setStep('email')}>
                Use a different email
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-ink-soft">
          By continuing you agree to our rental terms and privacy policy.
        </p>
      </Container>
    </>
  );
};
