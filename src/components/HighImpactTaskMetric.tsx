import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTasks } from "@/hooks/useTasks";
import { calculateHighImpactTaskFrequency, getCompletedHighImpactTasks } from "@/lib/metrics";

// Default settings
const DEFAULT_WORKLOAD_PERCENTAGE = 0.6;
const DEFAULT_WEEKS_COMPUTATION = 4;
const DEFAULT_HIGH_IMPACT_TASK_GOAL = 3.63;

const HighImpactTaskMetric: React.FC = () => {
  const { tasks } = useTasks();
  
  // Get settings from localStorage or use defaults
  const workloadPercentage = parseFloat(
    localStorage.getItem("userWorkloadPercentage") || DEFAULT_WORKLOAD_PERCENTAGE.toString()
  );
  
  const weeksComputation = parseInt(
    localStorage.getItem("weeksComputation") || DEFAULT_WEEKS_COMPUTATION.toString()
  );
  
  const highImpactTaskGoal = parseFloat(
    localStorage.getItem("highImpactTaskGoal") || DEFAULT_HIGH_IMPACT_TASK_GOAL.toString()
  );
  
  const completedTasks = getCompletedHighImpactTasks(tasks, weeksComputation);
  const frequency = calculateHighImpactTaskFrequency(tasks, weeksComputation, workloadPercentage);
  
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
        <CardTitle className="text-sm font-medium">High Impact Task Achievement per EFT</CardTitle>
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