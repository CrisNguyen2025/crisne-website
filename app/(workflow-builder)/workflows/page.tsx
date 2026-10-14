import { auth, signOut } from "@/auth";

// Placeholder for the workflow builder (phase 1+). Access is enforced by proxy.ts.
export default async function WorkflowsPage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Workflow Builder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{session?.user?.email}</span>
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
