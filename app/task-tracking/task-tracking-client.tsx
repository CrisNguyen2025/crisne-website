"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ExternalLink,
  Figma,
  GitBranch,
  ListFilter,
  MoreHorizontal,
  Newspaper,
  Plus,
  Settings2,
  Ticket,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TaskArea = "FO" | "CMS" | "BO";
type TaskEnv = "dev" | "uat" | "preprod" | "prod";
type TaskStatus =
  | "todo"
  | "working"
  | "pending"
  | "blocked"
  | "dev-done"
  | "uat-done"
  | "preprod-done";
type TaskSort = "manual" | "status";
type TaskLinkField = "jira" | "figma" | "gitlab";

type Sprint = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type TaskItem = {
  id: string;
  order: number;
  title: string;
  branch: string;
  area: TaskArea;
  sprintId: string;
  jira: string;
  figma: string;
  gitlab: string;
  env: TaskEnv;
  status: TaskStatus;
  notes: string;
};

const tabs: Array<{ id: TaskArea; label: string; Icon: LucideIcon }> = [
  { id: "FO", label: "FO", Icon: ListFilter },
  { id: "CMS", label: "CMS", Icon: Newspaper },
  { id: "BO", label: "BO", Icon: Settings2 },
];

const taskLinkFields: Array<{ field: TaskLinkField; label: string; Icon: LucideIcon }> = [
  { field: "jira", label: "Jira", Icon: Ticket },
  { field: "figma", label: "Figma", Icon: Figma },
  { field: "gitlab", label: "GitLab", Icon: GitBranch },
];

const NOTE_MORE_THRESHOLD = 44;

const sprints: Sprint[] = [
  { id: "sprint-19", name: "Sprint 19", startDate: "2026-06-08", endDate: "2026-06-19" },
  { id: "sprint-20", name: "Sprint 20", startDate: "2026-06-22", endDate: "2026-07-03" },
  { id: "sprint-21", name: "Sprint 21", startDate: "2026-07-06", endDate: "2026-07-17" },
  { id: "sprint-22", name: "Sprint 22", startDate: "2026-07-20", endDate: "2026-07-31" },
  { id: "sprint-23", name: "Sprint 23", startDate: "2026-08-03", endDate: "2026-08-14" },
  { id: "sprint-24", name: "Sprint 24", startDate: "2026-08-17", endDate: "2026-08-28" },
  { id: "sprint-25", name: "Sprint 25", startDate: "2026-08-31", endDate: "2026-09-11" },
  { id: "sprint-26", name: "Sprint 26", startDate: "2026-09-14", endDate: "2026-09-25" },
  { id: "sprint-27", name: "Sprint 27", startDate: "2026-09-28", endDate: "2026-10-09" },
  { id: "sprint-28", name: "Sprint 28", startDate: "2026-10-12", endDate: "2026-10-23" },
  { id: "sprint-29", name: "Sprint 29", startDate: "2026-10-26", endDate: "2026-11-06" },
  { id: "sprint-30", name: "Sprint 30", startDate: "2026-11-09", endDate: "2026-11-20" },
];

const CURRENT_SPRINT_ID = "sprint-19";

