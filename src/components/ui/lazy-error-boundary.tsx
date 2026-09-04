import React from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const RELOAD_KEY = "p3fo_chunk_reload";
const RELOAD_WINDOW_MS = 30_000;

const isChunkLoadError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    /dynamically imported module/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
};

// Reload at most once per window to avoid infinite reload loops when the
// server keeps failing (e.g. offline). sessionStorage survives the reload
// but is scoped to the tab, so other tabs are unaffected.
const shouldAutoReload = (): boolean => {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return true;
  }
};

interface LazyErrorBoundaryState {
  error: Error | null;
  reloading: boolean;
}

/**
 * Error boundary for React.lazy views. Stale deployments make the browser
 * request old hashed chunks that no longer exist; the failed dynamic import
 * would otherwise blank the whole view. On a chunk-load error we auto-reload
 * once so the fresh index.html (and its current chunk references) is picked
 * up. Other errors render a manual-retry fallback.
 */
export class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  LazyErrorBoundaryState
> {
  state: LazyErrorBoundaryState = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<LazyErrorBoundaryState> {
    if (isChunkLoadError(error) && shouldAutoReload()) {
      return { error, reloading: true };
    }
    return { error, reloading: false };
  }

  componentDidCatch(error: Error): void {
    if (this.state.reloading) {
      console.warn("Stale chunk detected, reloading to pick up new deployment…", error.message);
      window.location.reload();
    }
  }

  private handleRetry = () => {
    this.setState({ error: null, reloading: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.reloading) {
      return <LoadingSpinner label="…" />;
    }
    if (this.state.error) {
      return <LazyErrorFallback onRetry={this.handleRetry} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

export const LazyErrorFallback: React.FC<{
  onRetry?: () => void;
  onReload?: () => void;
}> = ({ onRetry, onReload }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <RefreshCw className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-sm">
        {t("errors.staleChunk", "This view could not be loaded, possibly because a new version was deployed. Reload to get the latest version.")}
      </p>
      <div className="flex gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("common.retry", "Retry")}
          </Button>
        )}
        <Button size="sm" onClick={onReload ?? (() => window.location.reload())}>
          <Loader2 className="mr-1 hidden" />
          {t("common.reload", "Reload")}
        </Button>
      </div>
    </div>
  );
};