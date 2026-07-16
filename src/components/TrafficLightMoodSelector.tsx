import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, X, ArrowRight } from 'lucide-react';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useTasks } from '@/hooks/useTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNonActionPeriod } from '@/hooks/useNonActionPeriod';
import { adaptTaskToMood, type MoodLevel, type MoodAdaptationResult } from '@/utils/mood-adaptation';
import { getDifficultyColor } from '@/components/SharedTaskControls';
import { cn } from '@/lib/utils';

interface TrafficLightMoodSelectorProps {
  onFocusOnTask: (taskId: string) => void;
}

export const TrafficLightMoodSelector: React.FC<TrafficLightMoodSelectorProps> = ({ onFocusOnTask }) => {
  const { tasks } = useAllTasks();
  const { toggleTimer } = useTasks();
  const { userId: currentUserId } = useUserSettings();
  const { isNonAction, isDisabled, updateInteraction } = useNonActionPeriod();
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [wasTriggered, setWasTriggered] = useState(false);

  useEffect(() => {
    if (isNonAction && !dismissed) {
      setWasTriggered(true);
    }
  }, [isNonAction, dismissed]);

  const adaptation: MoodAdaptationResult | null = selectedMood
    ? adaptTaskToMood(selectedMood, tasks, currentUserId)
    : null;

  const handleMoodSelect = useCallback((mood: MoodLevel) => {
    setSelectedMood(mood);
  }, []);

  const handleStart = useCallback(() => {
    if (!adaptation) return;
    const hasRunningTimer = adaptation.task.timer?.some(e => e.endTime === 0);
    if (!hasRunningTimer) {
      toggleTimer(adaptation.task.id, currentUserId);
    }
    onFocusOnTask(adaptation.task.id);
    setDismissed(true);
    setWasTriggered(false);
    updateInteraction();
  }, [adaptation, toggleTimer, currentUserId, onFocusOnTask, updateInteraction]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setWasTriggered(false);
    updateInteraction();
  }, [updateInteraction]);

  const handleBack = useCallback(() => {
    setSelectedMood(null);
  }, []);

  if (isDisabled || !wasTriggered || dismissed) return null;

  if (selectedMood === null) {
    return (
      <Card className="border-primary/30 bg-primary/5 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">How are you feeling right now?</span>
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleMoodSelect('green')}
              className="flex-1 gap-2 border-green-500/30 hover:bg-green-500/10"
            >
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs">Ready</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => handleMoodSelect('orange')}
              className="flex-1 gap-2 border-orange-500/30 hover:bg-orange-500/10"
            >
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-xs">Mediocre</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => handleMoodSelect('red')}
              className="flex-1 gap-2 border-red-500/30 hover:bg-red-500/10"
            >
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs">Struggling</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (adaptation) {
    return (
      <Card className="border-primary/30 bg-primary/5 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                  {selectedMood === 'green' ? 'Ready for anything' : selectedMood === 'orange' ? 'Something a bit easier' : 'Smallest possible step'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {adaptation.task.difficulty && (
                  <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', getDifficultyColor(adaptation.task.difficulty))} />
                )}
                <span className="text-sm font-medium truncate">{adaptation.task.title}</span>
              </div>
              {adaptation.alternatives.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Alternative: {adaptation.alternatives[0].title}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" onClick={handleStart} className="gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Start
              </Button>
              <Button size="sm" variant="ghost" onClick={handleBack} className="gap-1.5">
                <ArrowRight className="h-3.5 w-3.5" />
                Back
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};