import { describe, expect, it } from 'vitest';
import { youFirst } from './people';

const people = [
  { email: 'anna@example.com', pending: false },
  { email: 'bo@example.com', pending: true },
  { email: 'me@example.com', pending: false },
  { email: 'cy@example.com', pending: false },
];

describe('youFirst', () => {
  it('puts the signed-in account first, marked, and keeps the rest in order', () => {
    expect(youFirst(people, 'me@example.com')).toEqual([
      { email: 'me@example.com', pending: false, you: true },
      { email: 'anna@example.com', pending: false, you: false },
      { email: 'bo@example.com', pending: true, you: false },
      { email: 'cy@example.com', pending: false, you: false },
    ]);
  });

  it('matches the address whatever its case', () => {
    expect(youFirst(people, 'Me@Example.com')[0]).toMatchObject({ email: 'me@example.com', you: true });
  });

  it('marks nobody when the account is unknown or only invited', () => {
    expect(youFirst(people, undefined).map((p) => p.you)).toEqual([false, false, false, false]);
    expect(youFirst(people, 'bo@example.com').map((p) => p.email)).toEqual(people.map((p) => p.email));
    expect(youFirst(people, 'bo@example.com').some((p) => p.you)).toBe(false);
  });
});