const initialTasks: TaskItem[] = [
  {
    id: "fo-001",
    order: 1,
    title: "Checkout page responsive polish",
    branch: "feature/checkout-responsive",
    area: "FO",
    sprintId: "sprint-17",
    jira: "https://jira.example.com/browse/FO-101",
    figma: "https://figma.com/file/fo-101",
    gitlab: "https://gitlab.example.com/project/merge_requests/101",
    env: "uat",
    status: "working",
    notes: "Need QA pass on iPad width and payment summary sticky behavior.",
  },
  {
    id: "fo-002",
    order: 2,
    title: "Product detail image zoom fix",
    branch: "feature/pdp-image-zoom",
    area: "FO",
    sprintId: "sprint-17",
    jira: "https://jira.example.com/browse/FO-102",
    figma: "https://figma.com/file/fo-102",
    gitlab: "https://gitlab.example.com/project/merge_requests/102",
    env: "dev",
    status: "todo",
    notes: "Waiting final assets from design before implementation starts.",
  },
  {
    id: "cms-001",
    order: 3,
    title: "CMS article scheduling workflow",
    branch: "feature/cms-article-schedule",
    area: "CMS",
    sprintId: "sprint-17",
    jira: "https://jira.example.com/browse/CMS-88",
    figma: "https://figma.com/file/cms-88",
    gitlab: "https://gitlab.example.com/project/merge_requests/88",
    env: "preprod",
    status: "pending",
    notes: "Pending content team sign-off for timezone handling.",
  },
  {
    id: "bo-001",
    order: 4,
    title: "Order sync retry worker",
    branch: "feature/order-sync-retry",
    area: "BO",
    sprintId: "sprint-17",
    jira: "https://jira.example.com/browse/BO-52",
    figma: "https://figma.com/file/bo-52",
    gitlab: "https://gitlab.example.com/project/merge_requests/52",
    env: "dev",
    status: "blocked",
    notes: "Blocked by missing webhook contract from ERP partner.",
  },
  {
    id: "fo-003",
    order: 5,
    title: "Profile address book empty state",
    branch: "feature/profile-address-empty",
    area: "FO",
    sprintId: "sprint-18",
    jira: "https://jira.example.com/browse/FO-111",
    figma: "https://figma.com/file/fo-111",
    gitlab: "https://gitlab.example.com/project/merge_requests/111",
    env: "prod",
    status: "preprod-done",
    notes: "Released successfully and monitored in production.",
  },
  {
    id: "cms-002",
    order: 6,
    title: "CMS media library tag filter",
    branch: "feature/cms-media-tag-filter",
    area: "CMS",
    sprintId: "sprint-18",
    jira: "https://jira.example.com/browse/CMS-93",
    figma: "https://figma.com/file/cms-93",
    gitlab: "https://gitlab.example.com/project/merge_requests/93",
    env: "uat",
    status: "working",
    notes: "Backend API ready, UI filtering and empty states in progress.",
  },
  {
    id: "bo-002",
    order: 7,
    title: "Role permission audit export",
    branch: "feature/role-audit-export",
    area: "BO",
    sprintId: "sprint-18",
    jira: "https://jira.example.com/browse/BO-57",
    figma: "https://figma.com/file/bo-57",
    gitlab: "https://gitlab.example.com/project/merge_requests/57",
    env: "preprod",
    status: "todo",
    notes: "Planned after access matrix review with security team.",
  },
  {
    id: "fo-004",
    order: 8,
    title: "Voucher banner A/B tracking",
    branch: "feature/voucher-ab-tracking",
    area: "FO",
    sprintId: "sprint-19",
    jira: "https://jira.example.com/browse/FO-120",
    figma: "https://figma.com/file/fo-120",
    gitlab: "https://gitlab.example.com/project/merge_requests/120",
    env: "dev",
    status: "pending",
    notes: "Waiting analytics event naming confirmation from marketing.",
  },
  {
    id: "cms-003",
    order: 9,
    title: "Bulk publish rollback flow",
    branch: "feature/cms-bulk-rollback",
    area: "CMS",
    sprintId: "sprint-19",
    jira: "https://jira.example.com/browse/CMS-98",
    figma: "https://figma.com/file/cms-98",
    gitlab: "https://gitlab.example.com/project/merge_requests/98",
    env: "dev",
    status: "todo",
    notes: "Need RFC review before breaking changes are approved.",
  },
  {
    id: "bo-003",
    order: 10,
    title: "Inventory discrepancy dashboard",
    branch: "feature/inventory-dashboard",
    area: "BO",
    sprintId: "sprint-19",
    jira: "https://jira.example.com/browse/BO-61",
    figma: "https://figma.com/file/bo-61",
    gitlab: "https://gitlab.example.com/project/merge_requests/61",
    env: "uat",
    status: "working",
    notes: "Chart rendering done; validating aggregation with operations team.",
  },
];

