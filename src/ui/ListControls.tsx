import { ListPlusIcon, UserRoundPlusIcon } from 'lucide-react';
import { useUi } from '../state/uiStore';
import { GLASS_BUTTON, GlassSurface } from './GlassSurface';

export function ListControls({ onNewList }: { onNewList(): void }) {
  return (
    <GlassSurface width={104} height={44} className="pointer-events-auto">
      <div className="absolute inset-0 z-10 flex">
        <button
          type="button"
          aria-label="Ny lista"
          className={`grid flex-1 place-items-center text-ink ${GLASS_BUTTON}`}
          onClick={onNewList}
        >
          <ListPlusIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Dela"
          className={`grid flex-1 place-items-center text-ink ${GLASS_BUTTON}`}
          onClick={() => useUi.getState().requestSheet('invite')}
        >
          <UserRoundPlusIcon className="size-5" />
        </button>
      </div>
    </GlassSurface>
  );
}
