import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTasks } from "@/hooks/useTasks";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { calculateTimeSpentOnNewCapabilities } from "@/lib/metrics";

const NewCapabilitiesMetric: React.FC = () => {
  const { tasks } = useTasks();
  const { settings } = useCombinedSettings();

  // Get settings from combined settings
  const weeksComputation = settings.weeksComputation;
  const goal = settings.newCapabilitiesGoal;

  const { percentage } = calculateTimeSpentOnNewCapabilities(tasks, weeksComputation);

  // Format percentage
  const formattedPercentage = percentage.toFixed(1);

  const getCardClass = () => {
    if (percentage >= goal) {
      return "bg-green-100 border-l-4 border-green-500";
    }
    const difference = ((percentage - goal) / goal) * 100;
    if (difference >= -30) {
      return "bg-orange-100 border-l-4 border-orange-500";
    }
    return "bg-red-100 border-l-4 border-red-500";
  };

  return (
    <Card className={`h-32 ${getCardClass()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Time spent overall on High Impact work</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formattedPercentage}%
        </div>
        <CardDescription className="text-xs mt-1">
          Goal: {goal.toFixed(2)}% in {weeksComputation} weeks
        </CardDescription>
      </CardContent>
    </Card>
  );
};

export default NewCapabilitiesMetric;