import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTaskMetrics } from "@/hooks/useTaskMetrics";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { calculateHighImpactTaskFrequency } from "@/lib/metrics";

const HighImpactTaskMetric: React.FC = () => {
  const { tasks, taskMap, highImpactMap } = useTaskMetrics();
  const { settings } = useCombinedSettings();

  // Get settings from the combined hook
  const workloadPercentage = settings.userWorkloadPercentage / 100;
  const weeksComputation = settings.weeksComputation;
  const highImpactTaskGoal = settings.highImpactTaskGoal;

  const frequency = calculateHighImpactTaskFrequency(tasks, weeksComputation, workloadPercentage, taskMap, highImpactMap);

  // Format frequency
  const formattedFrequency = (frequency).toFixed(1);

  const getCardClass = () => {
    if (frequency >= highImpactTaskGoal) {
      return "bg-green-100 border-l-4 border-green-500";
    }
    const difference = ((frequency - highImpactTaskGoal) / highImpactTaskGoal) * 100;
    if (difference >= -30) {
      return "bg-orange-100 border-l-4 border-orange-500";
    }
    return "bg-red-100 border-l-4 border-red-500";
  };

  return (
    <Card className={`h-32 ${getCardClass()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">High Impact Task Achievement / EFT / week </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formattedFrequency}
        </div>
        <CardDescription className="text-xs mt-1">
          Goal: {highImpactTaskGoal.toFixed(2)} in {weeksComputation} weeks
        </CardDescription>
      </CardContent>
    </Card>
  );
};

export default HighImpactTaskMetric;