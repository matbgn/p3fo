import React from 'react';
import { FertilizationView } from './FertilizationView';
import { useView } from '@/hooks/useView';

interface CelebrationViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const CelebrationView: React.FC<CelebrationViewProps> = ({ onFocusOnTask }) => {
  const { setView, setFocusedTaskId } = useView();

  const handlePromoteToKanban = (taskId: string) => {
    setFocusedTaskId(taskId);
    setView('kanban');
  };

  return (
    <FertilizationView onPromoteToKanban={handlePromoteToKanban} />
  );
};

export default CelebrationView;
