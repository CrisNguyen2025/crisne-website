"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SparklesIcon = SparklesIcon;
exports.PlayIcon = PlayIcon;
exports.ArrowUpIcon = ArrowUpIcon;
exports.StopIcon = StopIcon;
exports.NewChatIcon = NewChatIcon;
exports.CloseIcon = CloseIcon;
exports.CopyIcon = CopyIcon;
exports.CheckIcon = CheckIcon;
exports.CheckCircleIcon = CheckCircleIcon;
exports.ChevronDownIcon = ChevronDownIcon;
exports.ThumbsUpIcon = ThumbsUpIcon;
exports.ThumbsDownIcon = ThumbsDownIcon;
exports.ArrowDownIcon = ArrowDownIcon;
exports.MoreVerticalIcon = MoreVerticalIcon;
exports.AlertTriangleIcon = AlertTriangleIcon;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * Shared outline icon frame: 24×24 viewBox, 1.5 stroke, 16px by default.
 * Paths follow lucide (ISC) so the set stays visually consistent.
 */
function Icon({ className = 'w-4 h-4', children, }) {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", className: `shrink-0 ${className}`, children: children }));
}
function SparklesIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" }), (0, jsx_runtime_1.jsx)("path", { d: "M20 3v4" }), (0, jsx_runtime_1.jsx)("path", { d: "M22 5h-4" })] }));
}
function PlayIcon({ className }) {
    return ((0, jsx_runtime_1.jsx)(Icon, { className: className, children: (0, jsx_runtime_1.jsx)("path", { d: "M7 4.5v15l12-7.5z" }) }));
}
function ArrowUpIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "m5 12 7-7 7 7" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 19V5" })] }));
}
function StopIcon({ className }) {
    return ((0, jsx_runtime_1.jsx)(Icon, { className: className, children: (0, jsx_runtime_1.jsx)("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2", fill: "currentColor" }) }));
}
function NewChatIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), (0, jsx_runtime_1.jsx)("path", { d: "M18.38 2.62a2.12 2.12 0 1 1 3 3L12.37 14.63a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z" })] }));
}
function CloseIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M18 6 6 18" }), (0, jsx_runtime_1.jsx)("path", { d: "m6 6 12 12" })] }));
}
function CopyIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }), (0, jsx_runtime_1.jsx)("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" })] }));
}
function CheckIcon({ className }) {
    return ((0, jsx_runtime_1.jsx)(Icon, { className: className, children: (0, jsx_runtime_1.jsx)("path", { d: "M20 6 9 17l-5-5" }) }));
}
function CheckCircleIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "10" }), (0, jsx_runtime_1.jsx)("path", { d: "m9 12 2 2 4-4" })] }));
}
function ChevronDownIcon({ className }) {
    return ((0, jsx_runtime_1.jsx)(Icon, { className: className, children: (0, jsx_runtime_1.jsx)("path", { d: "m6 9 6 6 6-6" }) }));
}
function ThumbsUpIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M7 10v12" }), (0, jsx_runtime_1.jsx)("path", { d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" })] }));
}
function ThumbsDownIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M17 14V2" }), (0, jsx_runtime_1.jsx)("path", { d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" })] }));
}
function ArrowDownIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "M12 5v14" }), (0, jsx_runtime_1.jsx)("path", { d: "m19 12-7 7-7-7" })] }));
}
function MoreVerticalIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "1", fill: "currentColor" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "5", r: "1", fill: "currentColor" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "19", r: "1", fill: "currentColor" })] }));
}
function AlertTriangleIcon({ className }) {
    return ((0, jsx_runtime_1.jsxs)(Icon, { className: className, children: [(0, jsx_runtime_1.jsx)("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 9v4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 17h.01" })] }));
}