const statusClasses: Record<TaskStatus, string> = {
  todo: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  working: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "dev-done": "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "uat-done": "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "preprod-done": "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300",
};

const envClasses: Record<TaskEnv, string> = {
  dev: "bg-muted text-muted-foreground",
  uat: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  preprod: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  prod: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const statusPriority: Record<TaskStatus, number> = {
  working: 0,
  blocked: 1,
  pending: 2,
  todo: 3,
  "dev-done": 4,
  "uat-done": 5,
  "preprod-done": 6,
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatSprintOption(sprint: Sprint) {
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });

  return `${sprint.name} (${dateFormatter.format(new Date(sprint.startDate))} - ${dateFormatter.format(new Date(sprint.endDate))})`;
}

const STORAGE_KEY = "task-tracking-tasks";

function loadTasks(): TaskItem[] {
  if (typeof window === "undefined") return initialTasks;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialTasks;
    const parsed = JSON.parse(stored) as TaskItem[];
    // Merge: keep stored tasks, but if a new initialTask id doesn't exist yet, add it
    const storedIds = new Set(parsed.map((t) => t.id));
    const newDefaults = initialTasks.filter((t) => !storedIds.has(t.id));
    return [...parsed, ...newDefaults];
  } catch {
    return initialTasks;
  }
}

