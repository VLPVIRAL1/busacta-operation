import * as React from "react";
import { reportClientError } from "@/lib/error/client-error-reporter";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Optional label for the area that crashed (e.g. "Petty Cash dashboard"). */
  label?: string;
  /** Render a compact inline fallback instead of a full-page card. */
  compact?: boolean;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info });
    void reportClientError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      component_stack: info.componentStack ?? undefined,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      extra: { label: this.props.label },
    });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const body = (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-base font-semibold">
            {this.props.label ? `${this.props.label} crashed` : "Something went wrong"}
          </h2>
        </div>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="font-mono text-xs text-destructive">
            {error.name}: {error.message}
          </div>
        </div>
        {(error.stack || info?.componentStack) && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Stack trace</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
              {error.stack}
              {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ""}
            </pre>
          </details>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={this.reset}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              this.reset();
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Reload page
          </Button>
        </div>
      </div>
    );

    if (this.props.compact) {
      return <div className="rounded-lg border bg-card p-4">{body}</div>;
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-lg border bg-card p-6 shadow-sm">{body}</div>
      </div>
    );
  }
}
