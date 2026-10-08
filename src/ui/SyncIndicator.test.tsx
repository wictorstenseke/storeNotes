import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSyncStatus } from '../state/syncStatus';
import { SyncIndicator } from './SyncIndicator';

beforeEach(() => useSyncStatus.setState({ pending: 0, online: true, notice: null }));

describe('SyncIndicator', () => {
  it('shows nothing when online', () => {
    useSyncStatus.setState({ pending: 3, online: true });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when offline with nothing waiting', () => {
    useSyncStatus.setState({ pending: 0, online: false });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says changes will sync when offline with changes waiting', () => {
    useSyncStatus.setState({ pending: 2, online: false });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline – ändringar synkas senare');
  });

  it('shows a notice', () => {
    render(<SyncIndicator />);
    act(() => useSyncStatus.setState({ notice: 'En ändring kunde inte sparas.' }));
    expect(screen.getByRole('status')).toHaveTextContent('En ändring kunde inte sparas.');
  });
});
