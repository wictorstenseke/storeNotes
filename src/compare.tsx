// Dev-only page (http://localhost:5173/compare.html): the same circle and pill built with each glass
// library, over the same busy background, to compare them side by side.
import { EllipsisIcon, MenuIcon, ShareIcon, UsersIcon } from "lucide-react";
import LiquidGlassJs from "liquid-glass-js";
import { LiquidGlass as LiquidGlassReact } from "@liquidglass/react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./index.css";
import { GlassSurface } from "./ui/GlassSurface";

const ICON = "size-5 text-ink";

function Icons({ n }: { n: 1 | 3 }) {
  return n === 1 ? (
    <MenuIcon className={ICON} />
  ) : (
    <>
      <UsersIcon className={ICON} />
      <ShareIcon className={ICON} />
      <EllipsisIcon className={ICON} />
    </>
  );
}

// A background with colour, text and hard edges, so refraction and blur are visible.
function Scene({
  children,
  sceneRef,
}: {
  children: ReactNode;
  sceneRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={sceneRef}
      className="relative h-72 overflow-hidden rounded-xl bg-page"
      style={{
        backgroundImage:
          "linear-gradient(115deg, #ff9a8b 0%, transparent 30%), linear-gradient(250deg, #7aa7ff 0%, transparent 35%)",
      }}
    >
      <div className="space-y-2 p-5 text-[15px] text-ink">
        {[
          "Mjölk",
          "Bröd",
          "Kaffe",
          "Ost",
          "Äpplen",
          "Pasta",
          "Tomater",
          "Smör",
        ].map((t) => (
          <div
            key={t}
            className="flex items-center gap-3 border-b border-line/40 pb-2"
          >
            <span className="size-4 rounded-full border border-ink" />
            {t}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function Column({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 flex-1 basis-72">
      <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
      <p className="mb-3 text-[13px] text-ink-2">{note}</p>
      {children}
    </section>
  );
}

// liquid-glass-js clones a background element and lays a fixed lens over placeholders.
function JsColumn({ dark }: { dark: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const circle = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const lenses = useRef<LiquidGlassJs[]>([]);

  useEffect(() => {
    const make = (el: HTMLElement, width: number) => {
      const r = el.getBoundingClientRect();
      return new LiquidGlassJs({
        background: scene.current,
        width,
        height: 44,
        radius: 22,
        x: r.left,
        y: r.top,
        scale: 28,
        depth: 14,
        curvature: 3,
        chroma: 0.03,
        blur: 6,
        edge: 0.5,
        draggable: false,
      });
    };
    lenses.current = [make(circle.current!, 44), make(pill.current!, 156)];
    const place = () => {
      lenses.current[0].moveTo(
        circle.current!.getBoundingClientRect().left,
        circle.current!.getBoundingClientRect().top,
      );
      lenses.current[1].moveTo(
        pill.current!.getBoundingClientRect().left,
        pill.current!.getBoundingClientRect().top,
      );
    };
    window.addEventListener("resize", place);
    // The lenses are fixed-position, so follow the placeholders while the page scrolls.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      lenses.current.forEach((l) => l.destroy());
    };
  }, []);

  useEffect(() => {
    lenses.current.forEach((l) => l.refresh());
  }, [dark]);

  return (
    <Scene sceneRef={scene}>
      <div
        ref={circle}
        className="absolute left-5 top-48 grid size-11 place-items-center"
        style={{ zIndex: 200 }}
      >
        <Icons n={1} />
      </div>
      <div
        ref={pill}
        className="absolute left-5 top-48 ml-16 flex h-11 w-[156px] items-center justify-around"
        style={{ zIndex: 200 }}
      >
        <Icons n={3} />
      </div>
    </Scene>
  );
}

function App() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    // The app's body is overflow:hidden (fixed shell), so this page scrolls in its own container.
    <div className="h-full overflow-y-auto bg-page p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-ink">Glass comparison</h1>
        <button
          className="rounded-lg border border-line px-3 py-1.5 text-ink"
          onClick={() => setDark(!dark)}
        >
          {dark ? "Light" : "Dark"}
        </button>
      </div>
      <div className="flex flex-wrap gap-6">
        <Column
          title="liquid-glass-react (current)"
          note="Blur + SVG refraction, our own rim. Refraction is Chromium only; Safari/iOS gets blur."
        >
          <Scene>
            <div className="absolute left-5 top-48 flex items-center gap-5">
              <GlassSurface width={44} height={44} glass={<Icons n={1} />} />
              <GlassSurface
                width={156}
                height={44}
                glass={
                  <div className="flex w-full items-center justify-around">
                    <Icons n={3} />
                  </div>
                }
              />
            </div>
          </Scene>
        </Column>
        <Column
          title="@liquidglass/react"
          note="backdrop-filter: url(#svg). Chromium only, and Safari drops the whole declaration (no blur)."
        >
          <Scene>
            <div className="absolute left-5 top-48 flex items-center gap-5">
              <div className="size-11">
                <LiquidGlassReact borderRadius={22} blur={4} zIndex={10}>
                  <Icons n={1} />
                </LiquidGlassReact>
              </div>
              <div className="h-11 w-[156px]">
                <LiquidGlassReact borderRadius={22} blur={4} zIndex={10}>
                  <div className="flex w-full items-center justify-around">
                    <Icons n={3} />
                  </div>
                </LiquidGlassReact>
              </div>
            </div>
          </Scene>
        </Column>
        <Column
          title="liquid-glass-js"
          note="Refracts a clone of the background, so Safari works. Static snapshot: not a drop-in over live UI."
        >
          <JsColumn dark={dark} />
        </Column>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
