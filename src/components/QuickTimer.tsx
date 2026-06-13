import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Pause, ArrowRight, Play, SkipForward, Apple, RotateCcw, PictureInPicture2, PlaneTakeoff, Loader2, ChevronDown, Train, Coffee, ChartNoAxesGantt, Search, SearchCheck, SearchX } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useTasks } from "@/hooks/useTasks";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePomodoro } from "@/hooks/usePomodoro";
import { useTraveler } from "@/hooks/useTraveler";
import { setTravelerIdleState, registerTravelerStartFn, registerTravelerSearchFn, registerTravelerResetFn, registerPomodoroStartFn, setSearchLoading, subscribeTravelerIdle, readTravelerIdleSnapshot } from "@/lib/traveler-idle-state";
import { useDocumentPiP } from "@/hooks/useDocumentPiP";
import { PomodoroPhase } from "@/lib/pomodoro-types";
import { CITIES, getCityByCode, TravelMode, TravelerConfig, DEFAULT_TRAVELER_CONFIG, getShortFlightDestinations, getFlightDurationMs, getFlightDurationColor } from "@/lib/traveler-types";
import { fetchFlightDuration, getTrainDuration, computeBreakDuration, formatDuration } from "@/lib/traveler-api";
import { eventBus } from "@/lib/events";
import { useSettingsContext } from "@/context/SettingsContext";

const phaseDotColor: Record<PomodoroPhase, string> = {
  idle: 'bg-muted-foreground/30',
  work: 'bg-red-500',
  'short-break': 'bg-green-500',
  'long-break': 'bg-blue-500',
};

const phaseLabel: Record<PomodoroPhase, string> = {
  idle: '',
  work: 'Focus',
  'short-break': 'Break',
  'long-break': 'Long Break',
};

const formatPomodoroTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatTravelerTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

type TimerMode = 'pomodoro' | 'traveler';

