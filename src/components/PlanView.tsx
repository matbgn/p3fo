import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CirclesView from '@/components/CirclesView';
import { RolesTable } from '@/components/RolesTable';

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'roles' | 'circles';

const PlanView: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  const [activeView, setActiveView] = useState<ActiveView>('circles');

  // View toggle buttons component
  const ViewToggleButtons = () => (
    <div className="flex space-x-2">
      <Button
        variant={activeView === 'circles' ? 'default' : 'outline'}
        onClick={() => setActiveView('circles')}
      >
        Circles
      </Button>
      <Button
        variant={activeView === 'roles' ? 'default' : 'outline'}
        onClick={() => setActiveView('roles')}
      >
        Roles
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

  // Render Roles view
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Roles</CardTitle>
          <ViewToggleButtons />
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <div className="h-full px-6 py-1">
          <RolesTable />
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanView;
