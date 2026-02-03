import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const PlanView: React.FC<PlanViewProps> = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Plan View</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">Plan View - Coming Soon</p>
          <p className="text-sm mt-2">Storyboard and Prioritization features have been moved to Dream View.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanView;
