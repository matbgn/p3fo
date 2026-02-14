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
    // Navigate to Dream view which has storyboard for highlighting
    setView('dream');
  };

  return (
    <FertilizationView onPromoteToKanban={handlePromoteToKanban} />
  );
};

export default CelebrationView;
