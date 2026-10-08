import { useState, type FormEvent } from 'react';
import { normalizeEmail } from '../domain/email';

type AuthError = { message: string } | null;

export type AuthApi = {
  signIn(args: { email: string; password: string }): Promise<{ error: AuthError }>;
  // needsConfirmation: the account exists but the emailed link must be opened
  // before it can sign in.
  signUp(args: {
    email: string;
    password: string;
  }): Promise<{ error: AuthError; needsConfirmation: boolean }>;
};

const MIN_PASSWORD = 8;

const FIELD =
  'w-full border-b border-line bg-transparent py-2 text-[16px] text-ink caret-notes-ink outline-none placeholder:text-ink-2';
const BUTTON = 'self-start text-[16px] font-semibold text-notes-ink disabled:opacity-50';

function signInError(message: string): string {
  if (/not confirmed/i.test(message)) {
    return 'Confirm your email first. Open the link we sent you, then sign in.';
  }
  if (/invalid login/i.test(message)) return 'Wrong email or password.';
  return 'Could not sign in. Check your connection and try again.';
}

function signUpError(message: string): string {
  if (/rate limit|security purposes/i.test(message)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return 'Could not create the account. Check your connection and try again.';
}

export function SignIn({ auth }: { auth: AuthApi }) {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const address = normalizeEmail(email);
    if (!address) {
      setError('Enter a valid email address.');
      return;
    }
    if (creating && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    if (!creating && password === '') {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    if (creating) {
      const result = await auth.signUp({ email: address, password });
      setBusy(false);
      if (result.error) {
        setError(signUpError(result.error.message));
        return;
      }
      setError(null);
      if (result.needsConfirmation) {
        setNotice(`We sent a confirmation link to ${address}. Open it, then sign in here.`);
        setCreating(false);
      }
      return;
    }

    const result = await auth.signIn({ email: address, password });
    setBusy(false);
    setError(result.error ? signInError(result.error.message) : null);
  };

  const switchMode = () => {
    setCreating((value) => !value);
    setError(null);
    setNotice(null);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col gap-4 px-6 pt-24">
      <h1 className="text-[20px] font-semibold">storeNotes</h1>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Email
          <input
            className={FIELD}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Password
          <input
            className={FIELD}
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className={BUTTON} disabled={busy}>
          {creating ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {notice && (
        <p role="status" className="text-[14px] text-ink">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[14px] text-ink">
          {error}
        </p>
      )}
      <button type="button" className="self-start text-[13px] text-ink-2" onClick={switchMode}>
        {creating ? 'I already have an account' : 'Create an account'}
      </button>
    </main>
  );
}
