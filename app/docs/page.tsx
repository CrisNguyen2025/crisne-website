"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe2, Plus, UserRound } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Access = "allowed" | "conditional" | "denied";
type Role = { id: string; name: string; summary: string; focusTasks: string | null };
type Feature = { id: string; name: string };
type ApiItem = {
  id: string;
  method: string;
  path: string;
  module: string;
  summary: string;
  featureId: string | null;
  sortOrder: number;
  reviewed: boolean;
  requestExample?: string;
  responseExample?: string;
};
type RoleApiAccess = { id: string; roleId: string; apiId: string; access: Access };
type RoleTaskItem = { id: string; text: string; checked: boolean };
type RoleTicket = { roleId: string; ticket: string; name: string };

const roleColorClasses = [
  "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
];

function getRoleColor(index: number) {
  return roleColorClasses[index % roleColorClasses.length];
}

const PROTECTED_ROLE_NAMES = new Set(["SUPER_ADMIN", "ADMIN", "STAFF", "CUSTOMER"]);
const methodStyles: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PATCH: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  DELETE: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const methodDetailBorderStyles: Record<string, string> = {
  GET: "border-emerald-500/40",
  POST: "border-blue-500/40",
  PUT: "border-amber-500/40",
  PATCH: "border-violet-500/40",
  DELETE: "border-rose-500/40",
};
const methodDetailBackgroundStyles: Record<string, string> = {
  GET: "bg-emerald-500/5",
  POST: "bg-blue-500/5",
  PUT: "bg-amber-500/5",
  PATCH: "bg-violet-500/5",
  DELETE: "bg-rose-500/5",
};
const accessStyles: Record<Access, string> = {
  allowed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  conditional: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  denied: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

function getMethodDetail(method: string) {
  if (method === "GET") {
    return {
      showRequest: false,
      requestTitle: "",
      responseTitle: "Response",
      defaultRequest: "",
      defaultResponse: '{\n  "data": [],\n  "meta": { "total": 0 }\n}',
    };
  }

  if (method === "DELETE") {
    return {
      showRequest: true,
      requestTitle: "Request Params",
      responseTitle: "Response",
      defaultRequest: '{\n  "id": "resource-id"\n}',
      defaultResponse: '{\n  "success": true\n}',
    };
  }

  return {
    showRequest: true,
    requestTitle: "Request Body",
    responseTitle: "Response Body",
    defaultRequest: '{\n  "name": "example"\n}',
    defaultResponse: '{\n  "success": true,\n  "data": {}\n}',
  };
}

function SortableTaskRow({ item, index, onChange, onToggle }: { item: RoleTaskItem; index: number; onChange: (index: number, text: string) => void; onToggle: (index: number, checked: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded-md border bg-background px-2 py-2 ${isDragging ? "opacity-60" : ""}`}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab text-xs text-muted-foreground active:cursor-grabbing">⋮⋮</button>
      <input value={item.text} onChange={(event) => onChange(index, event.target.value)} placeholder="Role có thể làm..." className="flex-1 bg-transparent text-xs outline-none" />
      <input type="checkbox" checked={item.checked} onChange={(event) => onToggle(index, event.target.checked)} className="h-3.5 w-3.5 cursor-pointer" />
    </div>
  );
}

function SortableApiRow({
  api,
  order,
  roles,
  accessMap,
  onSelect,
  onDelete,
  onEdit,
  onRoleAccess,
}: {
  api: ApiItem;
  order: number;
  roles: Role[];
  accessMap: Map<string, Access>;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onRoleAccess: (roleId: string, access: Access) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: api.id });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rounded-md border bg-background p-2 ${isDragging ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab text-xs text-muted-foreground active:cursor-grabbing">⋮⋮</button>
        <span className="rounded bg-muted px-2 py-1 text-[10px] font-semibold">#{order}</span>
        <button onClick={onSelect} className="flex flex-1 cursor-pointer flex-wrap items-center gap-2 text-left">
          <span className={`rounded px-2 py-1 text-xs font-semibold ${methodStyles[api.method] ?? methodStyles.GET}`}>{api.method}</span>
          <span className="font-mono text-sm">{api.path}</span>
        </button>
        <button onClick={onEdit} className="cursor-pointer rounded border px-2 py-1 text-xs hover:bg-accent">Edit</button>
        <button onClick={onDelete} className="cursor-pointer rounded border px-2 py-1 text-xs text-destructive">Delete</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{api.summary || "No description"}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {roles.map((role, index) => {
          const currentAccess = accessMap.get(`${role.id}:${api.id}`) ?? "denied";
          const isAllowed = currentAccess === "allowed";
          const roleColor = getRoleColor(index);
          return (
            <button
              key={role.id}
              onClick={() => onRoleAccess(role.id, isAllowed ? "denied" : "allowed")}
              className={`rounded border px-2 py-1 text-[10px] transition ${isAllowed ? roleColor : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              R{index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [mounted] = useState(() => typeof window !== "undefined");
  const [roles, setRoles] = useState<Role[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [apis, setApis] = useState<ApiItem[]>([]);
  const [accessRows, setAccessRows] = useState<RoleApiAccess[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAllApis, setShowAllApis] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", summary: "", focusTasks: "" });
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingTaskItems, setEditingTaskItems] = useState<RoleTaskItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeApiId, setActiveApiId] = useState<string | null>(null);
  const [editingApiId, setEditingApiId] = useState<string | null>(null);
  const [editingApiForm, setEditingApiForm] = useState({ method: "GET", path: "", summary: "", requestExample: "", responseExample: "" });
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [featureForm, setFeatureForm] = useState("");
  const [apiForms, setApiForms] = useState<Record<string, { method: string; path: string; summary: string }>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [toast, setToast] = useState("");
  const [pendingDeleteRoleId, setPendingDeleteRoleId] = useState<string | null>(null);
  const [pendingDeleteApiId, setPendingDeleteApiId] = useState<string | null>(null);
  const [roleFormError, setRoleFormError] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const selectedApi = apis.find((api) => api.id === selectedApiId) ?? null;
  const activeTask = editingTaskItems.find((item) => item.id === activeTaskId) ?? null;
  const activeApi = apis.find((api) => api.id === activeApiId) ?? null;

  const accessMap = useMemo(() => new Map(accessRows.map((row) => [`${row.roleId}:${row.apiId}`, row.access])), [accessRows]);
  const roleTickets = useMemo<RoleTicket[]>(() => roles.map((role, index) => ({ roleId: role.id, ticket: `R${index + 1}`, name: role.name })), [roles]);
  const ticketByRoleId = useMemo(() => new Map(roleTickets.map((row) => [row.roleId, row.ticket])), [roleTickets]);
  const roleIndexById = useMemo(() => new Map(roles.map((role, index) => [role.id, index])), [roles]);

  const filteredApis = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const base = apis.filter((api) => !keyword || [api.method, api.path].join(" ").toLowerCase().includes(keyword));
    if (!selectedRole || showAllApis) return base;
    return base.filter((api) => accessMap.get(`${selectedRole.id}:${api.id}`) === "allowed");
  }, [accessMap, apis, search, selectedRole, showAllApis]);

  const apisByFeature = useMemo(() => {
    const grouped = new Map<string, ApiItem[]>();
    for (const feature of features) grouped.set(feature.id, []);
    grouped.set("__no_feature__", []);
    for (const api of filteredApis) {
      const key = api.featureId || "__no_feature__";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(api);
    }
    const methodRank: Record<string, number> = { GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5 };
    for (const list of grouped.values()) {
      list.sort((a, b) => {
        const rankA = methodRank[a.method] ?? 99;
        const rankB = methodRank[b.method] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    }
    return grouped;
  }, [features, filteredApis]);

  const featureCards = useMemo(() => features, [features]);

  const readJsonSafe = useCallback(async <T,>(response: Response): Promise<T | null> => {
    const raw = await response.text();
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }, []);

  const loadDocs = useCallback(async () => {
    const [rolesRes, featuresRes, apisRes, accessRes] = await Promise.all([
      fetch("/api/docs/roles", { cache: "no-store" }),
      fetch("/api/docs/features", { cache: "no-store" }),
      fetch("/api/docs/apis", { cache: "no-store" }),
      fetch("/api/docs/access", { cache: "no-store" }),
    ]);
    const [nextRoles, nextFeatures, nextApis, nextAccessRows] = await Promise.all([
      readJsonSafe<Role[]>(rolesRes),
      readJsonSafe<Feature[]>(featuresRes),
      readJsonSafe<ApiItem[]>(apisRes),
      readJsonSafe<RoleApiAccess[]>(accessRes),
    ]);
    if (!rolesRes.ok || !featuresRes.ok || !apisRes.ok || !accessRes.ok) throw new Error("Không thể tải dữ liệu docs");
    return { nextRoles, nextFeatures, nextApis, nextAccessRows };
  }, [readJsonSafe]);

  async function refreshFromServer() {
    const payload = await loadDocs();
    setRoles(payload.nextRoles ?? []);
    setFeatures(payload.nextFeatures ?? []);
    setApis(payload.nextApis ?? []);
    setAccessRows(payload.nextAccessRows ?? []);
    setSelectedRoleId((current) => current || payload.nextRoles?.[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    void loadDocs().then((payload) => {
      if (!active) return;
      setRoles(payload.nextRoles ?? []);
      setFeatures(payload.nextFeatures ?? []);
      setApis(payload.nextApis ?? []);
      setAccessRows(payload.nextAccessRows ?? []);
      setSelectedRoleId((current) => current || payload.nextRoles?.[0]?.id || "");
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : "Load docs failed");
    });
    return () => { active = false; };
  }, [loadDocs]);

  useEffect(() => {
    if (!showRoleModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowRoleModal(false); setRoleFormError(""); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRoleModal]);

  async function createRole() {
    if (!roleForm.name.trim()) return setRoleFormError("Role name is required");
    if (!roleForm.summary.trim()) return setRoleFormError("Role summary is required");
    const response = await fetch("/api/docs/roles", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(roleForm) });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setErrorMessage(payload?.error || "Create role failed"); }
    setRoleForm({ name: "", summary: "", focusTasks: "" });
    setShowRoleModal(false);
    setRoleFormError("");
    await refreshFromServer();
  }

  async function deleteRole(id: string) {
    const role = roles.find((item) => item.id === id);
    if (role && PROTECTED_ROLE_NAMES.has(role.name)) return setToast("Default roles cannot be deleted");
    const response = await fetch(`/api/docs/roles/${id}`, { method: "DELETE", cache: "no-store" });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setToast(payload?.error || "Delete role failed"); }
    setSelectedRoleId("");
    await refreshFromServer();
  }

  async function updateRole(role: Role) {
    const response = await fetch(`/api/docs/roles/${role.id}`, { method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: role.summary, focusTasks: role.focusTasks }) });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setErrorMessage(payload?.error || "Update role failed"); }
    setErrorMessage("");
  }

  async function createFeature() {
    if (!featureForm.trim()) return;
    const response = await fetch("/api/docs/features", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: featureForm.trim() }) });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setErrorMessage(payload?.error || "Create feature failed"); }
    setFeatureForm("");
    await refreshFromServer();
  }

  async function createApi(featureId: string) {
    const form = apiForms[featureId] ?? { method: "GET", path: "", summary: "" };
    if (!form.path.trim()) return;
    const response = await fetch("/api/docs/apis", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, featureId }) });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setErrorMessage(payload?.error || "Create API failed"); }
    setApiForms((prev) => ({ ...prev, [featureId]: { method: "GET", path: "", summary: "" } }));
    await refreshFromServer();
  }

  async function deleteApi(id: string) {
    const response = await fetch(`/api/docs/apis/${id}`, { method: "DELETE", cache: "no-store" });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setToast(payload?.error || "Delete API failed"); }
    setSelectedApiId(null);
    await refreshFromServer();
  }

  function startEditApi(api: ApiItem) {
    setEditingApiId(api.id);
    setEditingApiForm({
      method: api.method,
      path: api.path,
      summary: api.summary || "",
      requestExample: api.requestExample || "",
      responseExample: api.responseExample || "",
    });
  }

  function cancelEditApi() {
    setEditingApiId(null);
    setEditingApiForm({ method: "GET", path: "", summary: "", requestExample: "", responseExample: "" });
  }

  async function saveEditApi(api: ApiItem) {
    const response = await fetch(`/api/docs/apis/${api.id}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingApiForm),
    });
    if (!response.ok) {
      const payload = await readJsonSafe<{ error?: string }>(response);
      return setErrorMessage(payload?.error || "Update API failed");
    }
    cancelEditApi();
    await refreshFromServer();
  }

  async function updateAccess(roleId: string, apiId: string, access: Access) {
    const response = await fetch("/api/docs/access", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, apiId, access }) });
    if (!response.ok) { const payload = await readJsonSafe<{ error?: string }>(response); return setErrorMessage(payload?.error || "Update access failed"); }
    await refreshFromServer();
  }

  function startEditRole(role: Role) {
    setEditingRoleId(role.id);
    const mapped = (role.focusTasks || "").split("\n").map((item) => item.trim()).filter(Boolean).map((item, index) => ({ id: `${role.id}-${index}-${item.replace(/^\[(x| )\]\s*/i, "") || "item"}`, text: item.replace(/^\[(x| )\]\s*/i, "").trim(), checked: item.toLowerCase().startsWith("[x]") }));
    setEditingTaskItems(mapped.length ? mapped : [{ id: `${role.id}-0-new`, text: "", checked: false }]);
  }

  function cancelEditRole() { setEditingRoleId(null); setEditingTaskItems([]); setActiveTaskId(null); }

  async function saveEditRole(role: Role) {
    setIsSavingRole(true);
    const serializedTasks = editingTaskItems.map((item) => item.text.trim() ? `${item.checked ? "[x]" : "[ ]"} ${item.text.trim()}` : "").filter(Boolean).join("\n");
    await updateRole({ ...role, focusTasks: serializedTasks });
    await refreshFromServer();
    cancelEditRole();
    setIsSavingRole(false);
  }

  async function toggleViewTaskCheck(role: Role, itemIndex: number) {
    const parsed = (role.focusTasks || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => ({ id: `${role.id}-view-${index}`, text: line.replace(/^\[(x| )\]\s*/i, "").trim(), checked: line.toLowerCase().startsWith("[x]") }));
    if (!parsed[itemIndex]) return;
    parsed[itemIndex] = { ...parsed[itemIndex], checked: !parsed[itemIndex].checked };
    const serialized = parsed.map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.text}`.trim()).join("\n");
    await updateRole({ ...role, focusTasks: serialized });
    await refreshFromServer();
  }

  function onTaskDragStart(event: DragStartEvent) { setActiveTaskId(String(event.active.id)); }
  function onTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) { setActiveTaskId(null); return; }
    setEditingTaskItems((prev) => arrayMove(prev, prev.findIndex((item) => item.id === active.id), prev.findIndex((item) => item.id === over.id)));
    setActiveTaskId(null);
  }

  function onApiDragStart(event: DragStartEvent) { setActiveApiId(String(event.active.id)); }
  async function onApiDragEnd(featureId: string, event: DragEndEvent) {
    const { active, over } = event;
    setActiveApiId(null);
    if (!over || active.id === over.id) return;
    const currentItems = apisByFeature.get(featureId) ?? [];
    const oldIndex = currentItems.findIndex((item) => item.id === active.id);
    const newIndex = currentItems.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextItems = arrayMove(currentItems, oldIndex, newIndex);
    setApis((prev) => prev.map((api) => {
      const nextIndex = nextItems.findIndex((item) => item.id === api.id);
      return nextIndex >= 0 ? { ...api, sortOrder: nextIndex } : api;
    }));
    await fetch("/api/docs/apis/reorder", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: nextItems.map((item) => item.id) }) });
    await refreshFromServer();
  }

  if (!mounted) {
    return (
      <main className="mx-auto h-screen w-full max-w-7xl overflow-hidden px-4 py-4 md:px-8 md:py-6">
        <header className="mb-4 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Role/API Docs Hub</h1>
          <p className="text-sm text-muted-foreground md:text-base">Loading docs workspace...</p>
        </header>
        <div className="flex h-[calc(100vh-9.5rem)] min-h-0 w-full gap-4 overflow-hidden">
          <div className="h-full w-96 shrink-0 rounded-xl border bg-card" />
          <div className="h-full min-w-0 flex-1 rounded-xl border bg-card" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto h-screen w-full max-w-7xl overflow-hidden px-4 py-4 md:px-8 md:py-6">
      <header className="mb-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Role/API Docs Hub</h1>
            <p className="text-sm text-muted-foreground md:text-base">CRUD roles, features, APIs và mapping quyền trực tiếp bằng SQLite.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${showAllApis ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {showAllApis ? <Globe2 className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
              {showAllApis ? "Mode: All APIs" : `Mode: ${selectedRole ? ticketByRoleId.get(selectedRole.id) : "Role"}`}
            </span>
            <button onClick={() => setShowAllApis((prev) => !prev)} className={`rounded-md border px-3 py-2 text-xs hover:bg-accent ${showAllApis ? "border-primary bg-primary/10 text-primary" : ""}`}>{showAllApis ? "Focus selected role" : "Show all APIs"}</button>
          </div>
        </div>
        {errorMessage ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p> : null}
      </header>

      {toast ? <button onClick={() => setToast("")} className="fixed right-4 top-4 z-[60] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive shadow">{toast}</button> : null}

      <div className="flex h-[calc(100vh-9.5rem)] min-h-0 w-full gap-4 overflow-hidden">
        <aside className="flex h-full min-h-0 w-96 shrink-0 flex-col rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Role Docs</h2>
            <div className="flex items-center gap-2"><span className="rounded bg-muted px-2 py-1 text-xs">{roles.length} roles</span><button onClick={() => setShowRoleModal(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-accent" aria-label="Open create role modal"><Plus className="h-4 w-4" /></button></div>
          </div>
          <Accordion type="single" value={selectedRole?.id} onValueChange={(value) => value && setSelectedRoleId(value)} className="min-h-0 flex-1 space-y-2 overflow-y-scroll px-1 [scrollbar-gutter:stable]">
            {roles.map((role) => (
              <AccordionItem key={role.id} value={role.id} className={role.id === selectedRoleId ? `${getRoleColor(roleIndexById.get(role.id) ?? 0)} border` : "border-border"}>
                <AccordionTrigger className="cursor-pointer px-4 py-3"><span><span className={`mb-1 inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getRoleColor(roleIndexById.get(role.id) ?? 0)}`}>{ticketByRoleId.get(role.id)}</span><span className="block text-sm font-semibold">{role.name}</span><span className="mt-1 block text-xs text-muted-foreground">{role.summary}</span></span></AccordionTrigger>
                <AccordionContent className="border-t bg-muted/20 px-4 py-3">
                  {editingRoleId === role.id ? (
                    <>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onTaskDragStart} onDragEnd={onTaskDragEnd}>
                        <SortableContext items={editingTaskItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">{editingTaskItems.map((item, index) => <SortableTaskRow key={item.id} item={item} index={index} onChange={(idx, text) => setEditingTaskItems((prev) => prev.map((row, i) => i === idx ? { ...row, text } : row))} onToggle={(idx, checked) => setEditingTaskItems((prev) => prev.map((row, i) => i === idx ? { ...row, checked } : row))} />)}<button onClick={() => setEditingTaskItems((prev) => [...prev, { id: `${role.id}-${Date.now()}`, text: "", checked: false }])} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">+ Add item</button></div>
                        </SortableContext>
                        <DragOverlay>{activeTask ? <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-2 shadow-lg"><span className="text-xs text-muted-foreground">⋮⋮</span><span className="flex-1 text-xs">{activeTask.text || "Role có thể làm..."}</span><input type="checkbox" checked={activeTask.checked} readOnly className="h-3.5 w-3.5" /></div> : null}</DragOverlay>
                      </DndContext>
                      <div className="mt-3 flex items-center justify-end gap-2">{isSavingRole ? <span className="text-xs text-muted-foreground">Saving...</span> : null}<button disabled={isSavingRole} onClick={() => void saveEditRole(role)} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">Save</button><button disabled={isSavingRole} onClick={cancelEditRole} className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60">Cancel</button></div>
                    </>
                  ) : (
                    <>
                      <ul className="space-y-1.5 pl-1 text-xs leading-relaxed">{(role.focusTasks || "Chưa có mô tả BA docs.").split("\n").map((item, index) => { const isChecked = item.trim().toLowerCase().startsWith("[x]"); const text = item.replace(/^\[(x| )\]\s*/i, "").trim(); return <li key={`${item}-${index}`} className="flex items-center justify-between gap-2 rounded-sm px-1 py-0.5"><span>- {text || item}</span><input type="checkbox" checked={isChecked} onChange={() => void toggleViewTaskCheck(role, index)} className="h-3.5 w-3.5 cursor-pointer" /></li>; })}</ul>
                      <div className="mt-3 flex justify-end"><button onClick={() => startEditRole(role)} className="cursor-pointer rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent">Edit</button></div>
                    </>
                  )}
                  {!PROTECTED_ROLE_NAMES.has(role.name) ? (
                    <div className="mt-4">
                      <Tooltip open={pendingDeleteRoleId === role.id} onOpenChange={(open) => setPendingDeleteRoleId(open ? role.id : null)}>
                        <TooltipTrigger>
                          <button onClick={() => setPendingDeleteRoleId(role.id)} className="rounded-md border px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10">Delete role</button>
                        </TooltipTrigger>
                        <TooltipContent className="!bg-card !text-foreground !border">
                          <div className="inline-flex items-center gap-2 text-xs">
                            <span>Delete role?</span>
                            <button onClick={() => { void deleteRole(role.id); setPendingDeleteRoleId(null); }} className="rounded border px-2 py-0.5 text-destructive">Yes</button>
                            <button onClick={() => setPendingDeleteRoleId(null)} className="rounded border px-2 py-0.5">No</button>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-col gap-3">
            <div><h2 className="text-sm font-medium text-muted-foreground">API List</h2><p className="text-sm">Current role: <span className="font-semibold">{selectedRole ? `${ticketByRoleId.get(selectedRole.id)} · ${selectedRole.name}` : "No role"}</span></p></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search API..." className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="mb-3 space-y-2 rounded-lg border bg-background p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]"><input value={featureForm} onChange={(event) => setFeatureForm(event.target.value)} placeholder="Add feature name" className="rounded-md border bg-card px-3 py-2 text-sm" /><button onClick={createFeature} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Add Feature</button></div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-scroll pr-1 [scrollbar-gutter:stable]">
            {featureCards.map((feature) => {
              const items = apisByFeature.get(feature.id) ?? [];
              return (
                <div key={feature.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{feature.name}</p><span className="rounded bg-muted px-2 py-1 text-[10px]">{items.length} APIs</span></div>
                  <div className="mb-2 grid gap-2 md:grid-cols-[90px_1fr_1fr_auto]"><select value={apiForms[feature.id]?.method ?? "GET"} onChange={(event) => setApiForms((prev) => ({ ...prev, [feature.id]: { ...(prev[feature.id] ?? { path: "", summary: "" }), method: event.target.value } }))} className="rounded-md border bg-card px-2 py-2 text-sm">{Object.keys(methodStyles).map((method) => <option key={method}>{method}</option>)}</select><input value={apiForms[feature.id]?.path ?? ""} onChange={(event) => setApiForms((prev) => ({ ...prev, [feature.id]: { method: prev[feature.id]?.method ?? "GET", summary: prev[feature.id]?.summary ?? "", path: event.target.value } }))} placeholder="/api/users" className="rounded-md border bg-card px-3 py-2 text-sm" /><input value={apiForms[feature.id]?.summary ?? ""} onChange={(event) => setApiForms((prev) => ({ ...prev, [feature.id]: { method: prev[feature.id]?.method ?? "GET", path: prev[feature.id]?.path ?? "", summary: event.target.value } }))} placeholder="API description" className="rounded-md border bg-card px-3 py-2 text-sm" /><button onClick={() => createApi(feature.id)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Add API</button></div>
                  {items.length ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onApiDragStart} onDragEnd={(event) => void onApiDragEnd(feature.id, event)}>
                      <SortableContext items={items.map((api) => api.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">{items.map((api, index) => editingApiId === api.id ? <div key={api.id} className="rounded-md border bg-background p-2"><div className="grid gap-2 md:grid-cols-[90px_1fr_1fr_auto_auto]"><select value={editingApiForm.method} onChange={(event) => setEditingApiForm((prev) => ({ ...prev, method: event.target.value }))} className="rounded-md border bg-card px-2 py-2 text-sm">{Object.keys(methodStyles).map((method) => <option key={method}>{method}</option>)}</select><input value={editingApiForm.path} onChange={(event) => setEditingApiForm((prev) => ({ ...prev, path: event.target.value }))} className="rounded-md border bg-card px-3 py-2 text-sm" /><input value={editingApiForm.summary} onChange={(event) => setEditingApiForm((prev) => ({ ...prev, summary: event.target.value }))} className="rounded-md border bg-card px-3 py-2 text-sm" /><button onClick={() => saveEditApi(api)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Save</button><button onClick={cancelEditApi} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Cancel</button></div><div className="mt-2 grid gap-2 md:grid-cols-2"><textarea value={editingApiForm.requestExample} onChange={(event) => setEditingApiForm((prev) => ({ ...prev, requestExample: event.target.value }))} placeholder="Request example (JSON)" className="min-h-24 rounded-md border bg-card px-3 py-2 font-mono text-xs" /><textarea value={editingApiForm.responseExample} onChange={(event) => setEditingApiForm((prev) => ({ ...prev, responseExample: event.target.value }))} placeholder="Response example (JSON)" className="min-h-24 rounded-md border bg-card px-3 py-2 font-mono text-xs" /></div></div> : <div key={api.id} className="space-y-1"><SortableApiRow api={api} order={index + 1} roles={roles} accessMap={accessMap} onSelect={() => setSelectedApiId(api.id)} onDelete={() => setPendingDeleteApiId(api.id)} onEdit={() => startEditApi(api)} onRoleAccess={(roleId, access) => updateAccess(roleId, api.id, access)} />{pendingDeleteApiId === api.id ? <Tooltip open onOpenChange={(open) => { if (!open) setPendingDeleteApiId(null); }}><TooltipTrigger><span className="ml-8 inline-block h-0 w-0" /></TooltipTrigger><TooltipContent className="!bg-card !text-foreground !border"><div className="inline-flex items-center gap-2 text-xs"><span>Delete this API?</span><button onClick={() => { void deleteApi(api.id); setPendingDeleteApiId(null); }} className="rounded border px-2 py-0.5 text-destructive">Yes</button><button onClick={() => setPendingDeleteApiId(null)} className="rounded border px-2 py-0.5">No</button></div></TooltipContent></Tooltip> : null}</div>)}</div>
                      </SortableContext>
                      <DragOverlay>{activeApi ? <div className="rounded-md border bg-card p-2 shadow-lg"><span className={`mr-2 rounded px-2 py-1 text-xs font-semibold ${methodStyles[activeApi.method] ?? methodStyles.GET}`}>{activeApi.method}</span><span className="font-mono text-sm">{activeApi.path}</span></div> : null}</DragOverlay>
                    </DndContext>
                  ) : (
                    <p className="text-xs text-muted-foreground">Chưa có API trong feature này.</p>
                  )}
                </div>
              );
            })}
          </div>
          {selectedApi ? (() => { const detail = getMethodDetail(selectedApi.method); return <div className={`mt-3 rounded-lg border p-3 ${methodDetailBorderStyles[selectedApi.method] ?? "border-dashed"} ${methodDetailBackgroundStyles[selectedApi.method] ?? "bg-card"}`}><p className="mb-2 text-sm font-semibold">API ↔ Roles Mapping</p><p className="mb-3 font-mono text-sm">{selectedApi.method} {selectedApi.path}</p><div className="flex flex-wrap gap-2">{roles.map((role) => { const access = accessMap.get(`${role.id}:${selectedApi.id}`) ?? "denied"; const roleColor = getRoleColor(roleIndexById.get(role.id) ?? 0); return <span key={role.id} className={`rounded border px-2 py-1 text-xs ${access === "allowed" ? roleColor : accessStyles[access]}`}>{role.name}: {access}</span>; })}</div><div className="mt-3 grid gap-2 md:grid-cols-2">{detail.showRequest ? <div><p className="mb-1 text-xs font-semibold text-muted-foreground">{detail.requestTitle}</p><pre className="overflow-x-auto rounded-md border bg-background p-2 text-xs">{selectedApi.requestExample || detail.defaultRequest}</pre></div> : null}<div><p className="mb-1 text-xs font-semibold text-muted-foreground">{detail.responseTitle}</p><pre className="overflow-x-auto rounded-md border bg-background p-2 text-xs">{selectedApi.responseExample || detail.defaultResponse}</pre></div></div></div>; })() : null}
        </section>
      </div>

      {showRoleModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => { setShowRoleModal(false); setRoleFormError(""); }}><div className="w-full max-w-lg rounded-xl border bg-card p-4 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Add Role</h2><p className="text-sm text-muted-foreground">Tạo role mới và mô tả BA docs cho role đó.</p></div><button onClick={() => { setShowRoleModal(false); setRoleFormError(""); }} className="rounded-md border px-2 py-1 text-sm hover:bg-accent">Close</button></div><div className="space-y-3"><input value={roleForm.name} onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Role name, vd STAFF" className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><input value={roleForm.summary} onChange={(event) => setRoleForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="Role summary" className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><textarea value={roleForm.focusTasks} onChange={(event) => setRoleForm((prev) => ({ ...prev, focusTasks: event.target.value }))} placeholder="BA docs: mỗi dòng là 1 việc role có thể làm" className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" />{roleFormError ? <p className="text-sm text-destructive">{roleFormError}</p> : null}<div className="flex justify-end gap-2"><button onClick={() => { setShowRoleModal(false); setRoleFormError(""); }} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Cancel</button><button onClick={createRole} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Add Role</button></div></div></div></div> : null}
    </main>
  );
}
