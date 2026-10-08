import { STORES, getStore } from '../domain/stores';

type Props = { value: string | null; onChange(id: string | null): void };

export function StorePicker({ value, onChange }: Props) {
  const active = getStore(value)?.id ?? null;
  const options: { id: string | null; name: string }[] = [
    { id: null, name: 'No store' },
    ...STORES.map((store) => ({ id: store.id, name: store.name })),
  ];
  return (
    <div role="group" aria-label="Store" className="flex gap-3 text-[13px]">
      {options.map((option) => (
        <button
          key={option.id ?? 'none'}
          type="button"
          aria-pressed={option.id === active}
          className={option.id === active ? 'font-semibold text-notes-ink' : 'text-ink-2'}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
