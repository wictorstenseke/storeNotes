import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('shows the note with a grocery section', async () => {
  render(<App />);
  expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
});
