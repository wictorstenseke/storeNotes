import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './newId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('returns a UUID', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  // Browsers only provide crypto.randomUUID on https and localhost. The dev
  // server opened from a phone over the local network is plain http.
  it('still returns unique UUIDs where crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(50);
  });
});
