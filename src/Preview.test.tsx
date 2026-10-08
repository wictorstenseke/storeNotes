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
  expect(await screen.findByDisplayValue('Inköpslista')).toBeInTheDocument();
  expect(screen.getAllByRole('textbox', { name: 'Listans namn' })).toHaveLength(1);
});
