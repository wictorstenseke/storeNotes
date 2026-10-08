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

const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');

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
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('asks for the password when it is missing', async () => {
    const { auth, user } = setup();
    await user.type(email(), 'anna@example.com{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('explains wrong credentials', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'wrong password{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });

  it('explains an email that has not been confirmed', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Email not confirmed' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm your email first.');
  });

  it('explains a failure to reach the server', async () => {
    const { user } = setup({ signIn: vi.fn(async () => ({ error: { message: 'Failed to fetch' } })) });
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in.');
  });
});

describe('creating an account', () => {
  const openSignUp = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Create an account' }));

  it('creates the account and says to confirm by email, then offers sign-in', async () => {
    const { auth, user } = setup();
    await openSignUp(user);
    await user.type(email(), 'Anna@Example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'anna@example.com', password: 'correct horse' });
    expect(await screen.findByRole('status')).toHaveTextContent('We sent a confirmation link to anna@example.com.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('rejects a short password without calling the server', async () => {
    const { auth, user } = setup();
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'short{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters for the password.');
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
  });

  it('explains any other failure', async () => {
    const { user } = setup({
      signUp: vi.fn(async () => ({ error: { message: 'Failed to fetch' }, needsConfirmation: false })),
    });
    await openSignUp(user);
    await user.type(email(), 'anna@example.com');
    await user.type(password(), 'correct horse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the account.');
  });

  it('goes back to signing in', async () => {
    const { user } = setup();
    await openSignUp(user);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
