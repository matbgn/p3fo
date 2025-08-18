
import { useTimer } from '../hooks/useTimer';

export const Timer = ({ taskId, updateTaskTimer }: { taskId: string, updateTaskTimer: (taskId: string, startTime: number, endTime: number) => void }) => {
  const { time, start, stop, pause, isActive, isPaused, startTime } = useTimer();

  const formatTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleStop = () => {
    updateTaskTimer(taskId, startTime, Date.now());
    stop();
  };

  return (
    <div>
      <h1>{formatTime(time)}</h1>
      <div>
        {!isActive ? (
          <button onClick={start}>Start</button>
        ) : (
          <>
            <button onClick={pause}>{isPaused ? 'Resume' : 'Pause'}</button>
            <button onClick={handleStop}>Stop</button>
          </>
        )}
      </div>
    </div>
  );
};
