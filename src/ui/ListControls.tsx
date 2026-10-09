import { ListPlusIcon, ShareIcon } from "lucide-react";
import { listAsText } from "../domain/shareText";
import { useNote } from "../state/context";
import { GLASS_BUTTON, GlassSurface } from "./GlassSurface";

// The native share sheet where there is one, the clipboard otherwise.
async function share(text: string) {
  try {
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
  } catch {
    // Dismissing the sheet rejects with AbortError; nothing to do.
  }
}

export function ListControls({ onNewList }: { onNewList(): void }) {
  const sections = useNote((s) => s.sections);
  const items = useNote((s) => s.items);

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
          onClick={() => void share(listAsText(sections, items))}
        >
          <ShareIcon className="size-5" />
        </button>
      </div>
    </GlassSurface>
  );
}
