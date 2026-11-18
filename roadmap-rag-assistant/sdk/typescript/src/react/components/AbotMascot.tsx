import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AbotMascotHeadPaths } from "./abotMascotPaths";

export type MascotState = "idle" | "thinking" | "speaking" | "happy" | "error";
type PokeMood = "none" | "cool" | "joy" | "ai";

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
  const leftGlintRef = useRef<SVGCircleElement | null>(null);
  const rightGlintRef = useRef<SVGCircleElement | null>(null);
  const leftHudRef = useRef<SVGCircleElement | null>(null);
  const rightHudRef = useRef<SVGCircleElement | null>(null);
  const leftLidRef = useRef<SVGRectElement | null>(null);
  const rightLidRef = useRef<SVGRectElement | null>(null);
  const leftBrowRef = useRef<SVGGElement | null>(null);
  const rightBrowRef = useRef<SVGGElement | null>(null);
  const mouthRef = useRef<SVGEllipseElement | null>(null);
  const smirkRef = useRef<SVGPathElement | null>(null);
  const sparklesRef = useRef<SVGGElement | null>(null);

  const [pokeMood, setPokeMood] = useState<PokeMood>("none");
  const pokeMoodRef = useRef<PokeMood>("none");
  const pokeCountRef = useRef(0);
  const pokeStartRef = useRef(0);
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
    const cycle = pokeCountRef.current % 3;
    const nextMood: PokeMood =
      cycle === 1 ? "cool" : cycle === 2 ? "joy" : "ai";

    hopDirRef.current = pokeCountRef.current % 2 === 0 ? -1 : 1;
    const now = performance.now();
    hopStartRef.current = now;
    pokeStartRef.current = now;
    setPokeMood(nextMood);

    if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = setTimeout(() => {
      setPokeMood("none");
    }, 1500);
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
      const maxRange = 210;
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
    let curLBrowY = 0;
    let curLBrowRot = 0;
    let curRBrowY = 0;
    let curRBrowRot = 0;
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
      const baseState = stateRef.current;

      if (now >= nextWanderAt) {
        if (Math.random() < 0.35) {
          wanderX = 0;
          wanderY = 0;
        } else {
          wanderX = (Math.random() * 2 - 1) * 0.72;
          wanderY = (Math.random() * 2 - 1) * 0.48;
        }
        nextWanderAt = now + 1600 + Math.random() * 2400;
      }

      const suppressBlink =
        mood === "joy" || mood === "ai" || baseState === "happy";
      if (blinkStartAt < 0 && now >= nextBlinkAt && !suppressBlink) {
        blinkStartAt = now;
        pendingDoubleBlink = !pendingDoubleBlink && Math.random() < 0.22;
      }

      let blinkAmount = 0;
      if (blinkStartAt >= 0) {
        const elapsed = (now - blinkStartAt) / 165;
        if (elapsed >= 1) {
          blinkStartAt = -1;
          nextBlinkAt = pendingDoubleBlink
            ? now + 135
            : now + 2400 + Math.random() * 3200;
          if (pendingDoubleBlink) pendingDoubleBlink = false;
        } else {
          blinkAmount = Math.sin(elapsed * Math.PI);
        }
      }

      const ptr = pointerTargetRef.current;
      const hovered = enablePoke && isHoveredRef.current;

      let targetX = ptr.active ? ptr.x : wanderX;
      let targetY = ptr.active ? ptr.y : wanderY;
      let targetTilt = targetX * 6.8;
      let bobY = Math.sin(t * 2.1) * 2.4;
      let mouthOpen = 0;
      let showSmirk = hovered && mood === "none" && baseState === "idle";
      let targetLBrowY = targetY * 2.2 - (hovered ? 2.4 : 0);
      let targetRBrowY = targetY * 2.2 - (hovered ? 2.4 : 0);
      let targetLBrowRot = 0;
      let targetRBrowRot = 0;

      if (mood === "cool") {
        targetX = ptr.active ? ptr.x * 0.55 + 0.22 : 0.25;
        targetY = -0.14;
        targetTilt = -3.8 + Math.sin(t * 4) * 1.2;
        targetLBrowY = 1.4;
        targetLBrowRot = 3.5;
        targetRBrowY = -5.4;
        targetRBrowRot = -6.8;
        showSmirk = true;
      } else if (mood === "joy") {
        targetX = 0;
        targetY = -0.15;
        targetTilt = Math.sin(t * 6.5) * 3.5;
        targetLBrowY = -3.8;
        targetLBrowRot = -2.2;
        targetRBrowY = -3.8;
        targetRBrowRot = 2.2;
        mouthOpen = 0.52;
        showSmirk = false;
      } else if (mood === "ai") {
        targetX = ptr.active ? ptr.x * 0.7 : Math.sin(t * 3.2) * 0.35;
        targetY = ptr.active ? ptr.y * 0.5 : -0.18;
        targetTilt = Math.sin(t * 5) * 2.2;
        targetLBrowY = -2.8;
        targetLBrowRot = 1.8;
        targetRBrowY = -2.8;
        targetRBrowRot = -1.8;
        showSmirk = true;
      } else if (baseState === "thinking") {
        targetX = Math.sin(t * 2.3) * 0.82;
        targetY = -0.62 + Math.cos(t * 1.8) * 0.16;
        targetTilt = -3.6 + Math.sin(t * 1.6) * 1.4;
        bobY = Math.sin(t * 3.2) * 2.7;
        targetLBrowY = 0.8;
        targetLBrowRot = 2.5;
        targetRBrowY = -4.2;
        targetRBrowRot = -5.0;
        showSmirk = false;
      } else if (baseState === "speaking") {
        targetX = ptr.active ? ptr.x * 0.65 : Math.sin(t * 1.9) * 0.35;
        targetY = ptr.active ? ptr.y * 0.5 : 0.06;
        targetTilt = Math.sin(t * 4.5) * 2;
        bobY = Math.sin(t * 5.2) * 2.5;
        const talkBeat = Math.abs(Math.sin(t * 9.5));
        mouthOpen = 0.32 + talkBeat * 0.68;
        targetLBrowY = -1.2 - talkBeat * 1.8;
        targetRBrowY = -1.2 - talkBeat * 1.8;
        showSmirk = false;
      } else if (baseState === "error") {
        targetX = Math.sin(t * 8) * Math.exp(-((t % 2) * 2.5)) * 0.5;
        targetY = 0.32;
        targetTilt = -2.4;
        targetLBrowY = 1.2;
        targetLBrowRot = -5.5;
        targetRBrowY = 1.2;
        targetRBrowRot = 5.5;
        blinkAmount = Math.max(blinkAmount, 0.25);
        showSmirk = false;
      } else if (baseState === "happy") {
        targetX = 0;
        targetY = -0.15;
        targetTilt = Math.sin(t * 6.5) * 3;
        targetLBrowY = -3.4;
        targetRBrowY = -3.4;
        mouthOpen = 0.45;
        showSmirk = false;
      }

      let hopY = 0;
      let squashX = 1;
      let squashY = 1;
      let hopSpin = 0;
      if (hopStartRef.current >= 0) {
        const hp = (now - hopStartRef.current) / 540;
        if (hp >= 1) {
          hopStartRef.current = -1;
        } else if (hp < 0.14) {
          const p = hp / 0.14;
          hopY = p * 5;
          squashX = 1 + p * 0.08;
          squashY = 1 - p * 0.08;
        } else if (hp < 0.74) {
          const p = (hp - 0.14) / 0.6;
          const arc = Math.sin(p * Math.PI);
          const peak = mood === "cool" ? 24 : 36;
          hopY = -arc * peak;
          squashX = 1 - arc * 0.05;
          squashY = 1 + arc * 0.065;
          hopSpin = arc * 7.5 * hopDirRef.current;
        } else {
          const p = (hp - 0.74) / 0.26;
          const settle = Math.sin(p * Math.PI) * (1 - p);
          hopY = settle * 3.5;
          squashX = 1 + settle * 0.05;
          squashY = 1 - settle * 0.05;
        }
      }

      const damp = 1 - Math.exp(-dt * 12.5);
      curEyeX += (targetX * 6.2 - curEyeX) * damp;
      curEyeY += (targetY * 4.2 - curEyeY) * damp;
      curTilt += (targetTilt + hopSpin - curTilt) * damp;
      curShiftX += (targetX * 6.4 - curShiftX) * damp;
      curShiftY += (targetY * 3.8 - curShiftY) * damp;
      curLBrowY += (targetLBrowY - curLBrowY) * damp;
      curLBrowRot += (targetLBrowRot - curLBrowRot) * damp;
      curRBrowY += (targetRBrowY - curRBrowY) * damp;
      curRBrowRot += (targetRBrowRot - curRBrowRot) * damp;
      const targetHoverScale = hovered ? 1.055 : 1;
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
        const shadowScale = Math.max(0.56, 1 + totalY / 85);
        shadowRef.current.setAttribute("rx", (68 * shadowScale).toFixed(1));
        shadowRef.current.setAttribute(
          "opacity",
          Math.max(0.24, shadowScale * 0.95).toFixed(2)
        );
      }
      if (headRef.current) {
        const yawCompress = (1 - Math.abs(curShiftX) * 0.004).toFixed(3);
        headRef.current.setAttribute(
          "transform",
          `translate(${curShiftX.toFixed(2)}, ${curShiftY.toFixed(2)}) rotate(${curTilt.toFixed(2)}, 142.5, 150) translate(142.5, 150) scale(${yawCompress}, 1) translate(-142.5, -150)`
        );
      }

      const browParallaxX = (curEyeX * 0.35).toFixed(2);
      if (leftBrowRef.current) {
        leftBrowRef.current.setAttribute(
          "transform",
          `translate(${browParallaxX}, ${curLBrowY.toFixed(2)}) rotate(${curLBrowRot.toFixed(2)}, 108, 141)`
        );
      }
      if (rightBrowRef.current) {
        rightBrowRef.current.setAttribute(
          "transform",
          `translate(${browParallaxX}, ${curRBrowY.toFixed(2)}) rotate(${curRBrowRot.toFixed(2)}, 177, 141)`
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

      const glintX = (-2.7 - curEyeX * 0.22).toFixed(2);
      const glintY = (-2.6 - curEyeY * 0.22).toFixed(2);
      if (leftGlintRef.current) {
        leftGlintRef.current.setAttribute("cx", glintX);
        leftGlintRef.current.setAttribute("cy", glintY);
      }
      if (rightGlintRef.current) {
        rightGlintRef.current.setAttribute("cx", glintX);
        rightGlintRef.current.setAttribute("cy", glintY);
      }

      const hudRot = ((t * 95) % 360).toFixed(1);
      if (leftHudRef.current) {
        leftHudRef.current.setAttribute("transform", `rotate(${hudRot})`);
      }
      if (rightHudRef.current) {
        rightHudRef.current.setAttribute("transform", `rotate(-${hudRot})`);
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
            (1.1 + mouthOpen * 2.5).toFixed(2)
          );
        } else {
          mouthRef.current.setAttribute("opacity", "0");
        }
      }

      if (smirkRef.current) {
        smirkRef.current.setAttribute(
          "opacity",
          showSmirk && mouthOpen <= 0.05 ? "1" : "0"
        );
      }

      if (sparklesRef.current) {
        if (mood === "joy" || mood === "ai") {
          const sp = Math.min(1, (now - pokeStartRef.current) / 1450);
          const fade = sp < 0.2 ? sp / 0.2 : Math.max(0, 1 - (sp - 0.2) / 0.8);
          const lift = (-sp * 14).toFixed(2);
          sparklesRef.current.setAttribute("opacity", fade.toFixed(2));
          sparklesRef.current.setAttribute(
            "transform",
            `translate(0, ${lift})`
          );
        } else {
          sparklesRef.current.setAttribute("opacity", "0");
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

  const showHappyEyes = state === "happy" || pokeMood === "joy";
  const isAiMode =
    pokeMood === "ai" || (state === "thinking" && pokeMood === "none");
  const pupilRadius = pokeMood === "ai" ? 3.3 : pokeMood === "cool" ? 3.6 : 3.9;
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
          <stop
            offset="0%"
            stopColor={pokeMood === "ai" ? "#0EA5E9" : "#000000"}
            stopOpacity={pokeMood === "ai" ? "0.28" : "0.22"}
          />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${uid}-iris`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#163A66" />
          <stop offset="55%" stopColor="#2B6CB0" />
          <stop offset="100%" stopColor="#58A6FF" />
        </linearGradient>
        <linearGradient
          id={`${uid}-iris-ai`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="50%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#E0F2FE" />
        </linearGradient>
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

          {!showHappyEyes ? (
            <>
              <g clipPath={`url(#${uid}-leye)`}>
                <rect x="88" y="154" width="42" height="24" fill="#F1F5F9" />
                <g
                  ref={leftPupilRef}
                  transform={`translate(${LEFT_EYE_X}, ${EYE_Y})`}
                >
                  <circle
                    r="8.8"
                    fill={isAiMode ? "#0369A1" : "#153256"}
                  />
                  <circle
                    r="7.3"
                    fill={`url(#${uid}-${isAiMode ? "iris-ai" : "iris"})`}
                  />
                  {isAiMode && (
                    <circle
                      ref={leftHudRef}
                      r="5.5"
                      fill="none"
                      stroke="#E0F2FE"
                      strokeWidth="0.9"
                      strokeDasharray="4 2.5"
                    />
                  )}
                  <circle
                    r={pupilRadius}
                    fill={isAiMode ? "#082F49" : "#0D1522"}
                  />
                  <circle
                    ref={leftGlintRef}
                    cx="-2.7"
                    cy="-2.6"
                    r="2.2"
                    fill="#FFFFFF"
                  />
                  <circle
                    cx="2.4"
                    cy="2.5"
                    r="1"
                    fill="#FFFFFF"
                    fillOpacity="0.82"
                  />
                </g>
                <path
                  d="M89 156 Q108.5 162 128 156 L128 152 L89 152 Z"
                  fill="#0F172A"
                  fillOpacity="0.14"
                />
                <rect
                  ref={leftLidRef}
                  x="88"
                  y="136"
                  width="42"
                  height="18"
                  fill="#EAA987"
                />
              </g>

              <g clipPath={`url(#${uid}-reye)`}>
                <rect x="156" y="154" width="42" height="24" fill="#F1F5F9" />
                <g
                  ref={rightPupilRef}
                  transform={`translate(${RIGHT_EYE_X}, ${EYE_Y})`}
                >
                  <circle
                    r="8.8"
                    fill={isAiMode ? "#0369A1" : "#153256"}
                  />
                  <circle
                    r="7.3"
                    fill={`url(#${uid}-${isAiMode ? "iris-ai" : "iris"})`}
                  />
                  {isAiMode && (
                    <circle
                      ref={rightHudRef}
                      r="5.5"
                      fill="none"
                      stroke="#E0F2FE"
                      strokeWidth="0.9"
                      strokeDasharray="4 2.5"
                    />
                  )}
                  <circle
                    r={pupilRadius}
                    fill={isAiMode ? "#082F49" : "#0D1522"}
                  />
                  <circle
                    ref={rightGlintRef}
                    cx="-2.7"
                    cy="-2.6"
                    r="2.2"
                    fill="#FFFFFF"
                  />
                  <circle
                    cx="2.4"
                    cy="2.5"
                    r="1"
                    fill="#FFFFFF"
                    fillOpacity="0.82"
                  />
                </g>
                <path
                  d="M157 156 Q176.5 162 196 156 L196 152 L157 152 Z"
                  fill="#0F172A"
                  fillOpacity="0.14"
                />
                <rect
                  ref={rightLidRef}
                  x="156"
                  y="136"
                  width="42"
                  height="18"
                  fill="#EAA987"
                />
              </g>
            </>
          ) : (
            <>
              <ellipse cx="108.5" cy="165.5" rx="19.5" ry="9.8" fill="#F3BB9E" />
              <ellipse cx="176.5" cy="165.5" rx="19.5" ry="9.8" fill="#F3BB9E" />
              <path
                d="M93.5 166.5 Q108.5 155 123.5 166.5"
                fill="none"
                stroke="#28140E"
                strokeWidth="4.2"
                strokeLinecap="round"
              />
              <path
                d="M161.5 166.5 Q176.5 155 191.5 166.5"
                fill="none"
                stroke="#28140E"
                strokeWidth="4.2"
                strokeLinecap="round"
              />
            </>
          )}

          <g ref={leftBrowRef}>
            <path
              d="M81 144.5 C86 136.5, 101 134, 129 138.5 C132 139.2, 133 142.5, 131 146.5 C129 149, 124 149.2, 118 147.8 C104 145, 91 145.2, 82.5 147.5 C80.8 147.8, 80.2 146, 81 144.5 Z"
              fill="#2E1610"
            />
          </g>
          <g ref={rightBrowRef}>
            <path
              d="M204 144.5 C199 136.5, 184 134, 156 138.5 C153 139.2, 152 142.5, 154 146.5 C156 149, 161 149.2, 167 147.8 C181 145, 194 145.2, 202.5 147.5 C204.2 147.8, 204.8 146, 204 144.5 Z"
              fill="#2E1610"
            />
          </g>

          <path
            ref={smirkRef}
            d="M133 222.5 Q143.5 225.5 153 220.5"
            fill="none"
            stroke="#3D1E15"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0"
          />

          <ellipse
            ref={mouthRef}
            cx="142.5"
            cy="222.5"
            rx="7"
            ry="2"
            fill="#3D1E15"
            opacity="0"
          />

          <g ref={sparklesRef} opacity="0">
            <path
              d="M226 52 L228.5 59.5 L236 62 L228.5 64.5 L226 72 L223.5 64.5 L216 62 L223.5 59.5 Z"
              fill={pokeMood === "ai" ? "#38BDF8" : "#F59E0B"}
            />
            <path
              d="M55 68 L57 74 L63 76 L57 78 L55 84 L53 78 L47 76 L53 74 Z"
              fill="#38BDF8"
            />
            <circle
              cx="238"
              cy="82"
              r="2.4"
              fill={pokeMood === "ai" ? "#BAE6FD" : "#FBBF24"}
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
