import LiquidGlass from 'liquid-glass-react';
import { useRef, type ReactNode } from 'react';

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

// Apple Notes toolbar look: a near-white frosted pill with no visible refraction or colour fringing,
// a soft low shadow and an even hairline rim. The library hardcodes a heavy shadow and a white text
// shadow, overridden through its class names.
// `flex!`: the library's inline-flex leaves a baseline gap, so its box is 6px taller than the glass and
// the centring shifts the glass up, off our rim.
const GLASS =
  '[&_.glass]:flex! [&_.glass]:shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_14px_rgba(0,0,0,0.07)]! [&_.glass>div]:[text-shadow:none] [&_.glass__warp]:bg-page/75 dark:[&_.glass__warp]:bg-white/10';

// The rim: the same hairline all the way round, with a lit top edge inside it.
const RIM =
  'shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.2),inset_0_1px_0_rgba(255,255,255,0.14)]';

// For the buttons laid over the glass: a soft fill on hover, a stronger one while pressed, and the icon
// dips a little.
export const GLASS_BUTTON =
  'rounded-full transition-colors duration-150 hover:bg-ink/5 active:bg-ink/10 [&>svg]:transition-transform [&>svg]:duration-150 active:[&>svg]:scale-90';

export function GlassSurface({ width, height, glass, className = '', children }: Props) {
  // The library draws its own rim (the blended spans beside the glass), which would double ours.
  const area = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={area}
      className={`relative transition-transform duration-200 ease-out has-[button:active]:scale-[0.96] [&>span[style*='mix-blend-mode']]:hidden ${className}`}
      style={{ width, height }}
    >
      <LiquidGlass
        mouseContainer={area}
        padding="0"
        blurAmount={0.4}
        displacementScale={8}
        aberrationIntensity={0}
        className={GLASS}
        style={{ position: 'absolute', top: '50%', left: '50%' }}
      >
        <div className="grid place-items-center text-ink" style={{ width, height }}>
          {glass}
        </div>
      </LiquidGlass>
      <span aria-hidden className={`pointer-events-none absolute inset-0 rounded-full ${RIM}`} />
      {children}
    </div>
  );
}
