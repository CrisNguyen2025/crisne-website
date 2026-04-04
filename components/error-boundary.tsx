"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to analytics service in production
    if (process.env.NODE_ENV === "production") {
      console.error("ErrorBoundary caught error:", error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 rounded-lg border border-destructive/20 bg-destructive/5">
          <AlertCircle
            className="w-12 h-12 text-destructive mb-4"
            aria-hidden="true"
          />
          <h2 className="text-lg font-semibold text-destructive mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            We apologize for the inconvenience. Please try refreshing the page
            or contact support if the problem persists.
          </p>
          <Button
            onClick={this.handleReset}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
