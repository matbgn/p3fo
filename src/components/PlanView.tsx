import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CirclesView from '@/components/CirclesView';

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'plan' | 'circles';

const PlanView: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  const [activeView, setActiveView] = useState<ActiveView>('circles');

  // View toggle buttons component
  const ViewToggleButtons = () => (
    <div className="flex space-x-2">
      <Button
        variant={activeView === 'plan' ? 'default' : 'outline'}
        onClick={() => setActiveView('plan')}
      >
        Plan
      </Button>
      <Button
        variant={activeView === 'circles' ? 'default' : 'outline'}
        onClick={() => setActiveView('circles')}
      >
        Circles
      </Button>
    </div>
  );

  // Render Circles view - no Card wrapper since CirclesView has its own
  if (activeView === 'circles') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex flex-row items-center justify-end pb-2">
          <ViewToggleButtons />
        </div>
        <div className="flex-grow overflow-hidden">
          <CirclesView onFocusOnTask={onFocusOnTask} />
        </div>
      </div>
    );
  }

  // Render Plan view (placeholder for now)
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Plan View</CardTitle>
          <ViewToggleButtons />
        </div>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">Plan View - Coming Soon</p>
          <p className="text-sm mt-2">Storyboard and Prioritization features are available in Dream View.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanView;
