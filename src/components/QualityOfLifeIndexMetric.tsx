import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQLI } from "@/hooks/useQLI";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";

const QualityOfLifeIndexMetric: React.FC = () => {
  const { data, loading, error } = useQLI();
  const { settings } = useCombinedSettings();

  // Get goal from combined settings
  const goal = settings.qliGoal;

  const getCardClass = () => {
    if (loading || error || !data) {
      return "bg-card";
    }
    if (data.score >= goal) {
      return "bg-green-100 border-l-4 border-green-500";
    }
    const difference = ((data.score - goal) / goal) * 100;
    if (difference >= -30) {
      return "bg-orange-100 border-l-4 border-orange-500";
    }
    return "bg-red-100 border-l-4 border-red-500";
  };

  if (loading) {
    return (
      <Card className="h-32 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quality of Life Index</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Loading...</div>
          <CardDescription className="text-xs mt-1">
            Calculating QLI score
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-32 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quality of Life Index</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">Error</div>
          <CardDescription className="text-xs mt-1">
            {error}
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="h-32 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quality of Life Index</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">No data</div>
          <CardDescription className="text-xs mt-1">
            No QLI data available
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`h-32 ${getCardClass()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quality of Life Index</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{data.score}%</div>
        <CardDescription className="text-xs mt-1">
          Goal: {goal}%
        </CardDescription>
      </CardContent>
    </Card>
  );
};

export default QualityOfLifeIndexMetric;