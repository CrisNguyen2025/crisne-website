import { Loader2 } from "lucide-react";

export default function WorkflowEditorLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground font-medium">Loading workflow canvas...</span>
      </div>
    </div>
  );
}
