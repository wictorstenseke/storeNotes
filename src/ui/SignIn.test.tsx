import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignIn, type AuthApi } from './SignIn';

function setup(overrides: Partial<AuthApi> = {}) {
  const auth: AuthApi = {
    signIn: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ error: null, needsConfirmation: true })),
    ...overrides,
  };
  render(<SignIn auth={auth} />);
  return { auth, user: userEvent.setup() };
}

const email = () => screen.getByLabelText('E-post');
const password = () => screen.getByLabelText('Lösenord');

describe('signing in', () => {
  it('signs in with the normalised email and the password', async () => {
    const { auth, user } = setup();
    await user.type(email(), ' Anna@Example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(auth.signIn).toHaveBeenCalledWith({ email: 'anna@example.com', password: 'correct horse' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects an invalid email without calling the server', async () => {
    const { auth, user } = setup();
    await user.type(email(), 'anna');
    await user.type(password(), 'correct horse{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Ange en giltig e-postadress.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('asks for the password when it is missing', async () => {
    const { auth, user } = setup();
    await user.type(email(), 'anna@example.com{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Ange ditt lösenord.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('explains wrong credentials', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'wrong password{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Fel e-post eller lösenord.');
  });

  it('explains an email that has not been confirmed', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Email not confirmed' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Bekräfta din e-post först.');
  });

  it('explains a failure to reach the server', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Failed to fetch' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte logga in.');
  });
});

describe('creating an account', () => {
  const openSignUp = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Skapa ett konto' }));

  it('creates the account and says to confirm by email, then offers sign-in', async () => {
    const { auth, user } = setup();
    await openSignUp(user);
    await user.type(email(), 'Anna@Example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'anna@example.com', password: 'correct horse' });
    expect(await screen.findByRole('status')).toHaveTextContent('Vi har skickat en bekräftelselänk till anna@example.com.');
    expect(screen.getByRole('button', { name: 'Logga in' })).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('rejects a short password without calling the server', async () => {
    const { auth, user } = setup();
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'short{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Använd minst 8 tecken i lösenordet.');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('shows no confirmation notice when the account is usable at once', async () => {
    const { user } = setup({ signUp: vi.fn(async () => ({ error: null, needsConfirmation: false })) });
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains a rate limit', async () => {
    const { user } = setup({
      signUp: vi.fn(async () => ({ error: { message: 'email rate limit exceeded' }, needsConfirmation: false })),
    });
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('För många försök.');
  });

  it('explains any other failure', async () => {
    const { user } = setup({
      signUp: vi.fn(async () => ({ error: { message: 'Failed to fetch' }, needsConfirmation: false })),
    });
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte skapa kontot.');
  });

  it('goes back to signing in', async () => {
    const { user } = setup();
    await openSignUp(user);
    expect(screen.getByRole('button', { name: 'Skapa konto' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Jag har redan ett konto' }));
    expect(screen.getByRole('button', { name: 'Logga in' })).toBeInTheDocument();
  });
});
