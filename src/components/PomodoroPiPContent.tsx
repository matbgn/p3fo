import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { PomodoroPhase } from '@/lib/pomodoro-types';
import { Pause, Play, SkipForward, RotateCcw, Bell, Pin, Coffee, ChartNoAxesGantt, Apple, PlaneTakeoff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleDropdown } from '@/components/ui/simple-dropdown';

type ActiveTechnique = 'pomodoro' | 'traveler';

interface PomodoroPiPContentProps {
  phase: PomodoroPhase;
  remaining: number;
  total: number;
  progress: number;
  cycleCount: number;
  displayCycleIndex: number;
  cyclesBeforeLongBreak: number;
  isRunning: boolean;
  isPaused: boolean;
  phaseTransition: PomodoroPhase | null;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  onStartWork: () => void;
  onDismissTransition: () => void;
  onSelectActiveTechnique?: (t: ActiveTechnique) => void;
  activeTechnique?: ActiveTechnique;
  travelerEnabled?: boolean;
}

type LayoutSize = 'minimal' | 'compact' | 'normal' | 'spacious';

const phaseConfig: Record<string, { label: string; color: string; bg: string; barColor: string }> = {
  idle: { label: 'Ready', color: 'text-muted-foreground', bg: 'bg-muted', barColor: 'bg-muted-foreground' },
  work: { label: 'Work', color: 'text-red-500', bg: 'bg-red-500/10', barColor: 'bg-red-500' },
  'short-break': { label: 'Break', color: 'text-green-500', bg: 'bg-green-500/10', barColor: 'bg-green-500' },
  'long-break': { label: 'Long Break', color: 'text-blue-500', bg: 'bg-blue-500/10', barColor: 'bg-blue-500' },
};

