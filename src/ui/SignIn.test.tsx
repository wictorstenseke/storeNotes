import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignIn, type AuthApi } from './SignIn';

function setup(overrides: Partial<AuthApi> = {}) {
  const auth: AuthApi = {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  render(<SignIn auth={auth} />);
  return { auth, user: userEvent.setup() };
}

describe('SignIn', () => {
  it('rejects an invalid email without calling the server', async () => {
    const { auth, user } = setup();
    await user.type(screen.getByLabelText('Email'), 'anna{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a code and then verifies it', async () => {
    const { auth, user } = setup();
    await user.type(screen.getByLabelText('Email'), ' Anna@Example.com{Enter}');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'anna@example.com' });
    await user.type(await screen.findByLabelText('6-digit code'), '123456{Enter}');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'anna@example.com', token: '123456', type: 'email' });
  });

  it('explains a wrong or expired code', async () => {
    const { user } = setup({ verifyOtp: vi.fn(async () => ({ error: { message: 'Token has expired or is invalid' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    await user.type(await screen.findByLabelText('6-digit code'), '000000{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired.');
  });

  it('explains a rate limit', async () => {
    const { user } = setup({ signInWithOtp: vi.fn(async () => ({ error: { message: 'email rate limit exceeded' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });

  it('explains a failure to send', async () => {
    const { user } = setup({ signInWithOtp: vi.fn(async () => ({ error: { message: 'Failed to fetch' } })) });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send the code.');
  });

  it('goes back to the email step', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Email'), 'anna@example.com{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
