import { useState, type FormEvent } from 'react';
import { normalizeEmail } from '../domain/email';

export type AuthApi = {
  signInWithOtp(args: { email: string }): Promise<{ error: { message: string } | null }>;
  verifyOtp(args: {
    email: string;
    token: string;
    type: 'email';
  }): Promise<{ error: { message: string } | null }>;
};

const FIELD =
  'w-full border-b border-line bg-transparent py-2 text-[16px] caret-notes-ink outline-none placeholder:text-ink-2';
const BUTTON = 'self-start text-[16px] font-semibold text-notes-ink disabled:opacity-50';

function sendError(message: string): string {
  return /rate limit|security purposes/i.test(message)
    ? 'Too many attempts. Wait a minute and try again.'
    : 'Could not send the code. Check your connection and try again.';
}

export function SignIn({ auth }: { auth: AuthApi }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const address = normalizeEmail(email);
    if (!address) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const result = await auth.signInWithOtp({ email: address });
    setBusy(false);
    if (result.error) {
      setError(sendError(result.error.message));
      return;
    }
    setError(null);
    setSentTo(address);
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    const result = await auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (result.error) {
      setError('That code is wrong or has expired. Try again or request a new one.');
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col gap-4 px-6 pt-24">
      <h1 className="text-[20px] font-semibold">storeNotes</h1>
      {sentTo === null ? (
        <form className="flex flex-col gap-4" onSubmit={send} noValidate>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            Email
            <input
              className={FIELD}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" className={BUTTON} disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={verify} noValidate>
          <p className="text-[14px] text-ink-2">We sent a code to {sentTo}.</p>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            6-digit code
            <input
              className={FIELD}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" className={BUTTON} disabled={busy}>
            Sign in
          </button>
          <button
            type="button"
            className="self-start text-[13px] text-ink-2"
            onClick={() => {
              setSentTo(null);
              setCode('');
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-[14px] text-ink">
          {error}
        </p>
      )}
    </main>
  );
}
