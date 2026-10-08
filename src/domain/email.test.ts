import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
  });

  it('returns null for anything that is not an address', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('anna')).toBeNull();
    expect(normalizeEmail('anna@')).toBeNull();
    expect(normalizeEmail('anna@example')).toBeNull();
    expect(normalizeEmail('an na@example.com')).toBeNull();
  });
});
