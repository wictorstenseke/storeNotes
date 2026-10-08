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
    return 'Bekräfta din e-post först. Öppna länken vi skickade och logga sedan in.';
  }
  if (/invalid login/i.test(message)) return 'Fel e-post eller lösenord.';
  return 'Kunde inte logga in. Kontrollera anslutningen och försök igen.';
}

function signUpError(message: string): string {
  if (/rate limit|security purposes/i.test(message)) {
    return 'För många försök. Vänta en minut och försök igen.';
  }
  return 'Kunde inte skapa kontot. Kontrollera anslutningen och försök igen.';
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
      setError('Ange en giltig e-postadress.');
      return;
    }
    if (creating && password.length < MIN_PASSWORD) {
      setError(`Använd minst ${MIN_PASSWORD} tecken i lösenordet.`);
      return;
    }
    if (!creating && password === '') {
      setError('Ange ditt lösenord.');
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
        setNotice(`Vi har skickat en bekräftelselänk till ${address}. Öppna den och logga sedan in här.`);
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
          E-post
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
          Lösenord
          <input
            className={FIELD}
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className={BUTTON} disabled={busy}>
          {creating ? 'Skapa konto' : 'Logga in'}
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
        {creating ? 'Jag har redan ett konto' : 'Skapa ett konto'}
      </button>
    </main>
  );
}
