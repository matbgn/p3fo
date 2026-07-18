import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { TravelerPhase, getCityByCode, CITIES, getShortFlightDestinations, getFlightDurationMs, getFlightDurationColor, TravelMode } from '@/lib/traveler-types';
import { Pause, Play, SkipForward, RotateCcw, PlaneTakeoff, Bell, Pin, Coffee, ChartNoAxesGantt, Search, Loader2, Train, Apple, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/traveler-api';
import { SimpleDropdown } from '@/components/ui/simple-dropdown';

type ActiveTechnique = 'pomodoro' | 'traveler';

interface TravelerPiPContentProps {
  phase: TravelerPhase;
  remaining: number;
  total: number;
  progress: number;
  departure: string;
  destination: string;
  travelMode: TravelMode;
  durationPreviewMs: number | null;
  isRunning: boolean;
  isPaused: boolean;
  phaseTransition: TravelerPhase | null;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  onDismissTransition: () => void;
  onSelectDeparture: (code: string) => void;
  onSelectDestination: (code: string) => void;
  onSelectTravelMode: (mode: TravelMode) => void;
  onSelectActiveTechnique?: (t: ActiveTechnique) => void;
  activeTechnique?: ActiveTechnique;
  onStart: () => void;
  onSearch?: () => void;
  searchLoading?: boolean;
  pomodoroEnabled?: boolean;
  onStartPomodoro?: () => void;
}

type LayoutSize = 'minimal' | 'compact' | 'normal' | 'spacious';

const phaseConfig: Record<string, { label: string; color: string; bg: string; barColor: string }> = {
  idle: { label: 'Ready', color: 'text-muted-foreground', bg: 'bg-muted', barColor: 'bg-muted-foreground' },
  work: { label: 'Flight', color: 'text-red-500', bg: 'bg-red-500/10', barColor: 'bg-red-500' },
  break: { label: 'Break', color: 'text-green-500', bg: 'bg-green-500/10', barColor: 'bg-green-500' },
};

const transitionLabels: Record<string, { title: string; subtitle: string; bg: string; color: string }> = {
  break: { title: "Time's up!", subtitle: 'Flight landed — take a break', bg: 'bg-green-500', color: 'text-white' },
  idle: { title: "Break's over!", subtitle: 'Ready for takeoff?', bg: 'bg-red-500', color: 'text-white' },
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function getLayoutSize(w: number, h: number): LayoutSize {
  // Buckets aligned to PiP presets:
  //   Tiny (200×100)   → minimal
  //   Small (240×140)  → compact
  //   Medium (260×240) → normal
  //   Normal (320×400) → normal
  if (w < 220 || h < 140) return 'minimal';
  if (w < 260 || h < 240) return 'compact';
  if (w < 440 || h < 480) return 'normal';
  return 'spacious';
}

function useLayoutSize(containerRef: React.RefObject<HTMLDivElement | null>): LayoutSize {
  const [size, setSize] = useState<LayoutSize>('normal');
  // Cache the last computed layout bucket to skip React state updates when
  // the bucket hasn't changed. ResizeObserver fires many times during a drag;
  // only threshold crossings should trigger a re-render.
  const sizeRef = useRef<LayoutSize>('normal');

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = getLayoutSize(el.offsetWidth, el.offsetHeight);
    sizeRef.current = next;
    setSize(next);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const compute = () => {
      rafId = null;
      const next = getLayoutSize(el.offsetWidth, el.offsetHeight);
      if (next !== sizeRef.current) {
        sizeRef.current = next;
        setSize(next);
      }
    };

    const observer = new ResizeObserver(() => {
      // Coalesce: only one computation per animation frame, regardless of how
      // many resize entries the observer delivers.
      if (rafId === null) {
        rafId = requestAnimationFrame(compute);
      }
    });

    observer.observe(el);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
}

export const TravelerPiPContent: React.FC<TravelerPiPContentProps> = ({
  phase,
  remaining,
  total,
  progress,
  departure,
  destination,
  travelMode,
  durationPreviewMs,
  isRunning,
  isPaused,
  phaseTransition,
  onPause,
  onResume,
  onSkip,
  onReset,
  onDismissTransition,
  onSelectDeparture,
  onSelectDestination,
  onSelectTravelMode,
  onSelectActiveTechnique,
  activeTechnique = 'traveler',
  onStart,
  onSearch,
  searchLoading,
  pomodoroEnabled,
  onStartPomodoro,
}) => {
  const transition = phaseTransition ? transitionLabels[phaseTransition] : null;
  const [showPinHint, setShowPinHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useLayoutSize(containerRef);

  const fromCity = getCityByCode(departure);
  const toCity = getCityByCode(destination);
  const routeLabel = fromCity && toCity ? `${fromCity.code} → ${toCity.code}` : '';

  useEffect(() => {
    if (showPinHint) {
      const timer = setTimeout(() => setShowPinHint(false), 6000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showPinHint]);

  const isMinimal = layout === 'minimal';
  const isCompact = layout === 'compact';
  const isSpacious = layout === 'spacious';

  if (transition) {
    if (isMinimal) {
      return (
        <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full p-1.5 ${transition.bg} transition-all duration-300`}>
          <PlaneTakeoff className={`h-4 w-4 ${transition.color} mb-1`} />
          <span className={`text-[10px] font-bold ${transition.color}`}>{transition.title}</span>
          <span className={`text-[8px] ${transition.color} opacity-80 mb-1`}>{transition.subtitle}</span>
          <div className="flex gap-1">
            <button
              className={`${transition.color} text-[9px] px-1 py-0 border border-white/40 bg-white/20 hover:bg-white/30 rounded`}
              onClick={onDismissTransition}
            >
              Dismiss
            </button>
            <button
              className={`${transition.color} text-[9px] px-1 py-0 border border-white/60 bg-white/40 hover:bg-white/50 rounded`}
              onClick={() => { onDismissTransition(); onResume(); }}
            >
              Start
            </button>
          </div>
        </div>
      );
    }

    if (isCompact) {
      return (
        <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full p-2 ${transition.bg} transition-all duration-300`}>
          <PlaneTakeoff className={`h-6 w-6 ${transition.color} mb-1 animate-bounce`} />
          <h1 className={`text-base font-bold ${transition.color} mb-0.5`}>
            {transition.title}
          </h1>
          <p className={`text-[11px] ${transition.color} opacity-80 mb-2`}>
            {transition.subtitle}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className={`${transition.color} border-white/40 bg-white/20 hover:bg-white/30 h-7 px-2 text-xs`}
              onClick={onDismissTransition}
            >
              Dismiss
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`${transition.color} border-white/60 bg-white/40 hover:bg-white/50 h-7 px-2 text-xs`}
              onClick={() => { onDismissTransition(); onResume(); }}
            >
              <Play className="mr-1 h-3 w-3" />
              {phaseTransition === 'break' ? 'Break' : 'Work'}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${isSpacious ? 'p-8' : 'p-4'} ${transition.bg} transition-all duration-300`}>
        <PlaneTakeoff className={`h-10 w-10 ${transition.color} mb-3 animate-bounce`} />
        <h1 className={`text-2xl font-bold ${transition.color} mb-1`}>
          {transition.title}
        </h1>
        <p className={`text-sm ${transition.color} opacity-80 mb-6`}>
          {transition.subtitle}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className={`${transition.color} border-white/40 bg-white/20 hover:bg-white/30`}
            onClick={onDismissTransition}
          >
            Dismiss
          </Button>
          <Button
            variant="outline"
            className={`${transition.color} border-white/60 bg-white/40 hover:bg-white/50`}
            onClick={() => { onDismissTransition(); onResume(); }}
          >
            <Play className="mr-1 h-4 w-4" />
            {phaseTransition === 'break' ? 'Start break' : 'Start work'}
          </Button>
        </div>
      </div>
    );
  }

  const config = phaseConfig[phase] || phaseConfig.idle;

  if (phase === 'idle') {
    const reachable = travelMode === 'flight' && departure
      ? getShortFlightDestinations(departure)
      : null;
    const fromOptions = CITIES.map((city) => ({ value: city.code, label: city.code }));
    const toOptions = CITIES
      .filter((city) => {
        if (city.code === departure) return false;
        if (reachable) return reachable.includes(city.code);
        return true;
      })
      .map((city) => {
        const ms = travelMode === 'flight' && departure
          ? getFlightDurationMs(departure, city.code) ?? Infinity
          : Infinity;
        return {
          value: city.code,
          label: city.code,
          dotColor: travelMode === 'flight' && departure && Number.isFinite(ms)
            ? getFlightDurationColor(ms)
            : undefined,
        };
      });
    const travelModeOptions = [
      { value: 'flight', label: 'Flight', icon: <PlaneTakeoff className="h-3 w-3" /> },
      { value: 'train', label: 'Train', icon: <Train className="h-3 w-3" /> },
    ];
    const techniqueOptions = pomodoroEnabled
      ? [
          { value: 'pomodoro', label: 'Pomodoro', icon: <Apple className="h-3 w-3" /> },
          { value: 'traveler', label: 'Traveler', icon: <PlaneTakeoff className="h-3 w-3" /> },
        ]
      : [{ value: 'traveler', label: 'Traveler', icon: <PlaneTakeoff className="h-3 w-3" /> }];

    if (isMinimal) {
      return (
        <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full p-1.5 ${config.bg} transition-colors duration-500`}>
          <div className="flex items-center gap-1 mb-1">
            <SimpleDropdown
              value={travelMode}
              onValueChange={(v) => onSelectTravelMode(v as TravelMode)}
              options={travelModeOptions}
              placeholder="Mode"
              className="w-14"
              triggerClassName="h-5 text-[9px] px-1"
            />
            {travelMode === 'train' ? (
              <input
                type="text"
                value={departure}
                onChange={(e) => onSelectDeparture(e.target.value)}
                placeholder="From"
                className="h-5 w-12 text-[9px] px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <SimpleDropdown
                value={departure}
                onValueChange={onSelectDeparture}
                options={fromOptions}
                placeholder="From"
                className="w-14"
                triggerClassName="h-5 text-[9px] px-1"
              />
            )}
            <span className="text-[9px] text-muted-foreground">→</span>
            {travelMode === 'train' ? (
              <input
                type="text"
                value={destination}
                onChange={(e) => onSelectDestination(e.target.value)}
                placeholder="To"
                className="h-5 w-12 text-[9px] px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <SimpleDropdown
                value={destination}
                onValueChange={onSelectDestination}
                options={toOptions}
                placeholder="To"
                className="w-14"
                triggerClassName="h-5 text-[9px] px-1"
              />
            )}
          </div>
          {durationPreviewMs !== null && (
            <div className="flex items-center gap-0.5 mb-1 text-muted-foreground">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${getFlightDurationColor(durationPreviewMs)}`} />
              <span className="text-[8px]">{formatDuration(durationPreviewMs)}/{formatDuration(Math.max(60000, Math.round(durationPreviewMs / 5)))}</span>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            {onSearch && travelMode !== 'flight' && (
              <button
                onClick={onSearch}
                disabled={!departure || !destination || !!searchLoading}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-50"
                title="Search"
              >
                {searchLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Search className="h-2.5 w-2.5" />}
              </button>
            )}
            <button
              onClick={onStart}
              disabled={!departure || !destination || durationPreviewMs === null}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-50"
              title="Start"
            >
              <Play className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={onReset}
              disabled={!departure && !destination && durationPreviewMs === null}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50 disabled:opacity-50"
              title="Reset"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
            <button onClick={() => setShowPinHint(true)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Pin">
              <Pin className="h-2.5 w-2.5" />
            </button>
          </div>
          {showPinHint && (
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-background/95 border rounded px-1 py-0.5 shadow-lg text-[7px] text-center max-w-[90%]">
              <span className="font-semibold">Pin:</span> <kbd className="px-0.5 bg-muted rounded">Super</kbd>+<kbd className="px-0.5 bg-muted rounded">RClick</kbd>
            </div>
          )}
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${isCompact ? 'p-2' : 'p-3'} ${config.bg} transition-colors duration-500`}>
        {onSelectActiveTechnique && !isCompact && (
          <div className="flex items-center gap-1.5 mb-2">
            <SimpleDropdown
              value={activeTechnique}
              onValueChange={(v) => onSelectActiveTechnique(v as ActiveTechnique)}
              options={techniqueOptions}
              placeholder="Technique"
              className={isSpacious ? 'w-28' : 'w-24'}
              triggerClassName={isSpacious ? 'h-8 text-xs px-2' : 'h-7 text-[10px] px-1.5'}
            />
          </div>
        )}
        <div className={`flex items-center gap-1.5 ${isCompact ? 'mb-1' : 'mb-2'}`}>
          <SimpleDropdown
            value={travelMode}
            onValueChange={(v) => onSelectTravelMode(v as TravelMode)}
            options={travelModeOptions}
            placeholder="Mode"
            className={isCompact ? 'w-16' : 'w-20'}
            triggerClassName={isCompact ? 'h-6 text-[10px] px-1.5' : 'h-8 text-xs px-2'}
          />
        </div>

        <div className={`flex items-center ${isCompact ? 'gap-1' : 'gap-2'} mb-2`}>
          {travelMode === 'train' ? (
            <input
              type="text"
              value={departure}
              onChange={(e) => onSelectDeparture(e.target.value)}
              placeholder="From"
              className={`${isCompact ? 'h-6 w-16 text-[10px] px-1.5' : 'h-8 w-24 text-xs px-2'} rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring`}
            />
          ) : (
            <SimpleDropdown
              value={departure}
              onValueChange={onSelectDeparture}
              options={fromOptions}
              placeholder="From"
              className={isCompact ? 'w-16' : 'w-20'}
              triggerClassName={isCompact ? 'h-6 text-[10px] px-1.5' : 'h-8 text-xs px-2'}
            />
          )}
          <span className={`text-muted-foreground ${isCompact ? 'text-xs' : 'text-sm'}`}>→</span>
          {travelMode === 'train' ? (
            <input
              type="text"
              value={destination}
              onChange={(e) => onSelectDestination(e.target.value)}
              placeholder="To"
              className={`${isCompact ? 'h-6 w-16 text-[10px] px-1.5' : 'h-8 w-24 text-xs px-2'} rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring`}
            />
          ) : (
            <SimpleDropdown
              value={destination}
              onValueChange={onSelectDestination}
              options={toOptions}
              placeholder="To"
              className={isCompact ? 'w-16' : 'w-20'}
              triggerClassName={isCompact ? 'h-6 text-[10px] px-1.5' : 'h-8 text-xs px-2'}
            />
          )}
        </div>

        {durationPreviewMs !== null && (
          <div className="flex items-center gap-1 mb-2 text-muted-foreground">
            <span className={`inline-block w-2 h-2 rounded-full ${getFlightDurationColor(durationPreviewMs)}`} />
            <span className={isCompact ? 'text-[10px]' : 'text-xs'}>
              {formatDuration(durationPreviewMs)}/{formatDuration(Math.max(60000, Math.round(durationPreviewMs / 5)))}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {onSearch && travelMode !== 'flight' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSearch}
              disabled={!departure || !destination || !!searchLoading}
              className={isCompact ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0'}
              title="Search travel duration"
            >
              {searchLoading ? (
                <Loader2 className={`${isCompact ? 'h-3 w-3' : 'h-4 w-4'} animate-spin`} />
              ) : (
                <Search className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onStart}
            disabled={!departure || !destination || durationPreviewMs === null}
            className={isCompact ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0'}
            title="Start"
          >
            <Play className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={!departure && !destination && durationPreviewMs === null}
            className={isCompact ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0'}
            title="Reset"
          >
            <RotateCcw className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPinHint(true)}
            className={isCompact ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0'}
            title="How to pin on top"
          >
            <Pin className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </Button>
        </div>

        {showPinHint && (
          <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 bg-background/95 border rounded-lg shadow-lg max-w-[90%] text-center ${isCompact ? 'px-1.5 py-1 text-[8px]' : 'px-3 py-2 text-xs'}`}>
            <p className="font-semibold mb-0.5">To pin on top:</p>
            <p>Press <kbd className="px-1 py-0.5 bg-muted rounded text-[8px]">Super</kbd> + <kbd className="px-1 py-0.5 bg-muted rounded text-[8px]">Right-Click</kbd></p>
          </div>
        )}
      </div>
    );
  }

  if (isMinimal) {
    return (
      <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full p-1.5 ${config.bg} transition-colors duration-500`}>
        <div className="flex items-baseline gap-1.5 mb-1">
          {phase === 'work' ? (
            <ChartNoAxesGantt className={`h-2.5 w-2.5 ${config.color}`} />
          ) : (
            <Coffee className={`h-2.5 w-2.5 ${config.color}`} />
          )}
          <span className={`font-bold font-mono text-sm ${config.color}`}>
            {formatTime(remaining)}
          </span>
        </div>

        {routeLabel && (
          <div className={`text-[9px] ${config.color} opacity-60 mb-1`}>{routeLabel}</div>
        )}

        <div className="w-full h-1 rounded-full bg-muted/30 mb-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${config.barColor} transition-all duration-500`}
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>

        <div className="flex items-center gap-0.5">
          {isRunning && !isPaused ? (
            <button onClick={onPause} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Pause">
              <Pause className="h-2.5 w-2.5" />
            </button>
          ) : isPaused ? (
            <button onClick={onResume} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Resume">
              <Play className="h-2.5 w-2.5" />
            </button>
          ) : null}
          <button onClick={onSkip} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Skip">
            <SkipForward className="h-2.5 w-2.5" />
          </button>
          <button onClick={onReset} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Reset">
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
          <button onClick={() => setShowPinHint(true)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Pin">
            <Pin className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    );
  }

  const circleSize = isCompact ? 72 : isSpacious ? 140 : 100;
  const strokeWidth = isCompact ? 4 : 6;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  const center = circleSize / 2;
  const viewBox = `0 0 ${circleSize} ${circleSize}`;

  return (
    <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${isCompact ? 'p-1' : isSpacious ? 'p-6' : 'p-3'} ${config.bg} transition-colors duration-500`}>
      {routeLabel && (
        <div className={`flex items-center gap-1 ${isCompact ? 'mb-0.5' : 'mb-1'} ${config.color} opacity-70`}>
          <PlaneTakeoff className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          <span className={isCompact ? 'text-[9px]' : 'text-xs'}>{routeLabel}</span>
        </div>
      )}

      <div className={`relative flex items-center justify-center ${isCompact ? 'mb-1' : 'mb-2'}`}>
        <svg width={circleSize} height={circleSize} viewBox={viewBox} className="transform -rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={phase === 'work' ? 'text-red-500' : 'text-green-500'}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold font-mono ${isCompact ? 'text-sm' : 'text-2xl'} ${config.color}`}>
            {formatTime(remaining)}
          </span>
          {!isCompact && (
            phase === 'work' ? (
              <ChartNoAxesGantt className={`${isCompact ? 'h-3 w-3' : 'h-5 w-5'} ${config.color}`} />
            ) : (
              <Coffee className={`${isCompact ? 'h-3 w-3' : 'h-5 w-5'} ${config.color}`} />
            )
          )}
        </div>
      </div>

      <div className={`flex items-center ${isCompact ? 'gap-1' : 'gap-2'}`}>
        {isRunning && !isPaused ? (
          isCompact ? (
            <button onClick={onPause} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Pause">
              <Pause className="h-3 w-3" />
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={onPause} className="h-8 w-8 p-0">
              <Pause className="h-4 w-4" />
            </Button>
          )
        ) : isPaused ? (
          isCompact ? (
            <button onClick={onResume} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Resume">
              <Play className="h-3 w-3" />
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={onResume} className="h-8 w-8 p-0">
              <Play className="h-4 w-4" />
            </Button>
          )
        ) : null}
        {isCompact ? (
          <button onClick={onSkip} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Skip">
            <SkipForward className="h-3 w-3" />
          </button>
        ) : (
          <Button variant="outline" size="sm" onClick={onSkip} className="h-8 w-8 p-0" title="Skip">
            <SkipForward className="h-4 w-4" />
          </Button>
        )}
        {isCompact ? (
          <button onClick={onReset} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Reset">
            <RotateCcw className="h-3 w-3" />
          </button>
        ) : (
          <Button variant="outline" size="sm" onClick={onReset} className="h-8 w-8 p-0" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {isCompact ? (
          <button onClick={() => setShowPinHint(true)} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="How to pin on top">
            <Pin className="h-3 w-3" />
          </button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowPinHint(true)} className="h-8 w-8 p-0" title="How to pin on top">
            <Pin className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showPinHint && (
        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 bg-background/95 border rounded-lg shadow-lg max-w-[90%] text-center ${isCompact ? 'px-1.5 py-1 text-[8px]' : 'px-3 py-2 text-xs'}`}>
          <p className="font-semibold mb-0.5">To pin on top:</p>
          <p>Press <kbd className="px-1 py-0.5 bg-muted rounded text-[8px]">Super</kbd> + <kbd className="px-1 py-0.5 bg-muted rounded text-[8px]">Right-Click</kbd></p>
        </div>
      )}
    </div>
  );
};

export default TravelerPiPContent;