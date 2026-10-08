import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Preview } from './Preview';

it('shows the note with exactly one grocery section, also under StrictMode', async () => {
  render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
  expect(await screen.findByDisplayValue('Grocery List')).toBeInTheDocument();
  expect(screen.getAllByRole('textbox', { name: 'Section title' })).toHaveLength(1);
});
