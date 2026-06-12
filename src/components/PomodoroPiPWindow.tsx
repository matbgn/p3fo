import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PomodoroPiPContent } from '@/components/PomodoroPiPContent';
import { useDocumentPiP } from '@/hooks/useDocumentPiP';
import { usePomodoro } from '@/hooks/usePomodoro';
import { FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';
import { useSettingsContext } from '@/context/SettingsContext';
import { pipService } from '@/lib/pip-window';

const LOG = '[PomodoroPiPWindow]';

function deferUnmount(root: ReturnType<typeof createRoot> | null): void {
  if (!root) return;
  setTimeout(() => {
    try { root.unmount(); } catch { /* already unmounted */ }
  }, 0);
}

export const PomodoroPiPWindow: React.FC = () => {
  const { isSupported, isPiPActive, openPiP, closePiP } = useDocumentPiP();
  const pomodoro = usePomodoro();
  const { settings } = useSettingsContext();
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);

  useEffect(() => {
    if (!isPiPActive || !focusConfig.enablePiP || !pomodoro.pomodoroEnabled) {
      deferUnmount(rootRef.current);
      rootRef.current = null;
      return;
    }

    const container = pipService.getContainer;
    if (!container) return;

    if (!rootRef.current) {
      console.log(`${LOG} creating React root in PiP container`);
      rootRef.current = createRoot(container);
    }

    rootRef.current.render(
      <PomodoroPiPContent
        phase={pomodoro.state.phase}
        remaining={pomodoro.remaining}
        total={pomodoro.total}
        progress={pomodoro.progress}
        cycleCount={pomodoro.state.cycleCount}
        displayCycleIndex={pomodoro.displayCycleIndex}
        cyclesBeforeLongBreak={pomodoro.config.cyclesBeforeLongBreak}
        isRunning={pomodoro.isRunning}
        isPaused={pomodoro.isPaused}
        phaseTransition={pomodoro.phaseTransition}
        onPause={pomodoro.pause}
        onResume={pomodoro.resume}
        onSkip={pomodoro.skip}
        onReset={pomodoro.reset}
        onStartWork={() => pomodoro.startWork()}
        onDismissTransition={pomodoro.dismissTransition}
      />
    );
  }, [isPiPActive, focusConfig.enablePiP, pomodoro.pomodoroEnabled, pomodoro.state.phase,
      pomodoro.remaining, pomodoro.total, pomodoro.progress, pomodoro.state.cycleCount,
      pomodoro.config.cyclesBeforeLongBreak, pomodoro.isRunning, pomodoro.isPaused,
      pomodoro.phaseTransition, pomodoro.pause, pomodoro.resume, pomodoro.skip,
      pomodoro.reset, pomodoro.startWork, pomodoro.dismissTransition, pomodoro.displayCycleIndex]);

  useEffect(() => {
    if (!focusConfig.enablePiP || !pomodoro.pomodoroEnabled || !isSupported) return;

    // Only close the PiP when the user explicitly disables the pomodoro
    // (pomodoroEnabled goes false). Do NOT close it when phase goes to
    // 'idle' after a break — the user should see the timer and be able
    // to manually start the next work cycle from the PiP.
    if (!pomodoro.pomodoroEnabled && isPiPActive) {
      console.log(`${LOG} pomodoro disabled, closing PiP`);
      deferUnmount(rootRef.current);
      rootRef.current = null;
      closePiP();
    }
  }, [pomodoro.pomodoroEnabled, focusConfig.enablePiP,
      isPiPActive, isSupported, closePiP]);

  useEffect(() => {
    if (!isPiPActive || !focusConfig.enablePiP || !pomodoro.pomodoroEnabled) return;

    if (pomodoro.phaseTransition) {
      console.log(`${LOG} phase transition active:`, pomodoro.phaseTransition);
      pipService.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoro.phaseTransition, isPiPActive, focusConfig.enablePiP, pomodoro.pomodoroEnabled]);

  useEffect(() => {
    return () => {
      deferUnmount(rootRef.current);
      rootRef.current = null;
    };
  }, []);

  if (!isSupported || !focusConfig.enablePiP || !pomodoro.pomodoroEnabled) {
    return null;
  }

  return null;
};

export default PomodoroPiPWindow;