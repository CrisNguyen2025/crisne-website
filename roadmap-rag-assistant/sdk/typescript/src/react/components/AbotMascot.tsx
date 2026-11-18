import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AbotMascotHeadPaths } from "./abotMascotPaths";

export type MascotState = "idle" | "thinking" | "speaking" | "happy" | "error";
type PokeMood = "none" | "happy" | "wink";

export interface AbotMascotProps {
  state?: MascotState;
  size?: number;
  showShadow?: boolean;
  interactive?: boolean;
  enablePoke?: boolean;
  className?: string;
}

const LEFT_EYE_X = 108.5;
const RIGHT_EYE_X = 176.5;
const EYE_Y = 165.8;

export function AbotMascot({
  state = "idle",
  size = 32,
  showShadow = false,
  interactive = true,
  enablePoke = false,
  className = "",
}: AbotMascotProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<SVGGElement | null>(null);
  const headRef = useRef<SVGGElement | null>(null);
  const shadowRef = useRef<SVGEllipseElement | null>(null);
  const leftPupilRef = useRef<SVGGElement | null>(null);
  const rightPupilRef = useRef<SVGGElement | null>(null);
  const leftLidRef = useRef<SVGRectElement | null>(null);
  const rightLidRef = useRef<SVGRectElement | null>(null);
  const mouthRef = useRef<SVGEllipseElement | null>(null);

  const [pokeMood, setPokeMood] = useState<PokeMood>("none");
  const pokeMoodRef = useRef<PokeMood>("none");
  const pokeCountRef = useRef(0);
  const pokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopStartRef = useRef(-1);
  const hopDirRef = useRef(1);
  const isHoveredRef = useRef(false);
  const pointerTargetRef = useRef({ x: 0, y: 0, active: false });
  const stateRef = useRef<MascotState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pokeMoodRef.current = pokeMood;
  }, [pokeMood]);

  const triggerPoke = useCallback(() => {
    if (!enablePoke) return;
    pokeCountRef.current += 1;
    hopDirRef.current = pokeCountRef.current % 2 === 0 ? -1 : 1;
    hopStartRef.current = performance.now();

    const nextMood: PokeMood =
      pokeCountRef.current % 2 === 0 ? "wink" : "happy";
    setPokeMood(nextMood);

    if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = setTimeout(() => {
      setPokeMood("none");
    }, 1350);
  }, [enablePoke]);

  useEffect(() => {
    return () => {
      if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!interactive || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      if (Math.hypot(dx, dy) > 680) {
        pointerTargetRef.current.active = false;
        return;
      }
      const maxRange = 220;
      pointerTargetRef.current = {
        x: Math.max(-1, Math.min(1, dx / maxRange)),
        y: Math.max(-1, Math.min(1, dy / maxRange)),
        active: true,
      };
    };

    const handlePointerLeave = () => {
      pointerTargetRef.current.active = false;
    };

    if (interactive) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    }

    let rafId = 0;
    let curEyeX = 0;
    let curEyeY = 0;
    let curTilt = 0;
    let curShiftX = 0;
    let curShiftY = 0;
    let curHoverScale = 1;
    let wanderX = 0;
    let wanderY = 0;
    let nextWanderAt = performance.now() + 1800;
    let nextBlinkAt = performance.now() + 2200 + Math.random() * 2400;
    let blinkStartAt = -1;
    let pendingDoubleBlink = false;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.06);
      lastTime = now;
      const t = now / 1000;
      const mood = pokeMoodRef.current;
      const mode: MascotState = mood !== "none" ? "happy" : stateRef.current;

      if (now >= nextWanderAt) {
        if (Math.random() < 0.35) {
          wanderX = 0;
          wanderY = 0;
        } else {
          wanderX = (Math.random() * 2 - 1) * 0.75;
          wanderY = (Math.random() * 2 - 1) * 0.52;
        }
        nextWanderAt = now + 1600 + Math.random() * 2400;
      }

      if (blinkStartAt < 0 && now >= nextBlinkAt && mode !== "happy") {
        blinkStartAt = now;
        pendingDoubleBlink = !pendingDoubleBlink && Math.random() < 0.22;
      }

      let blinkAmount = 0;
      if (blinkStartAt >= 0) {
        const elapsed = (now - blinkStartAt) / 170;
        if (elapsed >= 1) {
          blinkStartAt = -1;
          nextBlinkAt = pendingDoubleBlink
            ? now + 140
            : now + 2400 + Math.random() * 3200;
          if (pendingDoubleBlink) pendingDoubleBlink = false;
        } else {
          blinkAmount = Math.sin(elapsed * Math.PI);
        }
      }

      let targetX = 0;
      let targetY = 0;
      let targetTilt = 0;
      let bobY = Math.sin(t * 2.1) * 2.4;
      let mouthOpen = isHoveredRef.current && enablePoke ? 0.28 : 0;

      if (mode === "thinking") {
        targetX = Math.sin(t * 2.4) * 0.85;
        targetY = -0.68 + Math.cos(t * 1.8) * 0.18;
        targetTilt = -3.8 + Math.sin(t * 1.6) * 1.5;
        bobY = Math.sin(t * 3.2) * 2.8;
      } else if (mode === "speaking") {
        const ptr = pointerTargetRef.current;
        targetX = ptr.active ? ptr.x * 0.65 : Math.sin(t * 1.9) * 0.35;
        targetY = ptr.active ? ptr.y * 0.5 : 0.08;
        targetTilt = Math.sin(t * 4.5) * 2;
        bobY = Math.sin(t * 5.2) * 2.6;
        mouthOpen = 0.35 + Math.abs(Math.sin(t * 9.5)) * 0.65;
      } else if (mode === "error") {
        targetX = Math.sin(t * 8) * Math.exp(-((t % 2) * 2.5)) * 0.5;
        targetY = 0.35;
        targetTilt = -2.4;
        blinkAmount = Math.max(blinkAmount, 0.28);
      } else if (mode === "happy") {
        const ptr = pointerTargetRef.current;
        targetX = ptr.active ? ptr.x * 0.7 : 0;
        targetY = -0.15;
        targetTilt =
          mood !== "none"
            ? hopDirRef.current * 6.5 * Math.cos(t * 6)
            : Math.sin(t * 7) * 3.2;
        mouthOpen = 0.55;
      } else {
        const ptr = pointerTargetRef.current;
        targetX = ptr.active ? ptr.x : wanderX;
        targetY = ptr.active ? ptr.y : wanderY;
        targetTilt = targetX * 6.8;
      }

      let hopY = 0;
      let squashX = 1;
      let squashY = 1;
      let hopSpin = 0;
      if (hopStartRef.current >= 0) {
        const hp = (now - hopStartRef.current) / 560;
        if (hp >= 1) {
          hopStartRef.current = -1;
        } else if (hp < 0.14) {
          const p = hp / 0.14;
          hopY = p * 5;
          squashX = 1 + p * 0.09;
          squashY = 1 - p * 0.09;
        } else if (hp < 0.74) {
          const p = (hp - 0.14) / 0.6;
          const arc = Math.sin(p * Math.PI);
          hopY = -arc * 38;
          squashX = 1 - arc * 0.05;
          squashY = 1 + arc * 0.07;
          hopSpin = arc * 9 * hopDirRef.current;
        } else {
          const p = (hp - 0.74) / 0.26;
          const settle = Math.sin(p * Math.PI) * (1 - p);
          hopY = settle * 4;
          squashX = 1 + settle * 0.06;
          squashY = 1 - settle * 0.06;
        }
      }

      const damp = 1 - Math.exp(-dt * 12);
      curEyeX += (targetX * 6.2 - curEyeX) * damp;
      curEyeY += (targetY * 4.2 - curEyeY) * damp;
      curTilt += (targetTilt + hopSpin - curTilt) * damp;
      curShiftX += (targetX * 6.5 - curShiftX) * damp;
      curShiftY += (targetY * 4.0 - curShiftY) * damp;
      const targetHoverScale =
        enablePoke && isHoveredRef.current ? 1.055 : 1;
      curHoverScale += (targetHoverScale - curHoverScale) * damp;

      const totalY = bobY + hopY;
      const sx = (squashX * curHoverScale).toFixed(3);
      const sy = (squashY * curHoverScale).toFixed(3);
      if (stageRef.current) {
        stageRef.current.setAttribute(
          "transform",
          `translate(142.5, ${(255 + totalY).toFixed(2)}) scale(${sx}, ${sy}) translate(-142.5, -255)`
        );
      }
      if (shadowRef.current) {
        const shadowScale = Math.max(0.55, 1 + totalY / 85);
        shadowRef.current.setAttribute("rx", (68 * shadowScale).toFixed(1));
        shadowRef.current.setAttribute(
          "opacity",
          Math.max(0.22, shadowScale * 0.95).toFixed(2)
        );
      }
      if (headRef.current) {
        headRef.current.setAttribute(
          "transform",
          `translate(${curShiftX.toFixed(2)}, ${curShiftY.toFixed(2)}) rotate(${curTilt.toFixed(2)}, 142.5, 150)`
        );
      }
      if (leftPupilRef.current) {
        leftPupilRef.current.setAttribute(
          "transform",
          `translate(${(LEFT_EYE_X + curEyeX).toFixed(2)}, ${(EYE_Y + curEyeY).toFixed(2)})`
        );
      }
      if (rightPupilRef.current) {
        rightPupilRef.current.setAttribute(
          "transform",
          `translate(${(RIGHT_EYE_X + curEyeX).toFixed(2)}, ${(EYE_Y + curEyeY).toFixed(2)})`
        );
      }
      const lidY = (136 + blinkAmount * 17).toFixed(2);
      if (leftLidRef.current) leftLidRef.current.setAttribute("y", lidY);
      if (rightLidRef.current) rightLidRef.current.setAttribute("y", lidY);

      if (mouthRef.current) {
        if (mouthOpen > 0.05) {
          mouthRef.current.setAttribute("opacity", "1");
          mouthRef.current.setAttribute(
            "rx",
            (6.2 + mouthOpen * 2.8).toFixed(2)
          );
          mouthRef.current.setAttribute(
            "ry",
            (1.1 + mouthOpen * 2.6).toFixed(2)
          );
        } else {
          mouthRef.current.setAttribute("opacity", "0");
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      if (interactive) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerleave", handlePointerLeave);
      }
    };
  }, [interactive, enablePoke]);

  const isBothHappy = state === "happy" || pokeMood === "happy";
  const isRightWink = pokeMood === "wink" && state !== "happy";
  const viewBox = showShadow ? "24 2 234 300" : "30 4 222 272";

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      onClick={enablePoke ? triggerPoke : undefined}
      onPointerEnter={
        enablePoke
          ? () => {
              isHoveredRef.current = true;
            }
          : undefined
      }
      onPointerLeave={
        enablePoke
          ? () => {
              isHoveredRef.current = false;
            }
          : undefined
      }
      className={`shrink-0 select-none overflow-visible ${enablePoke ? "cursor-pointer" : ""} ${className}`}
    >
      <defs>
        <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-leye`}>
          <path d="M91 165.5 C95 157, 122 157, 126 165.5 C122 173.5, 95 173.5, 91 165.5 Z" />
        </clipPath>
        <clipPath id={`${uid}-reye`}>
          <path d="M159 165.5 C163 157, 190 157, 194 165.5 C190 173.5, 163 173.5, 159 165.5 Z" />
        </clipPath>
      </defs>

      {showShadow && (
        <ellipse
          ref={shadowRef}
          cx="142"
          cy="288"
          rx="68"
          ry="8.5"
          fill={`url(#${uid}-shadow)`}
        />
      )}

      <g ref={stageRef}>
        <g ref={headRef}>
          <AbotMascotHeadPaths />

          {!isBothHappy ? (
            <g clipPath={`url(#${uid}-leye)`}>
              <rect x="88" y="154" width="42" height="24" fill="#EEF3F8" />
              <g
                ref={leftPupilRef}
                transform={`translate(${LEFT_EYE_X}, ${EYE_Y})`}
              >
                <circle r="8.6" fill="#1D4F80" />
                <circle r="6.8" fill="#367BB8" />
                <circle r="3.9" fill="#101824" />
                <circle cx="-2.6" cy="-2.6" r="2.1" fill="#FFFFFF" />
                <circle
                  cx="2.2"
                  cy="2.4"
                  r="0.9"
                  fill="#FFFFFF"
                  fillOpacity="0.75"
                />
              </g>
              <rect
                ref={leftLidRef}
                x="88"
                y="136"
                width="42"
                height="18"
                fill="#EAA987"
              />
            </g>
          ) : (
            <>
              <ellipse cx="108.5" cy="165.5" rx="19.5" ry="9.8" fill="#F2B899" />
              <path
                d="M94 166.5 Q108.5 155.5 123 166.5"
                fill="none"
                stroke="#26130D"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </>
          )}

          {!isBothHappy && !isRightWink ? (
            <g clipPath={`url(#${uid}-reye)`}>
              <rect x="156" y="154" width="42" height="24" fill="#EEF3F8" />
              <g
                ref={rightPupilRef}
                transform={`translate(${RIGHT_EYE_X}, ${EYE_Y})`}
              >
                <circle r="8.6" fill="#1D4F80" />
                <circle r="6.8" fill="#367BB8" />
                <circle r="3.9" fill="#101824" />
                <circle cx="-2.6" cy="-2.6" r="2.1" fill="#FFFFFF" />
                <circle
                  cx="2.2"
                  cy="2.4"
                  r="0.9"
                  fill="#FFFFFF"
                  fillOpacity="0.75"
                />
              </g>
              <rect
                ref={rightLidRef}
                x="156"
                y="136"
                width="42"
                height="18"
                fill="#EAA987"
              />
            </g>
          ) : (
            <>
              <ellipse cx="176.5" cy="165.5" rx="19.5" ry="9.8" fill="#F2B899" />
              <path
                d="M162 166.5 Q176.5 155.5 191 166.5"
                fill="none"
                stroke="#26130D"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </>
          )}

          <ellipse
            ref={mouthRef}
            cx="142.5"
            cy="222.5"
            rx="7"
            ry="2"
            fill="#3D1E15"
            opacity="0"
          />
        </g>
      </g>
    </svg>
  );
}
