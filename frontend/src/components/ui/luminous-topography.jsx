import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const MOTIQ_TOKENS = "@layer motiq{:root{--motiq-accent:#315fea;--motiq-bg:#f7f9fc;--motiq-fg:#101828;--motiq-fg-secondary:#344054;--motiq-muted:#667085;--motiq-surface:#ffffff}}";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useVisibilityPause(ref, { threshold = 0.1 } = {}) {
  const [onScreen, setOnScreen] = React.useState(true);
  const [tabVisible, setTabVisible] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((e) => e.isIntersecting)),
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  React.useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState !== "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return onScreen && tabVisible;
}

const W = 1200;
const H = 760;
const MARGIN = 96;
const STEP = 60;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function toPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${round1(pts[0][0])} ${round1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${round1(c1x)} ${round1(c1y)}, ${round1(c2x)} ${round1(c2y)}, ${round1(p2[0])} ${round1(p2[1])}`;
  }
  return d;
}

function buildGeometry(seed, depth, density, drift, focals) {
  const layers = [];
  const nLayers = clamp(Math.round(depth), 1, 4);
  for (let li = 0; li < nLayers; li++) {
    const rng = makeRng((seed >>> 0) * 2654435761 + li * 40503 + 17);
    const harmonics = Array.from({ length: 3 }, () => ({
      f: 0.0032 + rng() * 0.0052,
      a: (5 + rng() * 9) * (1 - li * 0.12),
      p: rng() * Math.PI * 2,
      g: (rng() - 0.5) * 0.012,
    }));
    const count = Math.max(5, Math.round((8 + density * 6) * (1 - li * 0.07)));
    const span = H + MARGIN * 2;
    const spacing = span / count;
    const contours = [];
    for (let k = 0; k < count; k++) {
      const baseY = -MARGIN + spacing * (k + 0.5) + (rng() - 0.5) * 7;
      const pts = [];
      for (let x = -MARGIN; x <= W + MARGIN; x += STEP) {
        let dsp = 0;
        for (const f of focals) {
          const dx = x - f.x;
          const ex = Math.exp(-(dx * dx) / (2 * f.sx * f.sx));
          const dy = baseY - f.y;
          const vy = Math.exp(-(dy * dy) / (2 * f.sy * f.sy));
          const dir = dy >= 0 ? 1 : -1;
          dsp += f.amp * ex * (0.52 + 0.48 * vy * dir) * (1 - li * 0.14);
        }
        for (const h of harmonics) {
          dsp += h.a * Math.sin(x * h.f + h.p + baseY * h.g);
        }
        pts.push([x, baseY - dsp]);
      }
      contours.push({ d: toPath(pts), o: round1(clamp(0.46 - li * 0.12, 0.12, 0.5)) });
    }
    const dir = li % 2 === 0 ? -1 : 1;
    layers.push({
      contours,
      dx: round1(dir * (18 - li * 4) * drift),
      dy: round1(-(7 - li * 1.5) * drift),
      dur: round1(16 + li * 6 + (li === 0 ? 0 : 2)),
    });
  }
  return { layers };
}

function normalizeFocals(focalPoint) {
  const list = Array.isArray(focalPoint) ? focalPoint : [focalPoint ?? { x: 0.72, y: 0.34 }];
  return list.map((f, i) => ({
    x: f.x * W, y: f.y * H,
    amp: 74 - i * 12, sx: 210 - i * 26, sy: 150 - i * 18,
  }));
}

function LuminousTopographyBase({
  density = 1, depth = 3, drift = 1, intensity = 1,
  focalPoint, safeArea = { x: 0.04, y: 0.12, w: 0.56, h: 0.76 },
  accent = "var(--motiq-accent,#695cff)", lineWidth = 1.4, seed = 1,
  pauseWhenHidden = true, interactive = false, reducedMotion,
  className, style, children, onPointerMove, ...props
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const cls = `mk-lt-${uid}`;
  const bgRef = React.useRef(null);
  const systemReduced = useReducedMotion();
  const staticMode = reducedMotion === true;
  const active = useVisibilityPause(bgRef, { threshold: 0.01 });
  const paused = pauseWhenHidden && !active;
  const focals = React.useMemo(() => normalizeFocals(focalPoint), [focalPoint]);
  const geom = React.useMemo(
    () => buildGeometry(seed, depth, density, staticMode ? 0 : drift, focals),
    [seed, depth, density, drift, staticMode, focals],
  );

  React.useEffect(() => {
    const el = bgRef.current;
    if (!el || !interactive || staticMode) return;
    let raf = 0;
    let nx = W / 2, ny = H / 2;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--lt-cx", String(round1(nx)));
      el.style.setProperty("--lt-cy", String(round1(ny)));
      el.style.setProperty("--lt-cursor", "1");
    };
    const onMove = (e) => {
      if (systemReduced) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      nx = ((e.clientX - r.left) / r.width) * W;
      ny = ((e.clientY - r.top) / r.height) * H;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => el.style.setProperty("--lt-cursor", "0");
    const host = el.parentElement ?? el;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive, staticMode, systemReduced]);

  const primary = focals[0] ?? { x: W * 0.72, y: H * 0.34 };
  const sa = {
    cx: (safeArea.x + safeArea.w / 2) * W,
    cy: (safeArea.y + safeArea.h / 2) * H,
    rx: (safeArea.w / 2) * W * 1.18,
    ry: (safeArea.h / 2) * H * 1.18,
  };
  const dimStroke = `color-mix(in oklab, var(--motiq-fg) ${round1(clamp(22 * intensity, 8, 40))}%, transparent)`;

  const css = `
.${cls}{position:absolute;inset:0;}
.${cls} svg{width:100%;height:100%;display:block;}
.${cls} .mk-lt-layer{transform-box:fill-box;}
.${cls} .mk-lt-dim path,.${cls} .mk-lt-bright path{fill:none;vector-effect:non-scaling-stroke;}
.${cls} .mk-lt-bright{filter:drop-shadow(0 0 3px color-mix(in oklab,${accent} 60%,transparent));}
.${cls}.mk-lt-animated .mk-lt-layer{animation:${cls}-drift var(--dur,18s) ease-in-out infinite alternate;will-change:transform;}
.${cls}.mk-lt-animated .mk-lt-sweep{animation:${cls}-sweep ${round1(13+depth)}s ease-in-out infinite alternate;will-change:transform;}
@keyframes ${cls}-drift{from{transform:translate3d(0,0,0);}to{transform:translate3d(var(--dx,0px),var(--dy,0px),0);}}
@keyframes ${cls}-sweep{from{transform:translateX(-330px);}to{transform:translateX(330px);}}
.${cls}[data-paused="true"] .mk-lt-layer,.${cls}[data-paused="true"] .mk-lt-sweep{animation-play-state:paused!important;}
@media(prefers-reduced-motion:reduce){.${cls} .mk-lt-layer,.${cls} .mk-lt-sweep{animation:none!important;}}
`.trim();

  return (
    <div className={cn("relative isolate overflow-hidden", className)} style={style} onPointerMove={onPointerMove} {...props}>
      <div
        ref={bgRef}
        aria-hidden="true"
        data-paused={paused ? "true" : "false"}
        className={cn("pointer-events-none absolute inset-0 overflow-hidden", cls, !staticMode && "mk-lt-animated")}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="presentation">
          <defs>
            <radialGradient id={`wash-${uid}`} cx={`${(primary.x / W) * 100}%`} cy={`${(primary.y / H) * 100}%`} r="72%">
              <stop offset="0%" stopColor={accent} stopOpacity={round1(0.16 * intensity)} />
              <stop offset="55%" stopColor={accent} stopOpacity={round1(0.05 * intensity)} />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`lightgrad-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`safegrad-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(26,26,26)" />
              <stop offset="62%" stopColor="rgb(120,120,120)" />
              <stop offset="100%" stopColor="#fff" />
            </radialGradient>
            <mask id={`safe-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <rect x="0" y="0" width={W} height={H} fill="#fff" />
              <ellipse cx={round1(sa.cx)} cy={round1(sa.cy)} rx={round1(sa.rx)} ry={round1(sa.ry)} fill={`url(#safegrad-${uid})`} />
            </mask>
            <mask id={`light-${uid}`} maskUnits="userSpaceOnUse" x={-W} y={-H} width={W * 3} height={H * 3}>
              <g className="mk-lt-sweep">
                <ellipse cx={W / 2} cy={H * 0.5} rx={W * 0.42} ry={H * 0.72} fill={`url(#lightgrad-${uid})`} />
              </g>
              {interactive && (
                <ellipse
                  className="mk-lt-cursor"
                  cx="0" cy="0" rx={W * 0.2} ry={W * 0.2}
                  fill={`url(#lightgrad-${uid})`}
                  opacity="calc(var(--lt-cursor,0)*0.9)"
                  style={{ transform: "translate(calc(var(--lt-cx,600)*1px),calc(var(--lt-cy,380)*1px))" }}
                />
              )}
            </mask>
          </defs>
          <rect className="mk-lt-wash" x="0" y="0" width={W} height={H} fill={`url(#wash-${uid})`} />
          <g mask={`url(#safe-${uid})`}>
            {geom.layers.map((layer, li) => (
              <g key={li} className="mk-lt-layer" data-i={li}
                style={{ "--dx": `${layer.dx}px`, "--dy": `${layer.dy}px`, "--dur": `${layer.dur}s`, animationDelay: `${round1(-li * 2.5)}s` }}>
                <g className="mk-lt-dim">
                  {layer.contours.map((c, i) => (
                    <path key={i} d={c.d} stroke={dimStroke} strokeOpacity={c.o}
                      strokeWidth={round1(lineWidth * (1 - li * 0.12))} strokeLinecap="round" />
                  ))}
                </g>
                <g className="mk-lt-bright" mask={`url(#light-${uid})`}>
                  {layer.contours.map((c, i) => (
                    <path key={i} d={c.d} stroke={accent}
                      strokeOpacity={round1(clamp(0.9 * intensity, 0.3, 1))}
                      strokeWidth={round1(lineWidth * (1 - li * 0.08))} strokeLinecap="round" />
                  ))}
                </g>
              </g>
            ))}
          </g>
        </svg>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </div>
      {children != null && <div className="relative z-10">{children}</div>}
    </div>
  );
}

export function LuminousTopography(props) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MOTIQ_TOKENS }} />
      <LuminousTopographyBase {...props} />
    </>
  );
}

export default LuminousTopography;
