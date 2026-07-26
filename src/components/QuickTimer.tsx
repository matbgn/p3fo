import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Pause, Square, ArrowRight, Play, SkipForward, Apple, RotateCcw, PictureInPicture2, PlaneTakeoff, Loader2, ChevronDown, Train, Coffee, ChartNoAxesGantt, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cap task titles to a fixed character count for predictable strip width.
// CSS max-width varies by font; a char cap guarantees the same pixel budget
// regardless of content.
const TASK_TITLE_MAX_CHARS = 24;

const truncateTitle = (title: string, max = TASK_TITLE_MAX_CHARS) =>
  title.length > max ? title.slice(0, max - 1) + '…' : title;

const phaseDotColor: Record<PomodoroPhase, string> = {
  idle: 'bg-muted-foreground/30',
  work: 'bg-red-500',
  'short-break': 'bg-green-500',
  'long-break': 'bg-blue-500',
};

const phaseLabelKey: Record<PomodoroPhase, string> = {
  idle: '',
  work: 'quickTimer.phaseFocus',
  'short-break': 'quickTimer.phaseShortBreak',
  'long-break': 'quickTimer.phaseLongBreak',
};

type TimerMode = 'pomodoro' | 'traveler';

// ---------------------------------------------------------------------------
// Time formatters
// ---------------------------------------------------------------------------

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

const formatTime = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const PiPButton: React.FC<{ supported: boolean; isPiPActive: boolean; showOverlay: boolean; onToggle: () => void; label: string }> = ({ supported, isPiPActive, showOverlay, onToggle, label }) => {
  if (!supported || showOverlay) return null;
  return (
    <Button size="sm" variant="outline" onClick={onToggle} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={label} aria-label={label}>
      <PictureInPicture2 className="h-3 w-3 sm:h-4 sm:w-4" />
    </Button>
  );
};

