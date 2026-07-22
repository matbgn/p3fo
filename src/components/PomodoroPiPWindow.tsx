import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PomodoroPiPContent } from '@/components/PomodoroPiPContent';
import { TravelerPiPContent } from '@/components/TravelerPiPContent';
import { useDocumentPiP } from '@/hooks/useDocumentPiP';
import { usePomodoro } from '@/hooks/usePomodoro';
import { useTraveler } from '@/hooks/useTraveler';
import { FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';
import { useSettingsContext } from '@/context/SettingsContext';
import { pipService } from '@/lib/pip-window';
import { useTravelerIdleState } from '@/lib/traveler-idle-state';

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
  const traveler = useTraveler();
  const { settings } = useSettingsContext();
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const idleControls = useTravelerIdleState();

  const travelerActive = traveler.travelerEnabled && traveler.state.phase !== 'idle';
  const travelerTransitioning = traveler.travelerEnabled && traveler.phaseTransition !== null;
  const pomodoroActive = pomodoro.pomodoroEnabled && pomodoro.state.phase !== 'idle';
  const pomodoroTransitioning = pomodoro.pomodoroEnabled && pomodoro.phaseTransition !== null;
  const anyTimerEnabled = pomodoro.pomodoroEnabled || traveler.travelerEnabled;

  // Auto-open PiP when a session starts (idle → active), but only once per
  // session. We track the previous "active" state and only trigger on the
  // rising edge, so manual close mid-session is respected.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (!focusConfig.enablePiP || !focusConfig.autoOpenPiPOnStart || !anyTimerEnabled) {
      wasActiveRef.current = false;
      return;
    }
    const isActive = travelerActive || pomodoroActive;
    if (isActive && !wasActiveRef.current && !isPiPActive && isSupported) {
      openPiP(focusConfig.pipWidth, focusConfig.pipHeight);
    }
    wasActiveRef.current = isActive;
  }, [travelerActive, pomodoroActive, focusConfig.enablePiP, focusConfig.autoOpenPiPOnStart,
      focusConfig.pipWidth, focusConfig.pipHeight, anyTimerEnabled, isPiPActive, isSupported, openPiP]);

  useEffect(() => {
    if (!isPiPActive || !focusConfig.enablePiP || !anyTimerEnabled) {
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

    if (travelerActive || travelerTransitioning) {
      rootRef.current.render(
        <TravelerPiPContent
          phase={traveler.state.phase}
          remaining={traveler.remaining}
          total={traveler.total}
          progress={traveler.progress}
          departure={traveler.state.departure}
          destination={traveler.state.destination}
          travelMode={traveler.state.travelMode}
          durationPreviewMs={null}
          isRunning={traveler.isRunning}
          isPaused={traveler.isPaused}
          phaseTransition={traveler.phaseTransition}
          onPause={traveler.pause}
          onResume={traveler.resume}
          onSkip={traveler.skip}
          onReset={traveler.reset}
          onDismissTransition={traveler.dismissTransition}
          onSelectDeparture={idleControls.setDeparture}
          onSelectDestination={idleControls.setDestination}
          onSelectTravelMode={idleControls.setTravelMode}
          onSelectActiveTechnique={idleControls.setActiveTechnique}
          activeTechnique="traveler"
          onStart={idleControls.start}
          onSearch={idleControls.search}
          searchLoading={idleControls.searchLoading}
          pomodoroEnabled={pomodoro.pomodoroEnabled}
          onStartPomodoro={idleControls.startPomodoro}
        />
      );
    } else if (pomodoroActive || pomodoroTransitioning) {
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
    } else if (pomodoro.pomodoroEnabled && idleControls.activeTechnique === 'pomodoro') {
      // Pomodoro idle state — show start button to launch a work session
      rootRef.current.render(
        <PomodoroPiPContent
          phase="idle"
          remaining={0}
          total={0}
          progress={0}
          cycleCount={0}
          displayCycleIndex={-1}
          cyclesBeforeLongBreak={pomodoro.config.cyclesBeforeLongBreak}
          isRunning={false}
          isPaused={false}
          phaseTransition={null}
          onPause={() => {}}
          onResume={() => {}}
          onSkip={() => {}}
          onReset={() => {}}
          onStartWork={() => {
            pomodoro.startWork();
            idleControls.setActiveTechnique('pomodoro');
          }}
          onDismissTransition={() => {}}
          activeTechnique="pomodoro"
          onSelectActiveTechnique={idleControls.setActiveTechnique}
          travelerEnabled={traveler.travelerEnabled}
        />
      );
    } else if (traveler.travelerEnabled) {
      // Traveler idle state — show destination pickers in the PiP
      rootRef.current.render(
        <TravelerPiPContent
          phase="idle"
          remaining={0}
          total={0}
          progress={0}
          departure={idleControls.departure}
          destination={idleControls.destination}
          travelMode={idleControls.travelMode}
          durationPreviewMs={idleControls.durationPreviewMs}
          isRunning={false}
          isPaused={false}
          phaseTransition={null}
          onPause={() => {}}
          onResume={() => {}}
          onSkip={() => {}}
          onReset={idleControls.reset}
          onDismissTransition={() => {}}
          onSelectDeparture={idleControls.setDeparture}
          onSelectDestination={idleControls.setDestination}
          onSelectTravelMode={idleControls.setTravelMode}
          onSelectActiveTechnique={idleControls.setActiveTechnique}
          activeTechnique="traveler"
          onStart={idleControls.start}
          onSearch={idleControls.search}
          searchLoading={idleControls.searchLoading}
          pomodoroEnabled={pomodoro.pomodoroEnabled}
          onStartPomodoro={idleControls.startPomodoro}
        />
      );
    } else {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPiPActive, focusConfig.enablePiP, anyTimerEnabled,
      travelerActive, travelerTransitioning, traveler.state.phase, traveler.remaining, traveler.total, traveler.progress,
      traveler.state.departure, traveler.state.destination, traveler.isRunning, traveler.isPaused,
      traveler.phaseTransition, traveler.pause, traveler.resume, traveler.skip, traveler.reset, traveler.dismissTransition,
      idleControls.departure, idleControls.destination, idleControls.travelMode, idleControls.durationPreviewMs,
      idleControls.activeTechnique, idleControls.setActiveTechnique,
      idleControls.setDeparture, idleControls.setDestination, idleControls.start,
      idleControls.search, idleControls.searchLoading, idleControls.reset, idleControls.startPomodoro,
      pomodoroActive, pomodoroTransitioning, pomodoro.state.phase, pomodoro.remaining, pomodoro.total, pomodoro.progress,
      pomodoro.state.cycleCount, pomodoro.config.cyclesBeforeLongBreak, pomodoro.isRunning, pomodoro.isPaused,
      pomodoro.phaseTransition, pomodoro.pause, pomodoro.resume, pomodoro.skip,
      pomodoro.reset, pomodoro.startWork, pomodoro.dismissTransition, pomodoro.displayCycleIndex]);

  useEffect(() => {
    if (!focusConfig.enablePiP || !anyTimerEnabled || !isSupported) return;

    const shouldClose = !pomodoro.pomodoroEnabled && !traveler.travelerEnabled;
    if (shouldClose && isPiPActive) {
      console.log(`${LOG} all timers disabled, closing PiP`);
      deferUnmount(rootRef.current);
      rootRef.current = null;
      closePiP();
    }
  }, [pomodoro.pomodoroEnabled, traveler.travelerEnabled, focusConfig.enablePiP,
      isPiPActive, isSupported, closePiP, anyTimerEnabled]);

  useEffect(() => {
    if (!isPiPActive || !focusConfig.enablePiP || !anyTimerEnabled) return;

    if (traveler.phaseTransition || pomodoro.phaseTransition) {
      console.log(`${LOG} phase transition active`);
      pipService.focus();
    }
  }, [traveler.phaseTransition, pomodoro.phaseTransition, isPiPActive, focusConfig.enablePiP, anyTimerEnabled]);

  useEffect(() => {
    return () => {
      deferUnmount(rootRef.current);
      rootRef.current = null;
    };
  }, []);

  if (!isSupported || !focusConfig.enablePiP || !anyTimerEnabled) {
    return null;
  }

  return null;
};

export default PomodoroPiPWindow;