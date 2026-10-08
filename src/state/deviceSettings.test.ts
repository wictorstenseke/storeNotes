import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSetting, writeSetting } from './deviceSettings';

afterEach(() => vi.restoreAllMocks());

describe('deviceSettings', () => {
  it('writes, reads and removes a value', () => {
    writeSetting('storeId', 'store-a');
    expect(readSetting('storeId')).toBe('store-a');
    expect(localStorage.getItem('storenotes.storeId')).toBe('store-a');
    writeSetting('storeId', null);
    expect(readSetting('storeId')).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSetting('storeId')).toBeNull();
    expect(() => writeSetting('storeId', 'x')).not.toThrow();
  });
});
