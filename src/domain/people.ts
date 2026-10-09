// The signed-in account first and marked, the others in the order given.
// An invite is never "you": it only becomes the account once it is accepted.
export function youFirst<T extends { email: string; pending: boolean }>(
  people: T[],
  email: string | null | undefined,
): (T & { you: boolean })[] {
  const own = email?.trim().toLowerCase();
  const marked = people.map((person) => ({
    ...person,
    you: !person.pending && person.email.toLowerCase() === own,
  }));
  return [...marked.filter((person) => person.you), ...marked.filter((person) => !person.you)];
}
