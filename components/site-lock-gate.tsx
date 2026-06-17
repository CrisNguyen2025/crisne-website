"use client";

import { FormEvent, useId, useState, useSyncExternalStore } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "crisne-site-unlocked";
const ACCESS_CODE = "Nta@123";
const siteLockServerSnapshot = false;

function getSiteLockSnapshot() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function subscribeToSiteLock(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

interface SiteLockGateProps {
  readonly children: React.ReactNode;
}

export function SiteLockGate({ children }: SiteLockGateProps) {
  const inputId = useId();
  const storedUnlocked = useSyncExternalStore(
    subscribeToSiteLock,
    getSiteLockSnapshot,
    () => siteLockServerSnapshot,
  );
  const [unlockedInSession, setUnlockedInSession] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const unlocked = storedUnlocked || unlockedInSession;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (code.trim() !== ACCESS_CODE) {
      setError("Mật khẩu chưa đúng. Vui lòng thử lại.");
      return;
    }

    localStorage.setItem(STORAGE_KEY, "true");
    setUnlockedInSession(true);
    setError("");
  };

  const handleCodeChange = (value: string) => {
    setCode(value.slice(0, ACCESS_CODE.length));
    if (error) setError("");
  };

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none select-none blur-sm brightness-75" aria-hidden="true">
        {children}
      </div>

      <div className="fixed inset-0 z-200 grid place-items-center bg-background/80 px-6 backdrop-blur-xl">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-title`}
          className="w-full max-w-md rounded-3xl border border-border/70 bg-card/95 p-6 shadow-2xl sm:p-8"
        >
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LockKeyhole className="size-7" aria-hidden="true" />
          </div>

          <div className="mb-6 text-center">
            <p className="mb-2 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
              Private access
            </p>
            <h2 id={`${inputId}-title`} className="text-2xl font-bold tracking-tight">
              Nhập mật khẩu để mở khoá
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                id={inputId}
                value={code}
                onChange={(event) => handleCodeChange(event.target.value)}
                autoFocus
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={ACCESS_CODE.length}
                placeholder="XXXXXX"
                className={cn(
                  "h-12 w-full rounded-xl border bg-background px-4 text-center font-mono text-lg font-semibold tracking-[0.2em] outline-none transition",
                  "focus:border-primary focus:ring-4 focus:ring-primary/15",
                  error ? "border-destructive text-destructive" : "border-border",
                )}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${inputId}-error` : undefined}
              />
              {error && (
                <p id={`${inputId}-error`} className="mt-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <Button type="submit" size="lg" className="h-11 w-full gap-2">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Unlock
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
