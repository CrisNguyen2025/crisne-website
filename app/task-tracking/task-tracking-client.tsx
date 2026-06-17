"use client";

import { useMemo, useState } from "react";
import { Select } from "@base-ui/react/select";
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
  area: TaskArea;
  sprintId: string;
  jira: string;
  figma: string;
  gitlab: string;
  env: TaskEnv;
  status: TaskStatus;
  notes: string;
};

const tabs: Array<{ id: TaskArea; label: string; icon: string }> = [
  { id: "FO", label: "FO", icon: "◫" },
  { id: "CMS", label: "CMS", icon: "▦" },
  { id: "BO", label: "BO", icon: "⚙" },
];

const sprints: Sprint[] = [
  { id: "sprint-17", name: "Sprint 17", startDate: "2026-06-15", endDate: "2026-06-28" },
  { id: "sprint-18", name: "Sprint 18", startDate: "2026-06-29", endDate: "2026-07-12" },
  { id: "sprint-19", name: "Sprint 19", startDate: "2026-07-13", endDate: "2026-07-26" },
];

const CURRENT_SPRINT_ID = "sprint-19";

const initialTasks: TaskItem[] = [
  {
    id: "fo-001",
    order: 1,
    title: "Checkout page responsive polish",
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

export function TaskTrackingClient() {
  const [activeTab, setActiveTab] = useState<TaskArea>("FO");
  const [selectedSprintId, setSelectedSprintId] = useState<string>(CURRENT_SPRINT_ID);
  const [sortBy, setSortBy] = useState<TaskSort>("manual");
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

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
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 pb-24">
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-xs uppercase tracking-[0.25em]">
                  Sprint tracking
                </Badge>
                <div className="space-y-2">
                  <CardTitle className="text-3xl font-bold tracking-tight sm:text-4xl">
                    Task Tracking
                  </CardTitle>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    Theo dõi task theo sprint 2 tuần với 3 domain FO, CMS và BO. Dữ liệu hiện đang là mock data để chốt layout và luồng theo dõi.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Mặc định đang filter {selectedSprint.name}. Sprint mới bắt đầu từ Thứ Hai, 22/06/2026.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Active tab" value={activeTab} />
                <SummaryCard label="Sprint" value={selectedSprint.name} />
                <SummaryCard label="Tasks" value={String(summary.total)} />
                <SummaryCard label="Cycle" value="2 weeks" />
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const active = tab.id === activeTab;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className={cn("h-10 gap-2 rounded-full px-4", !active && "bg-background")}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <span aria-hidden="true">{tab.icon}</span>
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
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
          <CardHeader className="gap-4 border-b border-border/50 pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-primary" aria-hidden="true">◷</span>
                  <CardTitle className="text-xl font-semibold">{selectedSprint.name}</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedSprint.startDate)} - {formatDate(selectedSprint.endDate)}
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
                Chưa có task mock data cho tab {activeTab} trong {selectedSprint.name}.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/60">
                <div className="min-w-[1600px] bg-background/70">
                  <TaskHeaderRow />
                  <div className="divide-y divide-border/60">
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <button
        type="button"
        onClick={handleAddTask}
        className="fixed right-6 bottom-6 z-100 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-xl transition hover:scale-[1.02] hover:opacity-95"
      >
        <span aria-hidden="true">＋</span>
        Add task
      </button>
    </div>
  );
}

function TaskHeaderRow() {
  return (
    <div className="grid min-h-12 grid-cols-[80px_260px_240px_240px_240px_130px_150px_minmax(320px,1fr)_110px] items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <div>No.</div>
      <div>Task</div>
      <div>Jira</div>
      <div>Figma</div>
      <div>GitLab</div>
      <div>Env</div>
      <div>Status</div>
      <div>Notes</div>
      <div>Actions</div>
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
  const [jira, setJira] = useState(task.jira);
  const [figma, setFigma] = useState(task.figma);
  const [gitlab, setGitlab] = useState(task.gitlab);
  const [notes, setNotes] = useState(task.notes);

  return (
    <div className="grid min-h-20 grid-cols-[80px_260px_240px_240px_240px_130px_150px_minmax(320px,1fr)_110px] items-center gap-3 px-4 py-3">
      <div>
        <Badge variant="outline" className="font-mono">#{displayOrder}</Badge>
      </div>

      <div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => onBlurField(task.id, "title", title)}
          className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          placeholder="Task title"
        />
      </div>

      <LinkInput
        value={jira}
        onChange={setJira}
        onBlur={() => onBlurField(task.id, "jira", jira)}
      />

      <LinkInput
        value={figma}
        onChange={setFigma}
        onBlur={() => onBlurField(task.id, "figma", figma)}
      />

      <LinkInput
        value={gitlab}
        onChange={setGitlab}
        onBlur={() => onBlurField(task.id, "gitlab", gitlab)}
      />

      <div>
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
      </div>

      <div>
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
      </div>

      <div>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => onBlurField(task.id, "notes", notes)}
          className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          placeholder="Add note"
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="h-10 w-full rounded-xl border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/20"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function LinkInput({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
        placeholder="https://"
      />
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
        aria-label="Open link"
      >
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
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
        "h-10 w-full rounded-xl border border-border/70 px-3 text-sm font-medium capitalize outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15",
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
    <Select.Root value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
      <Select.Trigger className="inline-flex h-10 min-w-52 items-center justify-between rounded-full border border-border/70 bg-background px-4 text-sm font-medium outline-none transition hover:bg-muted focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15">
        <Select.Value />
        <Select.Icon>
          <span className="text-muted-foreground" aria-hidden="true">⌄</span>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner className="z-200 outline-none" sideOffset={8}>
          <Select.Popup className="w-[var(--anchor-width)] rounded-2xl border border-border/70 bg-popover p-1.5 shadow-2xl outline-none">
            {sprints.map((sprint) => (
              <Select.Item
                key={sprint.id}
                value={sprint.id}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition data-[highlighted]:bg-muted"
              >
                <div className="flex flex-col">
                  <Select.ItemText>{sprint.name}</Select.ItemText>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                  </span>
                </div>
                <Select.ItemIndicator>
                  <span className="text-primary" aria-hidden="true">✓</span>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
