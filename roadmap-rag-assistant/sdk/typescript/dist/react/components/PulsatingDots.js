"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PulsatingDots = PulsatingDots;
const jsx_runtime_1 = require("react/jsx-runtime");
// Dots that pulse one after another: each grows and brightens, then settles.
// Colour follows `currentColor`. Keyframes live in globals.css (`animate-pulsating-dot`),
// so the SDK keeps no animation dependency; reduced-motion users get a slower pulse.
function PulsatingDots({ dots = 3, className = "" }) {
    const count = Number.isFinite(dots) ? Math.max(1, Math.floor(dots)) : 3;
    return ((0, jsx_runtime_1.jsxs)("span", { role: "status", className: `inline-flex items-center justify-center ${className}`, children: [(0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", className: "inline-flex w-full gap-[16%]", children: Array.from({ length: count }, (_, index) => ((0, jsx_runtime_1.jsx)("span", { className: "inline-block aspect-square grow rounded-full bg-current animate-pulsating-dot", style: { animationDelay: `${index * 0.3}s` } }, index))) }), (0, jsx_runtime_1.jsx)("span", { className: "sr-only", children: "\u0110ang x\u1EED l\u00FD" })] }));
}
