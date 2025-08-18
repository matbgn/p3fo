
import { useState, useEffect, useCallback } from 'react';

export const useTimer = () => {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined = undefined;

    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setTime((time) => time + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }

    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  const start = useCallback(() => {
    setIsActive(true);
    setIsPaused(false);
    setStartTime(Date.now());
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    setTime(0);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(!isPaused);
  }, [isPaused]);

  return { time, start, stop, pause, isActive, isPaused, startTime };
};