const transitionLabels: Record<string, { title: string; subtitle: string; bg: string; color: string }> = {
  'short-break': { title: "Time's up!", subtitle: 'Take a short break', bg: 'bg-green-500', color: 'text-white' },
  'long-break': { title: "Time's up!", subtitle: 'You earned a long break', bg: 'bg-blue-500', color: 'text-white' },
  work: { title: "Break's over!", subtitle: 'Time to focus', bg: 'bg-red-500', color: 'text-white' },
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function getLayoutSize(w: number, h: number): LayoutSize {
  if (w < 140 || h < 120) return 'minimal';
  if (w < 260 || h < 240) return 'compact';
  if (w < 420 || h < 340) return 'normal';
  return 'spacious';
}

function useLayoutSize(containerRef: React.RefObject<HTMLDivElement | null>): LayoutSize {
  const [size, setSize] = useState<LayoutSize>('normal');

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize(getLayoutSize(el.offsetWidth, el.offsetHeight));
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const borderBox = entry.borderBoxSize?.[0];
        const w = borderBox ? borderBox.inlineSize : entry.contentRect.width;
        const h = borderBox ? borderBox.blockSize : entry.contentRect.height;
        setSize(getLayoutSize(w, h));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return size;
}

export const PomodoroPiPContent: React.FC<PomodoroPiPContentProps> = ({
  phase,
  remaining,
  total,
  progress,
  cycleCount: _cycleCount,
  displayCycleIndex,
  cyclesBeforeLongBreak,
  isRunning,
  isPaused,
  phaseTransition,
  onPause,
  onResume,
  onSkip,
  onReset,
  onStartWork,
  onDismissTransition,
  onSelectActiveTechnique,
  activeTechnique = 'pomodoro',
  travelerEnabled,
}) => {
  const transition = phaseTransition ? transitionLabels[phaseTransition] : null;
  const [showPinHint, setShowPinHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useLayoutSize(containerRef);

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
          <span className={`text-[10px] font-bold ${transition.color}`}>{transition.title}</span>
          <span className={`text-[8px] ${transition.color} opacity-80 mb-1`}>{transition.subtitle}</span>
          <div className="flex items-center gap-0.5 mb-1.5">
            {Array.from({ length: cyclesBeforeLongBreak }, (_, i) => (
              <div key={i} className={`w-1 h-1 rounded-full ${i <= displayCycleIndex ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
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

    return (
      <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${isCompact ? 'p-2' : isSpacious ? 'p-8' : 'p-4'} ${transition.bg} transition-all duration-300`}>
        <Bell className={`h-10 w-10 ${transition.color} mb-3 animate-bounce`} />
        <h1 className={`text-2xl font-bold ${transition.color} mb-1`}>
          {transition.title}
        </h1>
        <p className={`text-sm ${transition.color} opacity-80 mb-6`}>
          {transition.subtitle}
        </p>
        <div className="flex items-center gap-1.5 mb-4">
          {Array.from({ length: cyclesBeforeLongBreak }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i <= displayCycleIndex ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
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
            {phaseTransition === 'short-break' ? 'Start break' : phaseTransition === 'long-break' ? 'Start long break' : 'Start work'}
          </Button>
        </div>
      </div>
    );
  }

  const config = phaseConfig[phase] || phaseConfig.idle;

  if (isMinimal) {
    return (
      <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full p-1.5 ${config.bg} transition-colors duration-500`}>
        <div className="flex items-baseline gap-1.5 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full ${config.barColor}`} />
          {phase !== 'idle' && (
            phase === 'work' ? (
              <ChartNoAxesGantt className={`h-3 w-3 ${config.color}`} />
            ) : (
              <Coffee className={`h-3 w-3 ${config.color}`} />
            )
          )}
          <span className={`font-bold font-mono text-sm ${config.color}`}>
            {phase === 'idle' ? '--:--' : formatTime(remaining)}
          </span>
        </div>

        <div className="w-full h-1 rounded-full bg-muted/30 mb-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${config.barColor} transition-all duration-500`}
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>

        {cyclesBeforeLongBreak > 1 && (
          <div className="flex items-center gap-0.5 mb-1">
            {Array.from({ length: cyclesBeforeLongBreak }, (_, i) => {
              if (phase === 'long-break') {
                return <div key={i} className="w-1 h-1 rounded-full bg-blue-500" />;
              }
              const isFinished = displayCycleIndex >= 0 && i < displayCycleIndex;
              const isCurrent = displayCycleIndex >= 0 && i === displayCycleIndex;
              const isCurrentWork = isCurrent && phase === 'work';
              const dotColor = isFinished ? 'bg-green-500' : isCurrentWork ? 'bg-red-500' : isCurrent ? 'bg-green-500' : 'bg-muted-foreground/30';
              return <div key={i} className={`w-1 h-1 rounded-full ${dotColor}`} />;
            })}
          </div>
        )}

        <div className="flex items-center gap-0.5">
          {phase !== 'idle' && (
            <>
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
            </>
          )}
          {onReset && (phase !== 'idle' || displayCycleIndex >= 0) && (
            <button onClick={onReset} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Reset">
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
          {phase === 'idle' && (
            <button onClick={onStartWork} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Start work">
              <Play className="h-2.5 w-2.5" />
            </button>
          )}
          <button onClick={() => setShowPinHint(true)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/50" title="Pin">
            <Pin className="h-2.5 w-2.5" />
          </button>
        </div>
        {showPinHint && (
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-background/95 border rounded px-1 py-0.5 shadow-lg text-[7px] text-center max-w-[90%]">
            <span className="font-semibold">Pin:</span> <kbd className="px-0.5 bg-muted rounded">Super</kbd>+<kbd className="px-0.5 bg-muted rounded">RClick</kbd> → Always on Top
          </div>
        )}
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

  const dotSize = isCompact ? 'w-1 h-1' : 'w-2 h-2';
  const dotGap = isCompact ? 'gap-0.5' : 'gap-1';

  const techniqueOptions = travelerEnabled
    ? [
        { value: 'pomodoro', label: 'Pomodoro', icon: <Apple className="h-3 w-3" /> },
        { value: 'traveler', label: 'Traveler', icon: <PlaneTakeoff className="h-3 w-3" /> },
      ]
    : [{ value: 'pomodoro', label: 'Pomodoro', icon: <Apple className="h-3 w-3" /> }];

  return (
    <div ref={containerRef} className={`flex flex-col items-center justify-center h-full w-full ${isCompact ? 'p-1' : isSpacious ? 'p-6' : 'p-3'} ${config.bg} transition-colors duration-500`}>
      {onSelectActiveTechnique && phase === 'idle' && !isCompact && (
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
            className={phase === 'work' ? 'text-red-500' : phase === 'short-break' ? 'text-green-500' : phase === 'long-break' ? 'text-blue-500' : 'text-muted-foreground'}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold font-mono ${isCompact ? 'text-sm' : 'text-2xl'} ${config.color}`}>
            {phase === 'idle' ? '--:--' : formatTime(remaining)}
          </span>
          {!isCompact && phase !== 'idle' && (
            phase === 'work' ? (
              <ChartNoAxesGantt className={`${isCompact ? 'h-3 w-3' : 'h-5 w-5'} ${config.color}`} />
            ) : (
              <Coffee className={`${isCompact ? 'h-3 w-3' : 'h-5 w-5'} ${config.color}`} />
            )
          )}
        </div>
      </div>

      <div className={`flex items-center ${dotGap} ${isCompact ? 'mb-1' : 'mb-2'}`}>
        {Array.from({ length: cyclesBeforeLongBreak }, (_, i) => {
          if (phase === 'long-break') {
            return (
              <div key={i} className={`${dotSize} rounded-full transition-colors bg-blue-500`} />
            );
          }
          const isFinished = displayCycleIndex >= 0 && i < displayCycleIndex;
          const isCurrent = displayCycleIndex >= 0 && i === displayCycleIndex;
          const isCurrentWork = isCurrent && phase === 'work';
          const dotColor = isFinished
            ? 'bg-green-500'
            : isCurrentWork
              ? 'bg-red-500'
              : isCurrent
                ? 'bg-green-500'
                : 'bg-muted-foreground/30';
          return (
            <div key={i} className={`${dotSize} rounded-full transition-colors ${dotColor}`} />
          );
        })}
      </div>

      <div className={`flex items-center ${isCompact ? 'gap-1' : 'gap-2'}`}>
        {phase !== 'idle' && (
          <>
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
          </>
        )}
        {onReset && (phase !== 'idle' || displayCycleIndex >= 0) && (
          isCompact ? (
            <button onClick={onReset} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Reset cycle">
              <RotateCcw className="h-3 w-3" />
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={onReset} className="h-8 w-8 p-0" title="Reset cycle">
              <RotateCcw className="h-4 w-4" />
            </Button>
          )
        )}
        {phase === 'idle' && (
          isCompact ? (
            <button onClick={onStartWork} className="h-6 w-6 flex items-center justify-center rounded border border-current/30 hover:bg-muted/50" title="Start work">
              <Play className="h-3 w-3" />
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={onStartWork} className="h-8 w-8 p-0" title="Start work">
              <Play className="h-4 w-4" />
            </Button>
          )
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

export default PomodoroPiPContent;