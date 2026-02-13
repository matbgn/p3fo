import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTaskMetrics } from "@/hooks/useTaskMetrics";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { calculateFailureRate } from "@/lib/metrics";

const FailureRateMetric: React.FC = () => {
  const { tasks } = useTaskMetrics();
  const { settings } = useCombinedSettings();

  // Get settings from combined settings
  const weeksComputation = settings.weeksComputation;
  const failureRateGoal = settings.failureRateGoal;

  const failureRate = calculateFailureRate(tasks, weeksComputation);

  // Format failure rate as a percentage
  const formattedFailureRate = failureRate.toFixed(2);

  // Determine if the failure rate is within goal (lower is better)
  const getCardClass = () => {
    if (failureRate <= failureRateGoal) {
      return "bg-green-100 border-l-4 border-green-500";
    }
    const difference = ((failureRate - failureRateGoal) / failureRateGoal) * 100;
    if (difference <= 100) {
      return "bg-orange-100 border-l-4 border-orange-500";
    }
    return "bg-red-100 border-l-4 border-red-500";
  };

  return (
    <Card className={`h-32 ${getCardClass()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Failure Rate overall (Incident on Delivery)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formattedFailureRate}%
        </div>
        <CardDescription className="text-xs mt-1">
          Goal ≤{failureRateGoal.toFixed(2)}% in {weeksComputation} weeks
        </CardDescription>
      </CardContent>
    </Card>
  );
};

export default FailureRateMetric;