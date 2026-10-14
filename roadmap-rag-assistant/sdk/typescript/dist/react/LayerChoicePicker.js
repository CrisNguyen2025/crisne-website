"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayerChoicePicker = LayerChoicePicker;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const icons_1 = require("./icons");
/** Shown when an item has no target layer: create the default layer or a named one. */
function LayerChoicePicker({ onSend, disabled, }) {
    const [name, setName] = (0, react_1.useState)("");
    const trimmed = name.trim();
    const submitName = (e) => {
        e.preventDefault();
        if (!trimmed)
            return;
        onSend(`tạo layer ${trimmed}`);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2 pt-1", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onSend("tạo layer mặc định"), disabled: disabled, className: "self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50", children: "T\u1EA1o layer m\u1EB7c \u0111\u1ECBnh (General)" }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: submitName, className: "flex items-center gap-1.5", children: [(0, jsx_runtime_1.jsx)("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "Ho\u1EB7c nh\u1EADp t\u00EAn layer m\u1EDBi\u2026", disabled: disabled, className: "min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-50" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: disabled || !trimmed, "aria-label": "T\u1EA1o layer v\u1EDBi t\u00EAn \u0111\u00E3 nh\u1EADp", className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-50", children: (0, jsx_runtime_1.jsx)(icons_1.ArrowUpIcon, { className: "h-3.5 w-3.5" }) })] })] }));
}
