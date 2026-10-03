import { ArrowRight } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

/**
 * FlameButton — interactive flame glow effect on hover edges.
 * Adapted for KESA WMS (JSX, no TypeScript, no Next.js).
 *
 * Props:
 *  text         — button label
 *  showArrow    — show ArrowRight icon
 *  height       — button height in px (default 44)
 *  textColor    — text color
 *  borderColor  — border color
 *  href         — navigate URL (optional)
 *  onClick      — click handler (optional)
 *  type         — button type attribute ('button' | 'submit')
 *  disabled     — disabled state
 *  className    — extra Tailwind classes
 *  children     — override text content entirely
 *  flameColor   — 'amber' | 'blue' | 'green' | 'rose' (preset palettes)
 *  fullWidth    — stretch to 100% width
 */
export function FlameButton({
  text = "Masuk",
  showArrow = true,
  height = 44,
  textColor,
  borderColor = "transparent",
  href,
  onClick,
  type = "button",
  disabled = false,
  className = "",
  children,
  flameColor = "amber",
  fullWidth = false,
}) {
  const wrapperRef = useRef(null);
  const [mouseX, setMouseX] = useState(null);
  const [width, setWidth] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [displayOpacity, setDisplayOpacity] = useState(0);
  const targetOpacityRef = useRef(0);

  // Color palettes
  const palettes = {
    amber: {
      hot: "255, 214, 130",
      core: "245, 158, 11",
      edge: "234, 88, 12",
      bg: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%)",
      text: textColor ?? "#1c1008",
    },
    blue: {
      hot: "147, 197, 253",
      core: "59, 130, 246",
      edge: "37, 99, 235",
      bg: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 60%, #1d4ed8 100%)",
      text: textColor ?? "#ffffff",
    },
    green: {
      hot: "167, 243, 208",
      core: "16, 185, 129",
      edge: "5, 150, 105",
      bg: "linear-gradient(135deg, #34d399 0%, #10b981 60%, #059669 100%)",
      text: textColor ?? "#ffffff",
    },
    rose: {
      hot: "254, 205, 211",
      core: "244, 63, 94",
      edge: "225, 29, 72",
      bg: "linear-gradient(135deg, #fb7185 0%, #f43f5e 60%, #e11d48 100%)",
      text: textColor ?? "#ffffff",
    },
  };

  const p = palettes[flameColor] ?? palettes.amber;
  const resolvedText = p.text;

  useEffect(() => {
    const measure = () => {
      if (wrapperRef.current)
        setWidth(wrapperRef.current.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const handleMouseMove = (e) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setMouseX(e.clientX - rect.left);
  };

  const safeMouseX = mouseX ?? width / 2;
  const normX = width ? safeMouseX / width : 0.5;
  const isRightSide = normX >= 0.5;
  const edgeProximity = Math.pow(Math.min(1, Math.abs(normX - 0.5) * 2), 1.6);
  const targetOpacity = isHovering && !disabled ? edgeProximity : 0;

  useEffect(() => {
    targetOpacityRef.current = targetOpacity;
  }, [targetOpacity]);

  useEffect(() => {
    let rafId;
    const tick = () => {
      setDisplayOpacity((prev) => {
        const target = targetOpacityRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.002) return target;
        return prev + diff * 0.15;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const edgePercent = isRightSide ? 88 : 12;

  const handleClick = () => {
    if (disabled) return;
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    onClick?.();
  };

  return (
    <div
      className={`relative inline-block select-none isolate ${fullWidth ? "w-full" : ""} ${className}`}
      ref={wrapperRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Outer flame glow */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          inset: "-6px",
          borderRadius: 9999,
          background: `radial-gradient(ellipse 44% 85% at ${edgePercent}% 50%,
            rgba(${p.hot}, 1) 0%,
            rgba(${p.core}, 0.95) 28%,
            rgba(${p.edge}, 0.5) 50%,
            rgba(${p.edge}, 0.12) 68%,
            transparent 80%)`,
          filter: "blur(7px) saturate(1.4)",
          opacity: displayOpacity,
        }}
      />

      <button
        type={type}
        onClick={handleClick}
        disabled={disabled}
        style={{
          height: `${height}px`,
          border: `1px solid ${borderColor}`,
          borderRadius: 9999,
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          background: disabled
            ? "#e2e8f0"
            : p.bg,
          width: fullWidth ? "100%" : undefined,
          boxShadow: disabled ? "none" : `0 4px 20px rgba(${p.core}, 0.4)`,
          opacity: disabled ? 0.6 : 1,
          transition: "box-shadow 0.2s, opacity 0.2s",
        }}
        className="flex items-center justify-center relative z-10 overflow-hidden font-bold text-sm cursor-pointer gap-2 px-7 focus:outline-none focus-visible:outline-none focus:ring-0 appearance-none active:scale-[0.98] disabled:cursor-not-allowed"
      >
        {/* Inner hover highlight */}
        <div
          className="absolute left-0 top-0 -z-10"
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            opacity: isHovering && !disabled ? 1 : 0,
            transition: "opacity 150ms ease-out",
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 121,
              height: 121,
              left: safeMouseX - 60.5,
              top: "50%",
              transform: "translateY(-50%)",
              background: `radial-gradient(50% 50% at 50% 50%, #FFFFF5 3.5%, rgba(${p.core},1) 26.5%, #FFDA9F 37.5%, rgba(${p.core},0.5) 49%, rgba(${p.edge},0) 92.5%)`,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: 204,
              height: 103,
              left: safeMouseX - 102,
              top: "50%",
              transform: "translateY(-50%)",
              filter: "blur(5px)",
              background: `radial-gradient(43.3% 44.23% at 50% 49.51%, #FFFFF7 29%, #FFFACD 48.5%, rgba(${p.hot},0.6) 60.71%, rgba(214,211,210,0) 100%)`,
            }}
          />
        </div>

        {children ?? (
          <>
            <span style={{ color: disabled ? "#94a3b8" : resolvedText }} className="font-semibold tracking-wide">
              {text}
            </span>
            {showArrow && (
              <ArrowRight
                className="w-4 h-4 flex-shrink-0"
                style={{ color: disabled ? "#94a3b8" : resolvedText }}
                strokeWidth={2.5}
              />
            )}
          </>
        )}
      </button>
    </div>
  );
}

export default FlameButton;