export const QuickTimer: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const { toggleTimer } = useTasks();
  const pomodoro = usePomodoro();
  const traveler = useTraveler();
  const { isSupported: pipSupported, isPiPActive, openPiP, closePiP } = useDocumentPiP();
  const { settings, updateSettings } = useSettingsContext();

  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [departure, setDeparture] = useState(traveler.config.departure);
  const [destination, setDestination] = useState(traveler.config.destination);
  const [travelMode, setTravelMode] = useState<TravelMode>(traveler.config.travelMode);
  const [durationPreview, setDurationPreview] = useState<{ travelMs: number; breakMs: number } | null>(null);

  const persistTravelerConfig = useCallback((patch: Partial<TravelerConfig>) => {
    const current = settings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG;
    updateSettings({ travelerConfig: { ...current, ...patch } }, 'user');
  }, [settings.travelerConfig, updateSettings]);
  const [durationLoading, setDurationLoading] = useState(false);

  // Derived flags used both by the sync effect below and by the JSX
  const pomodoroActive = pomodoro.pomodoroEnabled && pomodoro.state.phase !== 'idle';
  const travelerActive = traveler.travelerEnabled && traveler.state.phase !== 'idle';
  const showOverlay = pomodoro.focusConfig.showFocusOverlay;
  const activeMode: TimerMode = travelerActive ? 'traveler' : pomodoroActive ? 'pomodoro' : timerMode;
  const anyTimerEnabled = pomodoro.pomodoroEnabled || traveler.travelerEnabled;

  const { runningTask, lastStoppedTask } = React.useMemo(() => {
    let running = null;
    let lastStopped = null;
    let lastStoppedTime = 0;
    
    for (const task of tasks) {
      if (task.userId && task.userId !== currentUserId) {
        continue;
      }
      if (task.timer && task.timer.length > 0) {
        const lastEntry = task.timer[task.timer.length - 1];
        if (lastEntry) {
          if (lastEntry.endTime === 0) {
            running = { task, entry: lastEntry };
          } else if (lastEntry.endTime > lastStoppedTime) {
            lastStopped = { task, entry: lastEntry };
            lastStoppedTime = lastEntry.endTime;
          }
        }
      }
    }
    return { runningTask: running, lastStoppedTask: lastStopped };
  }, [tasks, currentUserId]);
  
  const [elapsedTime, setElapsedTime] = React.useState(0);
  
  React.useEffect(() => {
    if (!runningTask) {
      setElapsedTime(0);
      return;
    }
    
    if (runningTask.entry.endTime > 0) {
      setElapsedTime(runningTask.entry.endTime - runningTask.entry.startTime);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - runningTask.entry.startTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [runningTask]);
  
  React.useEffect(() => {
    const onTimerToggled = () => {
      setElapsedTime(prev => prev + 1);
    };
    
    eventBus.subscribe("timerToggled", onTimerToggled);
    return () => {
      eventBus.unsubscribe("timerToggled", onTimerToggled);
    };
  }, []);

  // Mutual exclusivity: when one starts, reset the other
  React.useEffect(() => {
    const onTravelerStarted = () => {
      if (pomodoro.state.phase !== 'idle') {
        pomodoro.reset();
      }
    };
    const onPomodoroStarted = () => {
      if (traveler.state.phase !== 'idle') {
        traveler.reset();
      }
    };
    eventBus.subscribe('travelerStarted', onTravelerStarted);
    eventBus.subscribe('pomodoroStarted', onPomodoroStarted);
    return () => {
      eventBus.unsubscribe('travelerStarted', onTravelerStarted);
      eventBus.unsubscribe('pomodoroStarted', onPomodoroStarted);
    };
  }, [pomodoro, traveler]);

  // Manual search callback — the user must press the magnifier button
  // to compute the travel duration. No live search on every keystroke.
  const searchTravelDuration = useCallback(async () => {
    if (!departure || !destination || departure.trim() === destination.trim()) {
      setDurationPreview(null);
      return;
    }

    setDurationLoading(true);
    setSearchLoading(true);

    try {
      let travelMs: number | null = null;
      if (travelMode === 'flight') {
        const from = getCityByCode(departure);
        const to = getCityByCode(destination);
        if (from && to) {
          travelMs = await fetchFlightDuration(from, to);
        }
      } else {
        const result = await getTrainDuration(departure, destination);
        travelMs = result ? result.travelDurationMs : null;
      }
      if (travelMs !== null) {
        setDurationPreview({ travelMs, breakMs: computeBreakDuration(travelMs) });
      } else {
        setDurationPreview(null);
      }
    } catch (err) {
      console.error('Travel duration fetch failed:', err);
      setDurationPreview(null);
    } finally {
      setDurationLoading(false);
      setSearchLoading(false);
    }
  }, [departure, destination, travelMode]);

  // Clear destination if it becomes unreachable (e.g. when flight mode
  // is active and a new departure would exceed the 3h threshold).
  React.useEffect(() => {
    if (!departure || !destination) return;
    if (travelMode !== 'flight') return;
    const reachable = getShortFlightDestinations(departure);
    if (!reachable.includes(destination)) {
      setDestination('');
    }
  }, [departure, travelMode, destination]);

  // Auto-compute flight duration as soon as both cities are set.
  // Flight mode uses a local lookup (no API call), so we don't need to
  // wait for the user to press the magnifier. Train mode is left to
  // the manual `searchTravelDuration` callback (MOTIS API call).
  React.useEffect(() => {
    if (travelMode !== 'flight') return;
    if (!departure || !destination || departure === destination) return;
    const from = getCityByCode(departure);
    const to = getCityByCode(destination);
    if (!from || !to) return;
    let cancelled = false;
    fetchFlightDuration(from, to).then((travelMs) => {
      if (cancelled) return;
      if (travelMs !== null) {
        setDurationPreview({ travelMs, breakMs: computeBreakDuration(travelMs) });
      } else {
        setDurationPreview(null);
      }
    });
    return () => { cancelled = true; };
  }, [departure, destination, travelMode]);

  // When the user switches travel mode locally (e.g. flight <-> train),
  // wipe both the inputs and any cached duration preview. Skip when the
  // change came from the store (PiP), because setTravelModeAndReset
  // already wiped the store and the subscription synced the empty values.
  const prevTravelModeRef = React.useRef(travelMode);
  React.useEffect(() => {
    if (prevTravelModeRef.current === travelMode) return;
    const fromStore = syncingFromStoreRef.current;
    prevTravelModeRef.current = travelMode;
    if (fromStore) return;
    setDeparture('');
    setDestination('');
    setDurationPreview(null);
    setSearchLoading(false);
  }, [travelMode]);

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleQuickPiP = React.useCallback(async () => {
    if (isPiPActive) {
      closePiP();
    } else {
      await openPiP(pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight);
    }
  }, [isPiPActive, openPiP, closePiP, pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight]);

  const handleStartTraveler = useCallback(() => {
    if (!departure || !destination || !durationPreview) return;
    traveler.startWork(departure, destination, durationPreview.travelMs, travelMode);
  }, [departure, destination, durationPreview, traveler, travelMode]);

  // Ref to suppress the push effect when state changes originate from
  // the store subscription (PiP edits). Without this, PiP edits → store
  // → QuickTimer sync → push effect overwrites store → PiP re-renders
  // with stale values, causing the window to flip back to Pomodoro.
  const syncingFromStoreRef = React.useRef(false);

  // Sync local state to the shared Traveler idle store so the PiP can
  // display the same destination pickers when the user is in idle mode.
  // Skip when the change originated from a store sync to avoid loops.
  useEffect(() => {
    if (syncingFromStoreRef.current) {
      syncingFromStoreRef.current = false;
      return;
    }
    setTravelerIdleState({
      departure,
      destination,
      travelMode,
      activeTechnique: activeMode,
      durationPreviewMs: durationPreview?.travelMs ?? null,
    });
  }, [departure, destination, travelMode, activeMode, durationPreview]);

  // Pull from the shared store when it changes (e.g. when the user
  // changes the travel mode or technique in the PiP). This keeps both
  // views in sync. We sync ALL fields so that PiP edits propagate back
  // to QuickTimer. The ref flag prevents the push effect from
  // immediately overwriting the store with stale local values.
  useEffect(() => {
    return subscribeTravelerIdle(() => {
      const snap = readTravelerIdleSnapshot();
      let changed = false;
      if (snap.departure !== departure) { setDeparture(snap.departure); changed = true; }
      if (snap.destination !== destination) { setDestination(snap.destination); changed = true; }
      if (snap.travelMode !== travelMode) { setTravelMode(snap.travelMode); changed = true; }
      if (snap.activeTechnique !== activeMode) { setTimerMode(snap.activeTechnique); changed = true; }
      if (snap.durationPreviewMs === null && durationPreview !== null) { setDurationPreview(null); changed = true; }
      if (changed) syncingFromStoreRef.current = true;
    });
  }, [departure, destination, travelMode, activeMode, durationPreview]);

  // Register the start callback so the PiP can invoke it.
  useEffect(() => {
    return registerTravelerStartFn(handleStartTraveler);
  }, [handleStartTraveler]);

  // Register the search callback so the PiP can invoke it.
  useEffect(() => {
    return registerTravelerSearchFn(searchTravelDuration);
  }, [searchTravelDuration]);

  // Register the reset callback so the PiP can invoke it.
  useEffect(() => {
    return registerTravelerResetFn(() => {
      traveler.reset();
      setDeparture('');
      setDestination('');
      setDurationPreview(null);
      setSearchLoading(false);
      setTimerMode('pomodoro');
    });
  }, [traveler]);

  // Register the pomodoro-start callback so the PiP can invoke it.
  useEffect(() => {
    return registerPomodoroStartFn(() => {
      pomodoro.startWork();
    });
  }, [pomodoro]);

  // (derived flags: pomodoroActive, travelerActive, showOverlay,
  //  activeMode, anyTimerEnabled are declared at the top of the
  //  component so the sync effect below can read them.)

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-secondary rounded-md min-h-[32px] sm:min-h-[36px]">
      {pomodoroActive || (activeMode === 'pomodoro' && pomodoro.pomodoroEnabled && pomodoro.displayCycleIndex >= 0) ? (
        // Pomodoro active display
        <>
          <span className="shrink-0" title={phaseLabel[pomodoro.state.phase]}>
            {pomodoro.state.phase === 'work' ? (
              <ChartNoAxesGantt className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
            ) : (
              <Coffee className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
            )}
          </span>
          <div className={`w-2 h-2 rounded-full shrink-0 ${phaseDotColor[pomodoro.state.phase]}`} title={phaseLabel[pomodoro.state.phase]} />
          {pomodoro.state.phase !== 'idle' ? (
            <div className="text-xs sm:text-sm font-mono shrink-0 font-semibold">
              {formatPomodoroTime(pomodoro.remaining)}
            </div>
          ) : (
            <div className="text-xs sm:text-sm font-mono shrink-0 text-muted-foreground font-semibold">
              {pomodoro.config.workDuration > 0
                ? formatPomodoroTime(pomodoro.config.workDuration)
                : '--:--'}
            </div>
          )}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: pomodoro.config.cyclesBeforeLongBreak }, (_, i) => {
              const idx = pomodoro.displayCycleIndex;
              if (pomodoro.state.phase === 'long-break') {
                return <div key={i} className="w-1.5 h-1.5 rounded-full transition-colors bg-blue-500" />;
              }
              const isFinished = idx >= 0 && i < idx;
              const isCurrent = idx >= 0 && i === idx;
              const isCurrentWork = isCurrent && pomodoro.state.phase === 'work';
              const dotColor = isFinished
                ? 'bg-green-500'
                : isCurrentWork
                  ? 'bg-red-500'
                  : isCurrent
                    ? 'bg-green-500'
                    : 'bg-muted-foreground/30';
              return <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${dotColor}`} />;
            })}
          </div>
          {pomodoro.isRunning && !pomodoro.isPaused ? (
            <Button size="sm" variant="outline" onClick={pomodoro.pause} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Pause">
              <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : pomodoro.isPaused ? (
            <Button size="sm" variant="outline" onClick={pomodoro.resume} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Resume">
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : (
            pomodoro.state.phase === 'idle' && pomodoro.displayCycleIndex >= 0 && (
              <Button size="sm" variant="outline" onClick={() => { pomodoro.startWork(); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Start work">
                <Play className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            )
          )}
          {pomodoro.state.phase !== 'idle' && (
            <Button size="sm" variant="outline" onClick={() => { pomodoro.skip(); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Skip phase">
              <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { pomodoro.reset(); setTimerMode('pomodoro'); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Reset">
            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          {pipSupported && !showOverlay && (
            <Button size="sm" variant="outline" onClick={handleQuickPiP} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={isPiPActive ? 'Close PiP' : 'Open in PiP'}>
              <PictureInPicture2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {/* Technique picker chevron + jump-to-task arrow */}
          {anyTimerEnabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Switch technique">
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {pomodoro.pomodoroEnabled && (
                  <DropdownMenuItem onClick={() => setTimerMode('pomodoro')}>
                    <Apple className="mr-2 h-4 w-4" />
                    Pomodoro
                  </DropdownMenuItem>
                )}
                {traveler.travelerEnabled && (
                  <DropdownMenuItem onClick={() => { setTimerMode('traveler'); pomodoro.reset(); }}>
                    <PlaneTakeoff className="mr-2 h-4 w-4" />
                    Traveler
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onJumpToTask && (
            <Button size="sm" variant="outline" onClick={() => onJumpToTask(runningTask ? runningTask.task.id : '')} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Jump to task">
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
        </>
      ) : (travelerActive || (activeMode === 'traveler' && traveler.travelerEnabled)) ? (
        // Traveler active display (or idle with Traveler mode selected)
        <>
          {traveler.state.phase !== 'idle' ? (
            <>
              <span className="shrink-0" title={traveler.state.phase === 'work' ? 'Flight' : 'Break'}>
                {traveler.state.phase === 'work' ? (
                  <ChartNoAxesGantt className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
                ) : (
                  <Coffee className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
                )}
              </span>
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${traveler.state.phase === 'work' ? 'bg-red-500' : 'bg-green-500'}`}
                title={traveler.state.phase === 'work' ? 'Flight' : 'Break'}
              />
            </>
          ) : (
            <Select value={travelMode} onValueChange={(v) => setTravelMode(v as TravelMode)}>
              <SelectTrigger className="w-[42px] h-7 sm:h-8 text-xs px-2">
                {travelMode === 'flight' ? (
                  <PlaneTakeoff className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <Train className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flight">
                  <span className="flex items-center gap-1.5"><PlaneTakeoff className="h-3 w-3" /> Flight</span>
                </SelectItem>
                <SelectItem value="train">
                  <span className="flex items-center gap-1.5"><Train className="h-3 w-3" /> Train</span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {traveler.state.phase !== 'idle' ? (
            <div className="text-xs sm:text-sm font-mono shrink-0 font-semibold text-foreground">
              {formatTravelerTime(traveler.remaining)}
            </div>
          ) : travelMode === 'train' ? (
            <Input
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              placeholder="From"
              className="w-[100px] h-7 sm:h-8 text-xs px-2"
            />
          ) : (
            <Select value={departure} onValueChange={setDeparture}>
              <SelectTrigger className="w-[64px] h-7 sm:h-8 text-xs px-2">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((city) => (
                  <SelectItem key={city.code} value={city.code}>
                    {city.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {traveler.state.phase !== 'idle' ? (
            <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
              {traveler.state.departure}→{traveler.state.destination}
            </span>
          ) : travelMode === 'train' ? (
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="To"
              className="w-[100px] h-7 sm:h-8 text-xs px-2"
            />
          ) : (
            <>
              <span className="text-xs text-muted-foreground">→</span>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="w-[64px] h-7 sm:h-8 text-xs px-2">
                  <SelectValue placeholder="To" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES
                    .filter((city) => {
                      if (city.code === departure) return false;
                      if (travelMode === 'flight' && departure) {
                        return getShortFlightDestinations(departure).includes(city.code);
                      }
                      return true;
                    })
                    .map((city) => {
                      const ms = travelMode === 'flight' && departure
                        ? getFlightDurationMs(departure, city.code) ?? Infinity
                        : Infinity;
                      const dotClass = travelMode === 'flight' && departure
                        ? getFlightDurationColor(ms)
                        : '';
                      return (
                        <SelectItem key={city.code} value={city.code}>
                          <span className="flex items-center gap-1.5">
                            {travelMode === 'flight' && departure && (
                              <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
                            )}
                            {city.code}
                          </span>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </>
          )}
          {traveler.state.phase === 'idle' && durationPreview && (
            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <span
                className={`inline-block w-2 h-2 rounded-full ${getFlightDurationColor(durationPreview.travelMs)}`}
                title={getFlightDurationColor(durationPreview.travelMs)}
              />
              {formatDuration(durationPreview.travelMs)}/{formatDuration(durationPreview.breakMs)}
            </span>
          )}
          {traveler.state.phase === 'idle' && departure && destination && travelMode !== 'flight' && (
            <Button
              size="sm"
              variant="outline"
              onClick={searchTravelDuration}
              disabled={durationLoading}
              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
              title="Search travel duration"
            >
              {durationLoading ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Search className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
            </Button>
          )}
          {traveler.state.phase === 'idle' && departure && destination && durationPreview && (
            <Button size="sm" variant="outline" onClick={handleStartTraveler} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Start Traveler timer">
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {traveler.isRunning && !traveler.isPaused ? (
            <Button size="sm" variant="outline" onClick={traveler.pause} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : traveler.isPaused ? (
            <Button size="sm" variant="outline" onClick={traveler.resume} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : null}
          {traveler.state.phase !== 'idle' && (
            <Button size="sm" variant="outline" onClick={traveler.skip} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Skip phase">
              <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => { traveler.reset(); setDeparture(''); setDestination(''); setDurationPreview(null); setTravelMode('flight'); setTimerMode('pomodoro'); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Reset">
            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          {pipSupported && !showOverlay && (
            <Button size="sm" variant="outline" onClick={handleQuickPiP} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={isPiPActive ? 'Close PiP' : 'Open in PiP'}>
              <PictureInPicture2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {/* Technique picker chevron + jump-to-task arrow */}
          {anyTimerEnabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Switch technique">
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {pomodoro.pomodoroEnabled && (
                  <DropdownMenuItem onClick={() => { setTimerMode('pomodoro'); traveler.reset(); }}>
                    <Apple className="mr-2 h-4 w-4" />
                    Pomodoro
                  </DropdownMenuItem>
                )}
                {traveler.travelerEnabled && (
                  <DropdownMenuItem onClick={() => setTimerMode('traveler')}>
                    <PlaneTakeoff className="mr-2 h-4 w-4" />
                    Traveler
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onJumpToTask && runningTask && (
            <Button size="sm" variant="outline" onClick={() => onJumpToTask(runningTask.task.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Jump to task">
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
        </>
      ) : runningTask ? (
        // No timer active, task running
        <>
          <div className="text-xs sm:text-sm font-medium truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px]">
            {runningTask.task.title}
          </div>
          <div className="text-xs sm:text-sm font-mono shrink-0">
            {formatTime(elapsedTime)}
          </div>
          {anyTimerEnabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Switch technique">
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {pomodoro.pomodoroEnabled && (
                  <DropdownMenuItem onClick={() => { setTimerMode('pomodoro'); pomodoro.startWork(runningTask.task.id); }}>
                    <Apple className="mr-2 h-4 w-4" />
                    Pomodoro
                  </DropdownMenuItem>
                )}
                {traveler.travelerEnabled && (
                  <DropdownMenuItem onClick={() => { setTimerMode('traveler'); }}>
                    <PlaneTakeoff className="mr-2 h-4 w-4" />
                    Traveler
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="outline" onClick={() => toggleTimer(runningTask.task.id, currentUserId)} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={runningTask.entry.endTime === 0 ? 'Pause task' : 'Resume task'}>
            {runningTask.entry.endTime === 0 ? (
              <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
            ) : (
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            )}
          </Button>
          {onJumpToTask && (
            <Button size="sm" variant="outline" onClick={() => onJumpToTask(runningTask.task.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Jump to task">
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
        </>
      ) : lastStoppedTask ? (
        // Last stopped task
        <>
          <button
            onClick={() => onJumpToTask && onJumpToTask(lastStoppedTask.task.id)}
            className="text-xs sm:text-sm text-muted-foreground/60 hover:text-muted-foreground truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px] cursor-pointer hover:underline transition-colors"
            title={lastStoppedTask.task.title}
          >
            {lastStoppedTask.task.title}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleTimer(lastStoppedTask.task.id, currentUserId)}
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground/60 hover:text-foreground"
            title="Resume timer"
          >
            <Play className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </>
      ) : (
        // No timer, no task
        <div className="text-xs sm:text-sm text-muted-foreground italic flex items-center h-full">
          No active timer
        </div>
      )}
    </div>
  );
};