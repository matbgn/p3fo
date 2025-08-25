import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTasks } from "@/hooks/useTasks";
import { calculateFailureRate } from "@/lib/metrics";

// Default settings
const DEFAULT_WEEKS_COMPUTATION = 4;
const DEFAULT_FAILURE_RATE_GOAL = 5;

const FailureRateMetric: React.FC = () => {
  const { tasks } = useTasks();
  
  // Get settings from localStorage or use defaults
  const weeksComputation = parseInt(
    localStorage.getItem("weeksComputation") || DEFAULT_WEEKS_COMPUTATION.toString()
  );
  
  const failureRateGoal = parseFloat(
    localStorage.getItem("failureRateGoal") || DEFAULT_FAILURE_RATE_GOAL.toString()
  );
  
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
        <CardTitle className="text-sm font-medium">Failure Rate (Incident on Delivery)</CardTitle>
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