export function TaskTrackingClient() {
  const [activeTab, setActiveTab] = useState<TaskArea>("FO");
  const [selectedSprintId, setSelectedSprintId] = useState<string>(CURRENT_SPRINT_ID);
  const [sortBy, setSortBy] = useState<TaskSort>("manual");
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

  // Load from localStorage on mount
  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  // Persist to localStorage whenever tasks change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore quota errors
    }
  }, [tasks]);

  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId) ?? sprints[0];

  const tabCounts = useMemo(() => {
    return tabs.reduce<Record<TaskArea, number>>((acc, tab) => {
      acc[tab.id] = tasks.filter(
        (task) => task.sprintId === selectedSprintId && task.area === tab.id,
      ).length;
      return acc;
    }, { FO: 0, CMS: 0, BO: 0 });
  }, [selectedSprintId, tasks]);

  const filteredTasks = tasks
    .filter((task) => task.sprintId === selectedSprintId && task.area === activeTab)
    .toSorted((first, second) => {
      if (sortBy === "status") {
        const byStatus = statusPriority[first.status] - statusPriority[second.status];
        if (byStatus !== 0) return byStatus;
      }
      return first.order - second.order;
    });

  const summary = {
    total: filteredTasks.length,
    done: filteredTasks.filter((task) => task.status.endsWith("-done")).length,
    blocked: filteredTasks.filter((task) => task.status === "blocked").length,
    working: filteredTasks.filter((task) => task.status === "working").length,
  };

  const handleFieldBlur = <K extends keyof TaskItem>(
    taskId: string,
    field: K,
    value: TaskItem[K],
  ) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, [field]: value } : task,
      ),
    );
  };

  const handleAddTask = () => {
    const nextOrder =
      tasks
        .filter((task) => task.area === activeTab)
        .reduce((maxOrder, task) => Math.max(maxOrder, task.order), 0) + 1;

    const nextCount =
      tasks.filter((task) => task.area === activeTab).length + 1;

    const prefix = activeTab.toLowerCase();

    setTasks((currentTasks) => [
      ...currentTasks,
      {
        id: `${prefix}-${String(nextCount).padStart(3, "0")}-${Date.now()}`,
        order: nextOrder,
        title: `New ${activeTab} task`,
        branch: "",
        area: activeTab,
        sprintId: selectedSprintId,
        jira: "",
        figma: "",
        gitlab: "",
        env: "dev",
        status: "todo",
        notes: "",
      },
    ]);
  };

  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const confirmed = window.confirm(
      `Delete task${task?.title ? ` "${task.title}"` : ""}?`,
    );

    if (!confirmed) return;

    setTasks((currentTasks) => currentTasks.filter((item) => item.id !== taskId));
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 pb-8">
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-6 rounded-full px-3 text-xs uppercase tracking-[0.18em]">
                    Task inline
                  </Badge>
                  <Badge className="h-6 rounded-full bg-primary/10 px-3 text-primary">
                    {selectedSprint.name}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Task Tracking
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="size-4" />
                    <span>{formatDate(selectedSprint.startDate)} - {formatDate(selectedSprint.endDate)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                <SummaryCard label="Tab" value={activeTab} />
                <SummaryCard label="Tasks" value={String(summary.total)} />
                <SummaryCard label="Working" value={String(summary.working)} />
                <SummaryCard label="Done" value={String(summary.done)} />
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const active = tab.id === activeTab;
                  const Icon = tab.Icon;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className={cn("h-10 gap-2 rounded-full px-4", !active && "bg-background")}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                      )}>
                        {tabCounts[tab.id]}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SortSelect value={sortBy} onChange={setSortBy} />
                <SprintSelect
                  sprints={sprints}
                  value={selectedSprintId}
                  onChange={(value) => setSelectedSprintId(value)}
                />
                <Button
                  type="button"
                  className="h-10 gap-2 rounded-full px-4"
                  onClick={handleAddTask}
                >
                  <Plus className="size-4" />
                  Add task
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
          <CardHeader className="gap-4 border-b border-border/50 pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListFilter className="size-5 text-primary" />
                  <CardTitle className="text-xl font-semibold">{activeTab} Tasks</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedSprint.name}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">{summary.total} tasks</Badge>
                <Badge className={statusClasses.working}>{summary.working} working</Badge>
                <Badge className={statusClasses.blocked}>{summary.blocked} blocked</Badge>
                <Badge className={statusClasses["preprod-done"]}>{summary.done} done</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            {filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-6 py-12 text-center text-sm text-muted-foreground">
                Chưa có task cho tab {activeTab} trong {selectedSprint.name}.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task, index) => (
                  <TaskFlatRow
                    key={task.id}
                    task={task}
                    displayOrder={index + 1}
                    onBlurField={handleFieldBlur}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function TaskFlatRow({
  task,
  displayOrder,
  onBlurField,
  onDelete,
}: {
  task: TaskItem;
  displayOrder: number;
  onBlurField: <K extends keyof TaskItem>(taskId: string, field: K, value: TaskItem[K]) => void;
  onDelete: (taskId: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [branch, setBranch] = useState(task.branch);
  const [jira, setJira] = useState(task.jira);
  const [figma, setFigma] = useState(task.figma);
  const [gitlab, setGitlab] = useState(task.gitlab);
  const [notes, setNotes] = useState(task.notes);
  const [notesDraft, setNotesDraft] = useState(task.notes);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const linkValues: Record<TaskLinkField, string> = { jira, figma, gitlab };
  const linkSetters: Record<TaskLinkField, (value: string) => void> = {
    jira: setJira,
    figma: setFigma,
    gitlab: setGitlab,
  };
  const hasLongNotes = notes.trim().length > NOTE_MORE_THRESHOLD;

  const handleOpenNotesModal = () => {
    setNotesDraft(notes);
    setIsNotesModalOpen(true);
  };

  const handleSaveNotes = () => {
    setNotes(notesDraft);
    onBlurField(task.id, "notes", notesDraft);
    setIsNotesModalOpen(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3 transition hover:bg-muted/20">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 lg:w-[calc(100%-360px)] lg:min-w-0">
          <Badge variant="outline" className="h-8 rounded-lg font-mono">
            #{displayOrder}
          </Badge>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => onBlurField(task.id, "title", title)}
              className="h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              placeholder="Task title"
            />
          </div>
          <div className="relative shrink-0 w-[160px]">
            <GitBranch className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              onBlur={() => onBlurField(task.id, "branch", branch)}
              className="h-9 w-full rounded-lg border border-border/70 bg-background pl-6 pr-2 font-mono text-xs text-muted-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary focus:text-foreground"
              placeholder="feature/branch-name"
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 lg:w-[360px]">
          <InlineSelect
            value={task.env}
            onChange={(value) => onBlurField(task.id, "env", value as TaskEnv)}
            options={[
              { value: "dev", label: "dev" },
              { value: "uat", label: "uat" },
              { value: "preprod", label: "preprod" },
              { value: "prod", label: "prod" },
            ]}
            className={envClasses[task.env]}
          />
          <InlineSelect
            value={task.status}
            onChange={(value) => onBlurField(task.id, "status", value as TaskStatus)}
            options={[
              { value: "todo", label: "todo" },
              { value: "working", label: "working" },
              { value: "pending", label: "pending" },
              { value: "blocked", label: "blocked" },
              { value: "dev-done", label: "dev - done" },
              { value: "uat-done", label: "uat - done" },
              { value: "preprod-done", label: "preprod - done" },
            ]}
            className={statusClasses[task.status]}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => onDelete(task.id)}
            className="rounded-lg"
            aria-label={`Delete ${task.title}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(420px,1fr)_minmax(260px,0.8fr)]">
        <div className="grid gap-2 sm:grid-cols-3">
          {taskLinkFields.map(({ field, label, Icon }) => (
            <LinkInput
              key={field}
              label={label}
              Icon={Icon}
              value={linkValues[field]}
              onChange={linkSetters[field]}
              onBlur={() => onBlurField(task.id, field, linkValues[field])}
            />
          ))}
        </div>
        <div className="relative">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => onBlurField(task.id, "notes", notes)}
            className={cn(
              "h-9 w-full rounded-lg border border-border/70 bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15",
              hasLongNotes && "pr-12",
            )}
            placeholder="Notes"
          />
          {hasLongNotes ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleOpenNotesModal}
              className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Show full notes"
              title="More"
            >
              <MoreHorizontal className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {isNotesModalOpen ? (
        <NotesModal
          taskTitle={title}
          value={notesDraft}
          onChange={setNotesDraft}
          onClose={() => setIsNotesModalOpen(false)}
          onSave={handleSaveNotes}
        />
      ) : null}
    </div>
  );
}

function NotesModal({
  taskTitle,
  value,
  onChange,
  onClose,
  onSave,
}: {
  taskTitle: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-notes-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border/70 bg-card p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Notes</p>
            <h2 id="task-notes-title" className="mt-1 truncate text-lg font-semibold">
              {taskTitle}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={onClose}
            aria-label="Close notes"
          >
            <X className="size-4" />
          </Button>
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-44 w-full resize-y rounded-lg border border-border/70 bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          placeholder="Notes"
          autoFocus
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-lg" onClick={onSave}>
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LinkInput({
  label,
  Icon,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  Icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const hasLink = value.trim().length > 0;

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        aria-label={`${label} link`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-9 w-full rounded-lg border border-border/70 bg-background px-8 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
        placeholder={label}
      />
      {hasLink ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={`Open ${label}`}
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : (
        <span className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/40">
          <ExternalLink className="size-3.5" />
        </span>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function InlineSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-9 w-full rounded-lg border border-border/70 px-3 text-sm font-medium capitalize outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SortSelect({
  value,
  onChange,
}: {
  value: TaskSort;
  onChange: (value: TaskSort) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as TaskSort)}
      className="h-10 min-w-40 rounded-full border border-border/70 bg-background px-4 text-sm font-medium outline-none transition hover:bg-muted focus:border-primary focus:ring-4 focus:ring-primary/15"
    >
      <option value="manual">Sort: Manual</option>
      <option value="status">Sort: Status</option>
    </select>
  );
}

function SprintSelect({
  sprints,
  value,
  onChange,
}: {
  sprints: Sprint[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-52 rounded-full border border-border/70 bg-background px-4 text-sm font-medium outline-none transition hover:bg-muted focus:border-primary focus:ring-4 focus:ring-primary/15"
    >
      {sprints.map((sprint) => (
        <option key={sprint.id} value={sprint.id}>
          {formatSprintOption(sprint)}
        </option>
      ))}
    </select>
  );
}
