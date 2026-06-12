import React from 'react';
import { usePomodoro } from '@/hooks/usePomodoro';
import { Bell, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

const transitionConfig: Record<string, { title: string; subtitle: string; bgClass: string; textColor: string; actionLabel: string }> = {
  'short-break': { title: "Time's up!", subtitle: 'Take a short break', bgClass: 'bg-green-500', textColor: 'text-white', actionLabel: 'Start break' },
  'long-break': { title: "Time's up!", subtitle: 'You earned a long break', bgClass: 'bg-blue-500', textColor: 'text-white', actionLabel: 'Start long break' },
  work: { title: "Break's over!", subtitle: 'Time to focus', bgClass: 'bg-red-500', textColor: 'text-white', actionLabel: 'Start working' },
};

/**
 * Always-visible fullscreen "Time's up!" / "Break's over!" alert.
 * This component is always mounted so the user is guaranteed to see
 * the phase transition signal, regardless of whether the focus overlay
 * is enabled or the PiP is active.
 */
export const PomodoroTransitionAlert: React.FC = () => {
  const pomodoro = usePomodoro();
  const transition = pomodoro.phaseTransition
    ? transitionConfig[pomodoro.phaseTransition as keyof typeof transitionConfig]
    : null;

  if (!transition) return null;

  const handleStart = () => {
    pomodoro.dismissTransition();
    pomodoro.resume();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center ${transition.bgClass} transition-colors duration-300`}
      data-pomodoro-transition={pomodoro.phaseTransition ?? undefined}
    >
      <Bell className={`h-20 w-20 ${transition.textColor} mb-6 animate-bounce`} />
      <h1 className={`text-5xl font-bold ${transition.textColor} mb-3`}>
        {transition.title}
      </h1>
      <p className={`text-2xl ${transition.textColor} opacity-90 mb-10`}>
        {transition.subtitle}
      </p>
      <div className="flex items-center gap-2 mb-10">
        {Array.from({ length: pomodoro.config.cyclesBeforeLongBreak }, (_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${
              i < pomodoro.state.cycleCount ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
      <div className="flex gap-3">
        <Button
          size="lg"
          className={`${transition.textColor} bg-white/20 hover:bg-white/30 border-white/40 text-base px-8 py-6`}
          onClick={pomodoro.dismissTransition}
        >
          Dismiss
        </Button>
        <Button
          size="lg"
          className={`${transition.textColor} bg-white/40 hover:bg-white/50 border-white/60 text-base px-8 py-6`}
          onClick={handleStart}
        >
          <Play className="mr-2 h-5 w-5" />
          {transition.actionLabel}
        </Button>
      </div>
    </div>
  );
};

export default PomodoroTransitionAlert;