import LiquidGlass from "liquid-glass-react";
import { useRef, type ReactNode } from "react";

type Props = {
  /** Pixels. The glass is measured once, so the size is fixed rather than following its content. */
  width: number;
  height: number;
  /** Drawn on the glass itself, centred. */
  glass?: ReactNode;
  className?: string;
  /** Interactive layer on top of the glass, filling it (buttons, a sheet trigger). */
  children?: ReactNode;
};

// Apple Notes look: no refraction or colour fringing, a milky frosted fill and a soft shadow.
// The library hardcodes a heavy shadow and a white text shadow, overridden through its class names.
// `flex!`: the library's inline-flex leaves a baseline gap, so its box is 6px taller than the glass and
// the centring shifts the glass up, off our rim.
const GLASS =
  "[&_.glass]:flex! [&_.glass]:shadow-[0_2px_12px_rgba(0,0,0,0.1)]! [&_.glass>div]:[text-shadow:none] [&_.glass__warp]:bg-page/55";

// The glowing rim: one hairline edge plus a highlight along the top and a slightly darker edge on the left and right, like iOS. On a light page a white ring inside
// the hairline reads as a second border, so only dark mode gets a full inner stroke.
const RIM =
  "shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),inset_0_1.5px_1.5px_rgba(255,255,255,1),inset_1.5px_0_1.5px_-0.5px_rgba(0,0,0,0.1),inset_-1.5px_0_1.5px_-0.5px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12),inset_0_0_0_1px_rgba(255,255,255,0.22),inset_0_1.5px_2px_rgba(255,255,255,0.45),inset_0_-1px_2px_rgba(255,255,255,0.15)]";

export function GlassSurface({
  width,
  height,
  glass,
  className = "",
  children,
}: Props) {
  // The library draws its own rim (the blended spans beside the glass), which would double ours.
  const area = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={area}
      className={`relative [&>span[style*='mix-blend-mode']]:hidden ${className}`}
      style={{ width, height }}
    >
      <LiquidGlass
        mouseContainer={area}
        cornerRadius={height / 2}
        padding="0"
        blurAmount={0.45}
        saturation={120}
        displacementScale={8}
        aberrationIntensity={0}
        elasticity={0.2}
        className={GLASS}
        style={{ position: "absolute", top: "50%", left: "50%" }}
      >
        <div
          className="grid place-items-center text-ink"
          style={{ width, height }}
        >
          {glass}
        </div>
      </LiquidGlass>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-full ${RIM}`}
      />
      {children}
    </div>
  );
}
