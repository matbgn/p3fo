import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, X, ArrowRight, Clock } from 'lucide-react';
import { useNextAction } from '@/hooks/useNextAction';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useTasks } from '@/hooks/useTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNonActionPeriod } from '@/hooks/useNonActionPeriod';
import { adaptTaskToMood, type MoodLevel, type MoodAdaptationResult } from '@/utils/mood-adaptation';
import { getDifficultyColor } from '@/components/SharedTaskControls';
import { ConsistencySparkline } from '@/components/ConsistencySparkline';
import { eventBus } from '@/lib/events';
import { cn } from '@/lib/utils';

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const DISMISS_KEY = 'p3fo_spotlight_dismissed';
const WELCOME_BACK_KEY = 'p3fo_welcome_back_shown';

interface NextTaskSpotlightProps {
  onFocusOnTask: (taskId: string) => void;
  onNavigateToFocusSessions: () => void;
}

export const NextTaskSpotlight: React.FC<NextTaskSpotlightProps> = ({ onFocusOnTask, onNavigateToFocusSessions }) => {
  const { nextAction } = useNextAction();
  const { tasks } = useAllTasks();
  const { toggleTimer } = useTasks();
  const { userId: currentUserId } = useUserSettings();
  const { isNonAction, isDisabled: isMoodDisabled, updateInteraction } = useNonActionPeriod();
  const [dismissed, setDismissed] = useState(false);
  const [lastInteraction, setLastInteraction] = useState(Date.now());
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null);
  const [useAlt, setUseAlt] = useState(false);

  useEffect(() => {
    const updateInteraction = () => setLastInteraction(Date.now());
    window.addEventListener('click', updateInteraction);
    window.addEventListener('keydown', updateInteraction);
    return () => {
      window.removeEventListener('click', updateInteraction);
      window.removeEventListener('keydown', updateInteraction);
    };
  }, []);

  const idleTime = Date.now() - lastInteraction;
  const isIdle = idleTime > IDLE_THRESHOLD_MS;

  useEffect(() => {
    if (isIdle) {
      setDismissed(false);
      sessionStorage.removeItem(DISMISS_KEY);
    }
  }, [isIdle]);

  useEffect(() => {
    const stored = sessionStorage.getItem(DISMISS_KEY);
    if (stored) setDismissed(true);
  }, []);

  useEffect(() => {
    if (isNonAction && !sessionStorage.getItem(WELCOME_BACK_KEY)) {
      setShowWelcomeBack(true);
      sessionStorage.setItem(WELCOME_BACK_KEY, 'true');
    }
  }, [isNonAction]);

  useEffect(() => {
    const onReopen = () => {
      setDismissed(false);
      sessionStorage.removeItem(DISMISS_KEY);
    };
    eventBus.subscribe('spotlightReopen', onReopen);
    return () => {
      eventBus.unsubscribe('spotlightReopen', onReopen);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setShowWelcomeBack(false);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  }, []);

  const isVisible = !!nextAction && !dismissed;

  useEffect(() => {
    eventBus.publish('spotlightVisibilityChange', isVisible);
  }, [isVisible]);

  const moodAdaptation = useMemo<MoodAdaptationResult | null>(() => {
    if (!selectedMood) return null;
    return adaptTaskToMood(selectedMood, tasks, currentUserId);
  }, [selectedMood, tasks, currentUserId]);

  const previewAdaptation = useMemo<MoodAdaptationResult | null>(() => {
    return adaptTaskToMood('green', tasks, currentUserId);
  }, [tasks, currentUserId]);

  const shouldAskMood = isNonAction && !isMoodDisabled && selectedMood === null;

  const effectiveTask = useAlt && moodAdaptation?.alternatives[0]
    ? moodAdaptation.alternatives[0]
    : moodAdaptation?.task ?? nextAction?.task ?? null;
  const effectiveReason = moodAdaptation
    ? (selectedMood === 'green'
      ? 'Ready for anything'
      : selectedMood === 'orange'
        ? 'Something a bit easier'
        : 'Smallest possible step')
    : nextAction?.reason ?? '';

  const handleStart = useCallback(async () => {
    if (!effectiveTask) return;
    const hasRunningTimer = effectiveTask.timer?.some(e => e.endTime === 0);
    if (!hasRunningTimer) {
      const result = await toggleTimer(effectiveTask.id, currentUserId);
      if (!result.success) return;
    }
    onFocusOnTask(effectiveTask.id);
    handleDismiss();
  }, [effectiveTask, toggleTimer, currentUserId, onFocusOnTask, handleDismiss]);

  const handleMoodSelect = useCallback((mood: MoodLevel) => {
    setSelectedMood(mood);
    setUseAlt(false);
    updateInteraction();
  }, [updateInteraction]);

  if (!nextAction || dismissed) return null;

  const hasRunningTimer = effectiveTask?.timer?.some(e => e.endTime === 0) ?? false;

  const greeting = showWelcomeBack
    ? "Good to see you. Here's today's next action."
    : hasRunningTimer
      ? 'Currently working on'
      : 'Next task to work on';

  const moodButton = (mood: MoodLevel, label: string, color: string, borderColor: string, hoverBg: string) => (
    <button
      onClick={() => handleMoodSelect(mood)}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-all',
        selectedMood === mood
          ? cn(borderColor, hoverBg, 'opacity-100')
          : shouldAskMood
            ? cn(borderColor, hoverBg, 'opacity-100')
            : 'border-transparent opacity-40 hover:opacity-70',
      )}
    >
      <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
      <span>{label}</span>
    </button>
  );

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-md">
      <CardContent className="p-4">
        {showWelcomeBack && (
          <div className="mb-2 text-sm font-medium text-primary">
            Good to see you.
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {shouldAskMood ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    How are you feeling right now?
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  This helps me propose the best fitting next task for you.
                </p>
                <div className="flex items-center gap-2">
                  {moodButton('green', 'Ready', 'bg-green-500', 'border-green-500/30', 'hover:bg-green-500/10')}
                  {moodButton('orange', 'Steady', 'bg-orange-500', 'border-orange-500/30', 'hover:bg-orange-500/10')}
                  {moodButton('red', 'Struggling', 'bg-red-500', 'border-red-500/30', 'hover:bg-red-500/10')}
                </div>
                {previewAdaptation && (
                  <div className="flex items-center gap-2 mt-2 opacity-40">
                    {previewAdaptation.task.difficulty && (
                      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', getDifficultyColor(previewAdaptation.task.difficulty))} />
                    )}
                    <span className="text-sm font-medium truncate">{previewAdaptation.task.title}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    {greeting}
                  </span>
                  {!showWelcomeBack && (
                    <span className="text-xs text-muted-foreground">· {effectiveReason}</span>
                  )}
                </div>
                {effectiveTask && (
                  <div className="flex items-center gap-2">
                    {effectiveTask.difficulty && (
                      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', getDifficultyColor(effectiveTask.difficulty))} />
                    )}
                    <span className="text-sm font-medium truncate">{effectiveTask.title}</span>
                    {hasRunningTimer && (
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-pulse" />
                    )}
                  </div>
                )}
                {moodAdaptation && moodAdaptation.alternatives.length > 0 && (
                  <button
                    onClick={() => setUseAlt(prev => !prev)}
                    className={cn(
                      'mt-1 text-xs flex items-center gap-1 transition-colors',
                      useAlt ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {useAlt ? '✓ Alternative: ' : 'Alternative: '}
                    {moodAdaptation.alternatives[0].title}
                  </button>
                )}
                <div className="flex items-center gap-1.5 mt-2">
                  {moodButton('green', 'Ready', 'bg-green-500', 'border-green-500/30', 'hover:bg-green-500/10')}
                  {moodButton('orange', 'Steady', 'bg-orange-500', 'border-orange-500/30', 'hover:bg-orange-500/10')}
                  {moodButton('red', 'Struggling', 'bg-red-500', 'border-red-500/30', 'hover:bg-red-500/10')}
                </div>
              </>
            )}
          </div>
          {!shouldAskMood && (
            <>
              <button
                onClick={onNavigateToFocusSessions}
                className="shrink-0 hidden sm:block cursor-pointer hover:opacity-80 transition-opacity"
                title="View consistency details"
              >
                <ConsistencySparkline />
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" onClick={handleStart} className="gap-1.5">
                  {hasRunningTimer ? (
                    <>
                      <ArrowRight className="h-3.5 w-3.5" />
                      Jump to task
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Start working
                    </>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
          {shouldAskMood && (
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};