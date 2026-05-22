import React, { memo } from "react";
import { otelProfilerCallback } from "@/telemetry";

/**
 * Wrap a component with React.Profiler so every mount/update is emitted
 * as an OpenTelemetry span (`react.render: <ComponentName>`).
 *
 * Usage:
 *   import { withProfiler } from "@/components/WithProfiler";
 *   export default withProfiler(MySlowComponent);
 *
 * The returned component is also `React.memo`ed to avoid emitting spans
 * for identical prop renders.
 */
export function withProfiler<P extends Record<string, unknown>>(
  Component: React.FC<P>,
  displayName?: string
) {
  const ProfilerWrapper: React.FC<P> = (props) => {
    const id = displayName ?? (Component.displayName || Component.name || "Unknown");
    return (
      <React.Profiler id={id} onRender={otelProfilerCallback}>
        <Component {...props} />
      </React.Profiler>
    );
  };
  ProfilerWrapper.displayName = `Profiler(${displayName ?? Component.displayName ?? Component.name})`;
  // Memo wrapper avoids emitting spans when props are shallow-equal
  return memo(ProfilerWrapper) as React.FC<P>;
}