const TechniqueSwitchChevron: React.FC<{ anyTimerEnabled: boolean; pomodoroEnabled: boolean; travelerEnabled: boolean; currentMode: TimerMode; onPomodoro: () => void; onTraveler: () => void; label: string }> = ({ anyTimerEnabled, pomodoroEnabled, travelerEnabled, currentMode, onPomodoro, onTraveler, label }) => {
  if (!anyTimerEnabled) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={label} aria-label={label}>
          <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {pomodoroEnabled && (
          <DropdownMenuItem onClick={onPomodoro}>
            <Apple className="mr-2 h-4 w-4" />
            {currentMode === 'traveler' ? 'Pomodoro' : '✓ Pomodoro'}
          </DropdownMenuItem>
        )}
        {travelerEnabled && (
          <DropdownMenuItem onClick={onTraveler}>
            <PlaneTakeoff className="mr-2 h-4 w-4" />
            {currentMode === 'pomodoro' ? 'Traveler' : '✓ Traveler'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const JumpToTaskArrow: React.FC<{ visible: boolean; taskId: string | undefined; onJump: (id: string) => void; label: string }> = ({ visible, taskId, onJump, label }) => {
  if (!visible) return null;
  return (
    <Button size="sm" variant="ghost" onClick={() => taskId && onJump(taskId)} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={label} aria-label={label}>
      <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
    </Button>
  );
};

const WhatsNextButton: React.FC<{ visible: boolean; label: string; title: string }> = ({ visible, label, title }) => {
  if (!visible) return null;
  return (
    <button
      onClick={() => eventBus.publish('spotlightReopen')}
      className="text-[11px] text-muted-foreground/70 hover:text-primary transition-colors shrink-0 ml-1 leading-tight text-left"
      title={title}
    >
      {label}
    </button>
  );
};

// ---------------------------------------------------------------------------
// TaskRunningBlock — the task zone content (always visible when a task is running)
// Visually distinct from technique controls: variant="ghost" + Square icon
// ---------------------------------------------------------------------------

const TaskRunningBlock: React.FC<{
  title: string;
  elapsed: number;
  isRunning: boolean;
  onPause: () => void;
  onJumpToTask?: (id: string) => void;
  taskId?: string;
  jumpLabel: string;
  pauseLabel: string;
  resumeLabel: string;
}> = ({ title, elapsed, isRunning, onPause, onJumpToTask, taskId, jumpLabel, pauseLabel, resumeLabel }) => {
  return (
    <>
      <div className="text-xs sm:text-sm font-medium min-w-0 flex-1 truncate" title={title}>
        {truncateTitle(title)}
      </div>
      <div className="text-xs sm:text-sm font-mono shrink-0 text-foreground">
        {formatTime(elapsed)}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onPause}
        className="h-7 w-7 sm:h-8 sm:w-8 p-0"
        title={isRunning ? pauseLabel : resumeLabel}
        aria-label={isRunning ? pauseLabel : resumeLabel}
      >
        {isRunning ? <Square className="h-3 w-3 sm:h-4 sm:w-4" /> : <Play className="h-3 w-3 sm:h-4 sm:w-4" />}
      </Button>
      <JumpToTaskArrow visible={!!onJumpToTask} taskId={taskId} onJump={onJumpToTask!} label={jumpLabel} />
    </>
  );
};

const LastStoppedTaskBlock: React.FC<{
  title: string;
  onResume: () => void;
  onJumpToTask?: (id: string) => void;
  taskId?: string;
  resumeLabel: string;
  jumpLabel: string;
}> = ({ title, onResume, onJumpToTask, taskId, resumeLabel, jumpLabel }) => {
  return (
    <>
      <button
        onClick={() => onJumpToTask && taskId && onJumpToTask(taskId)}
        className="text-xs sm:text-sm text-muted-foreground/60 hover:text-muted-foreground cursor-pointer hover:underline transition-colors truncate"
        title={title}
      >
        {truncateTitle(title)}
      </button>
      <Button size="sm" variant="ghost" onClick={onResume} className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground/60 hover:text-foreground" title={resumeLabel} aria-label={resumeLabel}>
        <Play className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
    </>
  );
};

// ---------------------------------------------------------------------------
// PomodoroControls — the technique zone when pomodoro is active or selected
// ---------------------------------------------------------------------------

const PomodoroControls: React.FC<{
  pomodoro: ReturnType<typeof usePomodoro>;
  t: ReturnType<typeof useTranslation>['t'];
}> = ({ pomodoro, t }) => {
  const phase = pomodoro.state.phase;
  const isIdle = phase === 'idle';

  return (
    <>
      <span className="shrink-0" title={t(phaseLabelKey[phase])}>
        {phase === 'work' ? (
          <ChartNoAxesGantt className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
        ) : phase === 'idle' ? (
          <Apple className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
        ) : (
          <Coffee className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
        )}
      </span>
      <div className={cn("w-2 h-2 rounded-full shrink-0", phaseDotColor[phase])} title={t(phaseLabelKey[phase])} />
      {!isIdle ? (
        <div className="text-xs sm:text-sm font-mono shrink-0 font-semibold">
          {formatPomodoroTime(pomodoro.remaining)}
        </div>
      ) : (
        <div className="text-xs sm:text-sm font-mono shrink-0 text-muted-foreground font-semibold">
          {pomodoro.config.workDuration > 0 ? formatPomodoroTime(pomodoro.config.workDuration) : '--:--'}
        </div>
      )}
      {/* Cycle progress dots */}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: pomodoro.config.cyclesBeforeLongBreak }, (_, i) => {
          const idx = pomodoro.displayCycleIndex;
          if (phase === 'long-break') return <div key={i} className="w-1.5 h-1.5 rounded-full transition-colors bg-blue-500" />;
          const isFinished = idx >= 0 && i < idx;
          const isCurrent = idx >= 0 && i === idx;
          const isCurrentWork = isCurrent && phase === 'work';
          const dotColor = isFinished ? 'bg-green-500' : isCurrentWork ? 'bg-red-500' : isCurrent ? 'bg-green-500' : 'bg-muted-foreground/30';
          return <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-colors", dotColor)} />;
        })}
      </div>
      {/* Pause / Resume / Start */}
      {pomodoro.isRunning && !pomodoro.isPaused ? (
        <Button size="sm" variant="outline" onClick={pomodoro.pause} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.pause')} aria-label={t('quickTimer.pause')}>
          <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      ) : pomodoro.isPaused ? (
        <Button size="sm" variant="outline" onClick={pomodoro.resume} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.resume')} aria-label={t('quickTimer.resume')}>
          <Play className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      ) : isIdle ? (
        <Button size="sm" variant="outline" onClick={() => pomodoro.startWork()} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.startWork')} aria-label={t('quickTimer.startWork')}>
          <Play className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      ) : null}
      {!isIdle && (
        <Button size="sm" variant="outline" onClick={() => pomodoro.skip()} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.skipPhase')} aria-label={t('quickTimer.skipPhase')}>
          <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      )}
      {!isIdle && (
        <Button size="sm" variant="outline" onClick={() => pomodoro.reset()} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.reset')} aria-label={t('quickTimer.reset')}>
          <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// TravelerControls — the technique zone when traveler is active or selected
// ---------------------------------------------------------------------------

const TravelerControls: React.FC<{
  traveler: ReturnType<typeof useTraveler>;
  t: ReturnType<typeof useTranslation>['t'];
  departure: string;
  destination: string;
  travelMode: TravelMode;
  durationPreview: { travelMs: number; breakMs: number } | null;
  durationLoading: boolean;
  onDeparture: (v: string) => void;
  onDestination: (v: string) => void;
  onTravelMode: (v: TravelMode) => void;
  onSearch: () => void;
  onStart: () => void;
}> = ({ traveler, t, departure, destination, travelMode, durationPreview, durationLoading, onDeparture, onDestination, onTravelMode, onSearch, onStart }) => {
  const phase = traveler.state.phase;
  const isIdle = phase === 'idle';
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Compact idle summary: "✈ GVA → CDG 2h30/0h30"
  const idleSummary = departure && destination
    ? `${departure} → ${destination}`
    : t('quickTimer.traveler');
  const idleDuration = durationPreview
    ? `${formatDuration(durationPreview.travelMs)}/${formatDuration(durationPreview.breakMs)}`
    : null;

  if (isIdle) {
    return (
      <>
        {/* Compact idle trigger — opens a popover with the full config */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 h-7 sm:h-8 px-2 rounded-md hover:bg-accent transition-colors text-xs font-medium">
              {travelMode === 'flight' ? <PlaneTakeoff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Train className="h-3 w-3 sm:h-4 sm:w-4" />}
              <span className="truncate max-w-[100px]">{idleSummary}</span>
              {idleDuration && (
                <span className="text-[10px] text-muted-foreground shrink-0">{idleDuration}</span>
              )}
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              {/* Travel mode */}
              <Select value={travelMode} onValueChange={(v) => onTravelMode(v as TravelMode)}>
                <SelectTrigger className="h-8 text-xs">
                  {travelMode === 'flight' ? <PlaneTakeoff className="h-3 w-3 mr-1" /> : <Train className="h-3 w-3 mr-1" />}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flight"><span className="flex items-center gap-1.5"><PlaneTakeoff className="h-3 w-3" /> {t('quickTimer.flightLabel')}</span></SelectItem>
                  <SelectItem value="train"><span className="flex items-center gap-1.5"><Train className="h-3 w-3" /> {t('quickTimer.train')}</span></SelectItem>
                </SelectContent>
              </Select>
              {/* Departure */}
              {travelMode === 'train' ? (
                <Input value={departure} onChange={(e) => onDeparture(e.target.value)} placeholder={t('quickTimer.from')} className="h-8 text-xs" />
              ) : (
                <Select value={departure} onValueChange={onDeparture}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('quickTimer.from')} /></SelectTrigger>
                  <SelectContent>
                    {CITIES.map((city) => <SelectItem key={city.code} value={city.code}>{city.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {/* Destination */}
              {travelMode === 'train' ? (
                <Input value={destination} onChange={(e) => onDestination(e.target.value)} placeholder={t('quickTimer.to')} className="h-8 text-xs" />
              ) : (
                <Select value={destination} onValueChange={onDestination}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('quickTimer.to')} /></SelectTrigger>
                  <SelectContent>
                    {CITIES.filter((city) => {
                      if (city.code === departure) return false;
                      if (travelMode === 'flight' && departure) return getShortFlightDestinations(departure).includes(city.code);
                      return true;
                    }).map((city) => {
                      const ms = travelMode === 'flight' && departure ? getFlightDurationMs(departure, city.code) ?? Infinity : Infinity;
                      const dotClass = travelMode === 'flight' && departure ? getFlightDurationColor(ms) : '';
                      return (
                        <SelectItem key={city.code} value={city.code}>
                          <span className="flex items-center gap-1.5">
                            {travelMode === 'flight' && departure && <span className={cn("inline-block w-2 h-2 rounded-full", dotClass)} />}
                            {city.code}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              {/* Duration preview */}
              {durationPreview && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("inline-block w-2 h-2 rounded-full", getFlightDurationColor(durationPreview.travelMs))} />
                  {formatDuration(durationPreview.travelMs)} / {formatDuration(durationPreview.breakMs)}
                </div>
              )}
              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {travelMode !== 'flight' && departure && destination && (
                  <Button size="sm" variant="outline" onClick={onSearch} disabled={durationLoading} className="h-8 px-2">
                    {durationLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                )}
                {departure && destination && durationPreview && (
                  <Button size="sm" onClick={() => { onStart(); setPopoverOpen(false); }} className="h-8 px-3">
                    <Play className="h-3 w-3 mr-1" /> {t('quickTimer.startTraveler')}
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </>
    );
  }

  // Active traveler — full countdown + controls inline
  return (
    <>
      <span className="shrink-0" title={phase === 'work' ? t('quickTimer.flight') : t('quickTimer.break')}>
        {phase === 'work' ? <ChartNoAxesGantt className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" /> : <Coffee className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />}
      </span>
      <div className={cn("w-2 h-2 rounded-full shrink-0", phase === 'work' ? 'bg-red-500' : 'bg-green-500')} title={phase === 'work' ? t('quickTimer.flight') : t('quickTimer.break')} />
      <div className="text-xs sm:text-sm font-mono shrink-0 font-semibold text-foreground">{formatTravelerTime(traveler.remaining)}</div>
      <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">{traveler.state.departure}→{traveler.state.destination}</span>
      {traveler.isRunning && !traveler.isPaused ? (
        <Button size="sm" variant="outline" onClick={traveler.pause} className="h-7 w-7 sm:h-8 sm:w-8 p-0" aria-label={t('quickTimer.pause')}>
          <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      ) : traveler.isPaused ? (
        <Button size="sm" variant="outline" onClick={traveler.resume} className="h-7 w-7 sm:h-8 sm:w-8 p-0" aria-label={t('quickTimer.resume')}>
          <Play className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={traveler.skip} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.skipPhase')} aria-label={t('quickTimer.skipPhase')}>
        <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
      <Button size="sm" variant="outline" onClick={() => traveler.reset()} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={t('quickTimer.reset')} aria-label={t('quickTimer.reset')}>
        <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
    </>
  );
};

// ---------------------------------------------------------------------------
// Main component — two-zone layout
// ---------------------------------------------------------------------------

export const QuickTimer: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const { t } = useTranslation();
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const { toggleTimer } = useTasks();
  const pomodoro = usePomodoro();
  const traveler = useTraveler();
  const { isSupported: pipSupported, isPiPActive, openPiP, closePiP } = useDocumentPiP();
  const { settings } = useSettingsContext();

  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [departure, setDeparture] = useState(traveler.config.departure);
  const [destination, setDestination] = useState(traveler.config.destination);
  const [travelMode, setTravelMode] = useState<TravelMode>(traveler.config.travelMode);
  const [durationPreview, setDurationPreview] = useState<{ travelMs: number; breakMs: number } | null>(null);
  const [durationLoading, setDurationLoading] = useState(false);
  const [spotlightVisible, setSpotlightVisible] = useState(false);

  // Derived flags
  const pomodoroActive = pomodoro.pomodoroEnabled && pomodoro.state.phase !== 'idle';
  const travelerActive = traveler.travelerEnabled && traveler.state.phase !== 'idle';
  const showOverlay = pomodoro.focusConfig.showFocusOverlay;
  const activeMode: TimerMode = travelerActive ? 'traveler' : pomodoroActive ? 'pomodoro' : timerMode;
  const anyTimerEnabled = pomodoro.pomodoroEnabled || traveler.travelerEnabled;

  // ---- Task running state ----
  const { runningTask, lastStoppedTask } = useMemo(() => {
    let running = null;
    let lastStopped = null;
    let lastStoppedTime = 0;
    for (const task of tasks) {
      if (task.userId && task.userId !== currentUserId) continue;
      if (task.triageStatus === 'Archived') continue;
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

  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!runningTask) { setElapsedTime(0); return; }
    if (runningTask.entry.endTime > 0) { setElapsedTime(runningTask.entry.endTime - runningTask.entry.startTime); return; }
    const interval = setInterval(() => setElapsedTime(Date.now() - runningTask.entry.startTime), 1000);
    return () => clearInterval(interval);
  }, [runningTask]);

  useEffect(() => {
    const onTimerToggled = () => setElapsedTime(prev => prev + 1);
    eventBus.subscribe("timerToggled", onTimerToggled);
    return () => eventBus.unsubscribe("timerToggled", onTimerToggled);
  }, []);

  // ---- Spotlight visibility ----
  useEffect(() => {
    const onVisibilityChange = (visible: unknown) => setSpotlightVisible(Boolean(visible));
    eventBus.subscribe('spotlightVisibilityChange', onVisibilityChange);
    return () => eventBus.unsubscribe('spotlightVisibilityChange', onVisibilityChange);
  }, []);

  // ---- Mutual exclusivity: when one technique starts, reset the other ----
  useEffect(() => {
    const onTravelerStarted = () => { if (pomodoro.state.phase !== 'idle') pomodoro.reset(); };
    const onPomodoroStarted = () => { if (traveler.state.phase !== 'idle') traveler.reset(); };
    eventBus.subscribe('travelerStarted', onTravelerStarted);
    eventBus.subscribe('pomodoroStarted', onPomodoroStarted);
    return () => {
      eventBus.unsubscribe('travelerStarted', onTravelerStarted);
      eventBus.unsubscribe('pomodoroStarted', onPomodoroStarted);
    };
  }, [pomodoro, traveler]);

  // ---- Traveler search ----
  const searchTravelDuration = useCallback(async () => {
    if (!departure || !destination || departure.trim() === destination.trim()) { setDurationPreview(null); return; }
    setDurationLoading(true);
    setSearchLoading(true);
    try {
      let travelMs: number | null = null;
      if (travelMode === 'flight') {
        const from = getCityByCode(departure);
        const to = getCityByCode(destination);
        if (from && to) travelMs = await fetchFlightDuration(from, to);
      } else {
        const result = await getTrainDuration(departure, destination);
        travelMs = result ? result.travelDurationMs : null;
      }
      setDurationPreview(travelMs !== null ? { travelMs, breakMs: computeBreakDuration(travelMs) } : null);
    } catch (err) {
      console.error('Travel duration fetch failed:', err);
      setDurationPreview(null);
    } finally {
      setDurationLoading(false);
      setSearchLoading(false);
    }
  }, [departure, destination, travelMode]);

  const handleStartTraveler = useCallback(() => {
    if (!departure || !destination || !durationPreview) return;
    traveler.startWork(departure, destination, durationPreview.travelMs, travelMode);
  }, [departure, destination, durationPreview, traveler, travelMode]);

  const handleQuickPiP = useCallback(async () => {
    if (isPiPActive) closePiP();
    else await openPiP(pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight);
  }, [isPiPActive, openPiP, closePiP, pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight]);

  // ---- Clear unreachable destination ----
  useEffect(() => {
    if (!departure || !destination) return;
    if (travelMode !== 'flight') return;
    const reachable = getShortFlightDestinations(departure);
    if (!reachable.includes(destination)) setDestination('');
  }, [departure, travelMode, destination]);

  // ---- Auto-compute flight duration ----
  useEffect(() => {
    if (travelMode !== 'flight') return;
    if (!departure || !destination || departure === destination) return;
    const from = getCityByCode(departure);
    const to = getCityByCode(destination);
    if (!from || !to) return;
    let cancelled = false;
    fetchFlightDuration(from, to).then((travelMs) => {
      if (cancelled) return;
      setDurationPreview(travelMs !== null ? { travelMs, breakMs: computeBreakDuration(travelMs) } : null);
    });
    return () => { cancelled = true; };
  }, [departure, destination, travelMode]);

  // ---- Wipe on travel mode switch (skip store-driven changes) ----
  const prevTravelModeRef = useRef(travelMode);
  const syncingFromStoreRef = useRef(false);
  useEffect(() => {
    if (prevTravelModeRef.current === travelMode) return;
    const fromStore = syncingFromStoreRef.current;
    prevTravelModeRef.current = travelMode;
    if (fromStore) return;
    setDeparture('');
    setDestination('');
    setDurationPreview(null);
    setSearchLoading(false);
  }, [travelMode]);

  // ---- Push to shared idle store (for PiP) ----
  useEffect(() => {
    if (syncingFromStoreRef.current) { syncingFromStoreRef.current = false; return; }
    setTravelerIdleState({ departure, destination, travelMode, activeTechnique: activeMode, durationPreviewMs: durationPreview?.travelMs ?? null });
  }, [departure, destination, travelMode, activeMode, durationPreview]);

  // ---- Pull from shared store ----
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

  // ---- Register PiP callbacks ----
  useEffect(() => registerTravelerStartFn(handleStartTraveler), [handleStartTraveler]);
  useEffect(() => registerTravelerSearchFn(searchTravelDuration), [searchTravelDuration]);
  useEffect(() => registerTravelerResetFn(() => { traveler.reset(); setDeparture(''); setDestination(''); setDurationPreview(null); setSearchLoading(false); setTimerMode('pomodoro'); }), [traveler]);
  useEffect(() => registerPomodoroStartFn(() => { pomodoro.startWork(); }), [pomodoro]);

  // ---- Render: two-zone layout ----
  // The technique zone is always visible when any timer technique is enabled,
  // even when idle — so the user can quick-start a pomodoro or configure the
  // traveler. The zone only hides when no technique is enabled at all.
  const techniqueHasContent = anyTimerEnabled;
  const taskHasContent = !!runningTask || !!lastStoppedTask;

  return (
<div className="flex flex-col items-center min-[512px]:flex-row gap-1 min-[512px]:gap-1.5 px-2 min-[512px]:px-3 py-1 min-[512px]:py-1 bg-gray-100 rounded-lg min-h-[36px] min-[512px]:min-h-[40px] w-full min-[630px]:w-auto">
      {/* ===== TASK ZONE (top on mobile, right on desktop) ===== */}
      {runningTask ? (
        <div className="flex items-center gap-1 min-[512px]:gap-1.5 order-1 min-[630px]:order-2 w-auto min-[512px]:w-full min-[630px]:w-auto">
          <TaskRunningBlock
            title={runningTask.task.title}
            elapsed={elapsedTime}
            isRunning={runningTask.entry.endTime === 0}
            onPause={() => toggleTimer(runningTask.task.id, currentUserId)}
            onJumpToTask={onJumpToTask}
            taskId={runningTask.task.id}
            jumpLabel={t('quickTimer.jumpToTask')}
            pauseLabel={t('quickTimer.pauseTask')}
            resumeLabel={t('quickTimer.resumeTask')}
          />
        </div>
      ) : lastStoppedTask ? (
        <div className="flex items-center gap-1 min-[512px]:gap-1.5 order-1 min-[630px]:order-2 w-auto min-[512px]:w-full min-[630px]:w-auto">
          <LastStoppedTaskBlock
            title={lastStoppedTask.task.title}
            onResume={() => toggleTimer(lastStoppedTask.task.id, currentUserId)}
            onJumpToTask={onJumpToTask}
            taskId={lastStoppedTask.task.id}
            resumeLabel={t('quickTimer.resumeTimer')}
            jumpLabel={t('quickTimer.jumpToTask')}
          />
        </div>
      ) : !techniqueHasContent ? (
        <div className="text-xs min-[512px]:text-sm text-muted-foreground italic flex items-center h-full order-1 min-[630px]:order-2">
          {t('quickTimer.noActiveTimer')}
        </div>
      ) : null}

      {/* ===== WHAT'S NEXT (only when no task is running) ===== */}
      {!spotlightVisible && !runningTask && (
        <WhatsNextButton visible label={t('quickTimer.whatsNext')} title={t('quickTimer.reopenSpotlight')} />
      )}

      {/* ===== GUTTER (desktop only) ===== */}
      {techniqueHasContent && taskHasContent && (
        <div className="hidden min-[630px]:block w-px h-5 bg-border shrink-0 order-none" />
      )}

      {/* ===== TECHNIQUE ZONE (bottom on mobile, left on desktop) ===== */}
      {techniqueHasContent && (
        <div className="flex items-center gap-1 min-[512px]:gap-1.5 bg-muted/30 rounded px-1.5 min-[512px]:px-2 py-0.5 order-2 min-[630px]:order-1 w-auto min-[512px]:w-full min-[630px]:w-auto min-w-0">
          {activeMode === 'pomodoro' ? (
            <PomodoroControls pomodoro={pomodoro} t={t} />
          ) : (
            <TravelerControls
              traveler={traveler}
              t={t}
              departure={departure}
              destination={destination}
              travelMode={travelMode}
              durationPreview={durationPreview}
              durationLoading={durationLoading}
              onDeparture={setDeparture}
              onDestination={setDestination}
              onTravelMode={setTravelMode}
              onSearch={searchTravelDuration}
              onStart={handleStartTraveler}
            />
          )}
          <PiPButton supported={pipSupported} isPiPActive={isPiPActive} showOverlay={showOverlay} onToggle={handleQuickPiP} label={isPiPActive ? t('quickTimer.closePip') : t('quickTimer.openPip')} />
          <TechniqueSwitchChevron
            anyTimerEnabled={anyTimerEnabled}
            pomodoroEnabled={pomodoro.pomodoroEnabled}
            travelerEnabled={traveler.travelerEnabled}
            currentMode={activeMode}
            onPomodoro={() => { setTimerMode('pomodoro'); if (traveler.state.phase !== 'idle') traveler.reset(); }}
            onTraveler={() => { setTimerMode('traveler'); if (pomodoro.state.phase !== 'idle') pomodoro.reset(); }}
            label={t('quickTimer.switchTechnique')}
          />
        </div>
      )}
    </div>
  );
};