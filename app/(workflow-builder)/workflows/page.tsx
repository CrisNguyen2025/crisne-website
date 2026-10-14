import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  createProject,
  createWorkflow,
  listProjects,
  listWorkflows,
} from "@/lib/workflow/repository";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FolderPlus,
  GitBranch,
  Layers,
  LogOut,
  Plus,
  Workflow as WorkflowIcon,
  Clock,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface WorkflowsPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function WorkflowsPage({ searchParams }: WorkflowsPageProps) {
  const session = await auth();
  const ownerEmail = session?.user?.email?.toLowerCase().trim();

  if (!ownerEmail) {
    redirect("/api/auth/signin?callbackUrl=/workflows");
  }

  let projects = await listProjects(ownerEmail);
  if (projects.length === 0) {
    const defaultProj = await createProject(ownerEmail, {
      name: "Default Project",
      description: "My first workflow project",
    });
    projects = [defaultProj];
  }

  const { projectId: queryProjectId } = await searchParams;
  const activeProject =
    projects.find((p) => p.id === queryProjectId) ?? projects[0];

  const workflows = await listWorkflows(ownerEmail, activeProject.id);

  async function handleCreateProject(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const desc = formData.get("description") as string;
    if (!name?.trim() || !ownerEmail) return;

    const newProj = await createProject(ownerEmail, {
      name: name.trim(),
      description: desc?.trim() || undefined,
    });
    revalidatePath("/workflows");
    redirect(`/workflows?projectId=${newProj.id}`);
  }

  async function handleCreateWorkflow(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const targetProjectId = (formData.get("projectId") as string) || activeProject.id;
    if (!name?.trim() || !ownerEmail) return;

    const newWf = await createWorkflow(ownerEmail, targetProjectId, name.trim());
    redirect(`/workflows/${newWf.id}`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <WorkflowIcon className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight">Workflow Builder</span>
              <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                v1.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle className="h-8 w-8 rounded-lg border border-border/60 text-foreground" />
            <span className="hidden text-xs text-muted-foreground sm:inline-block">
              {ownerEmail}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                aria-label="Sign out"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          {/* Left Column: Project Selector & Creation */}
          <aside className="w-full shrink-0 md:w-72">
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {projects.length}
                </span>
              </div>

              {/* Projects List */}
              <div className="mt-2 space-y-1">
                {projects.map((proj) => {
                  const isActive = proj.id === activeProject.id;
                  return (
                    <Link
                      key={proj.id}
                      href={`/workflows?projectId=${proj.id}`}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5 truncate">
                        <Layers className="h-4 w-4 shrink-0" />
                        <span className="truncate">{proj.name}</span>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? "opacity-90" : "opacity-40"}`} />
                    </Link>
                  );
                })}
              </div>

              {/* Create Project Form */}
              <div className="mt-6 border-t border-border/60 pt-4">
                <span className="text-xs font-medium text-muted-foreground">New Project</span>
                <form action={handleCreateProject} className="mt-2 space-y-2">
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Project name..."
                    className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-muted/60 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span>Create Project</span>
                  </button>
                </form>
              </div>
            </div>
          </aside>

          {/* Right Column: Workflows Grid */}
          <section className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {activeProject.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeProject.description || "Manage and automate your AI workflows."}
                </p>
              </div>

              {/* Create Workflow Dialog Trigger Form */}
              <form action={handleCreateWorkflow} className="flex items-center gap-2">
                <input type="hidden" name="projectId" value={activeProject.id} />
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="New workflow name..."
                  className="rounded-xl border border-border/80 bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Workflow</span>
                </button>
              </form>
            </div>

            {/* Workflows Grid */}
            <div className="mt-8">
              {workflows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <GitBranch className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">No workflows yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                    Create your first workflow in this project to start building visually with the DAG canvas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {workflows.map((wf) => (
                    <Link
                      key={wf.id}
                      href={`/workflows/${wf.id}`}
                      className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <GitBranch className="h-4 w-4" />
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {wf.draftGraphHash.slice(0, 8)}
                          </span>
                        </div>
                        <h2 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                          {wf.name}
                        </h2>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>
                        </div>
                        <span className="font-medium text-primary">Open Canvas →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
