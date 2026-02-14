import React from 'react';
import { FertilizationView } from './FertilizationView';
import { useViewNavigation } from '@/hooks/useView';

interface CelebrationViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const CelebrationView: React.FC<CelebrationViewProps> = ({ onFocusOnTask }) => {
  const { setView, setFocusedTaskId } = useViewNavigation();

  const handlePromoteToKanban = (taskId: string) => {
    setFocusedTaskId(taskId);
    setView('kanban');
  };

  return (
    <FertilizationView onPromoteToKanban={handlePromoteToKanban} />
  );
};

export default CelebrationView;
