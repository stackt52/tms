'use client';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Button, Chip, Icon, TextField, useToast } from '@/components/m3';
import { useAuth } from '@/lib/auth-context';
import { USE_EMULATORS } from '@/lib/firebase';
import { DEMO_PASSWORD, DEMO_PERSONAS } from '@/lib/demo';
import '@/components/shell/shell.css';

export function LoginScreen() {
  const { firebaseUser, initialising, signInWithPassword, signInWithGoogle, resetPassword } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { error, success } = useToast();

  useEffect(() => {
    if (!initialising && firebaseUser) router.replace(next);
  }, [initialising, firebaseUser, router, next]);

  const doSignIn = async (e: string, p: string, key: string) => {
    setBusy(key);
    try {
      await signInWithPassword(e, p);
      router.replace(next);
    } catch (err) {
      error(err, 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login">
      <section className="login__hero">
        <div className="row g12">
          <Image src="/logo.svg" alt="IHM TMS" width={48} height={48} priority style={{ borderRadius: 16 }} />
          <div>
            <div style={{ fontWeight: 750, fontSize: 15 }}>IHM Southern Africa</div>
            <div style={{ fontSize: 12.5, opacity: 0.75 }}>Travel Management System</div>
          </div>
        </div>
        <div className="spacer" />
        <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: -0.4, lineHeight: 1.15, maxWidth: 520 }}>
          One controlled, auditable record for every official trip.
        </div>
        <div style={{ fontSize: 14.5, opacity: 0.8, marginTop: 14, maxWidth: 520, lineHeight: 1.55 }}>
          Travel requests, multi-level approvals, 75% advances, vehicle bookings, mileage claims and five-day liquidation — the Travel SOP, digitised.
        </div>
        <div className="row g8 wrap mt22">
          <Chip tone="active" size="md">
            Per diem &gt; 55 km &amp; &gt; 12 h
          </Chip>
          <Chip tone="approved" size="md">
            Advance 75%
          </Chip>
          <Chip tone="info" size="md">
            Liquidate within 5 days
          </Chip>
        </div>
        <div className="spacer" />
        <div style={{ fontSize: 11.5, opacity: 0.6 }}>&copy; 2026 · All rights reserved</div>
      </section>
      <section className="login__form">
        <div className="login__card">
          <div className="t-title">Sign in</div>
          <div className="t-body t-muted mt4">Use your IHM account.</div>
          <form
            className="col g16 mt22"
            onSubmit={(e) => {
              e.preventDefault();
              void doSignIn(email, password, 'form');
            }}
          >
            <TextField label="Work email" type="email" icon="mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <TextField label="Password" type="password" icon="lock" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <Button type="submit" size="lg" block loading={busy === 'form'}>
              Sign in
            </Button>
            <button
              type="button"
              className="m3-btn m3-btn--text m3-btn--sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={!!busy}
              onClick={() => {
                if (!email) {
                  error(new Error('Enter your work email first, then choose “Forgot password”.'));
                  return;
                }
                setBusy('reset');
                resetPassword(email)
                  .then(() => success(`Password reset email sent to ${email}`))
                  .catch((e) => error(e, 'Could not send reset email'))
                  .finally(() => setBusy(null));
              }}
            >
              Forgot password? Email me a reset link
            </button>
          </form>
          <Button variant="outlined" block className="mt12" icon="account_circle" loading={busy === 'google'} onClick={() => {
            setBusy('google');
            signInWithGoogle().then(() => router.replace(next)).catch((e) => error(e, 'Google sign-in failed')).finally(() => setBusy(null));
          }}>
            Continue with Google Workspace
          </Button>

          {USE_EMULATORS ? (
            <div className="m3-card m3-card--md mt22" style={{ background: 'var(--md-surface-low)' }}>
              <div className="row g8">
                <Icon name="science" size={18} color="var(--md-primary)" />
                <div className="t-card-title-sm">Demo personas (emulator)</div>
              </div>
              <div className="t-caption mt4">Seeded by `npm run seed`. Password for all: {DEMO_PASSWORD}</div>
              <div className="col g2 mt10">
                {DEMO_PERSONAS.map((p) => (
                  <button key={p.email} type="button" className="login__persona" disabled={!!busy} onClick={() => void doSignIn(p.email, DEMO_PASSWORD, p.email)}>
                    <Avatar initials={p.initials} size="sm" tone={p.email.startsWith('admin') ? 'warning' : 'secondary'} />
                    <div className="grow">
                      <div style={{ fontWeight: 650, fontSize: 13.5 }}>{p.name}</div>
                      <div className="t-caption">{p.role}</div>
                    </div>
                    {busy === p.email ? <span className="m3-btn__spinner" style={{ color: 'var(--md-primary)' }} /> : <Icon name="chevron_right" size={20} color="var(--md-outline)" />}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
