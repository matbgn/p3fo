import { useEffect, useState, useCallback, useRef } from 'react';
import { TravelMode } from './traveler-types';

export type ActiveTechnique = 'pomodoro' | 'traveler';

export interface TravelerIdleState {
  departure: string;
  destination: string;
  travelMode: TravelMode;
  activeTechnique: ActiveTechnique;
  durationPreviewMs: number | null;
  searchLoading: boolean;
  setDeparture: (code: string) => void;
  setDestination: (code: string) => void;
  setDurationPreviewMs: (ms: number | null) => void;
  setTravelMode: (mode: TravelMode) => void;
  setActiveTechnique: (t: ActiveTechnique) => void;
  start: () => void;
  search: () => void;
  reset: () => void;
  startPomodoro: () => void;
}

const initial = {
  departure: '',
  destination: '',
  travelMode: 'flight' as TravelMode,
  activeTechnique: 'pomodoro' as ActiveTechnique,
  durationPreviewMs: null as number | null,
};

let state = { ...initial };
const startFns = new Set<() => void>();
const searchFns = new Set<() => void>();
const pomodoroStartFns = new Set<() => void>();
let searchLoading = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export const setTravelerIdleState = (patch: Partial<typeof state>) => {
  state = { ...state, ...patch };
  notify();
};

export const setTravelModeAndReset = (mode: TravelMode) => {
  if (state.travelMode === mode) return;
  state = {
    ...state,
    travelMode: mode,
    departure: '',
    destination: '',
    durationPreviewMs: null,
  };
  searchLoading = false;
  notify();
};

export const setSearchLoading = (loading: boolean) => {
  searchLoading = loading;
  notify();
};

export const registerTravelerStartFn = (fn: () => void) => {
  startFns.add(fn);
  return () => { startFns.delete(fn); };
};

export const registerTravelerSearchFn = (fn: () => void) => {
  searchFns.add(fn);
  return () => { searchFns.delete(fn); };
};

export const registerPomodoroStartFn = (fn: () => void) => {
  pomodoroStartFns.add(fn);
  return () => { pomodoroStartFns.delete(fn); };
};

export const subscribeTravelerIdle = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const resetFns = new Set<() => void>();

export const registerTravelerResetFn = (fn: () => void) => {
  resetFns.add(fn);
  return () => { resetFns.delete(fn); };
};

const callAllResetFns = () => {
  resetFns.forEach((fn) => fn());
};

const callAllStartFns = () => {
  startFns.forEach((fn) => fn());
};

const callAllSearchFns = () => {
  searchFns.forEach((fn) => fn());
};

const callAllPomodoroStartFns = () => {
  pomodoroStartFns.forEach((fn) => fn());
};

export const useTravelerIdleState = (): TravelerIdleState => {
  const [, force] = useState(0);
  const forceUpdateRef = useRef(force);
  forceUpdateRef.current = force;

  useEffect(() => {
    const sub = () => forceUpdateRef.current((n) => n + 1);
    listeners.add(sub);
    return () => { listeners.delete(sub); };
  }, []);

  // Expose a getter so consumers can read the latest store state in
  // effects without subscribing to it.
  return {
    departure: state.departure,
    destination: state.destination,
    travelMode: state.travelMode,
    activeTechnique: state.activeTechnique,
    durationPreviewMs: state.durationPreviewMs,
    searchLoading,
    setDeparture: useCallback((code: string) => setTravelerIdleState({ departure: code }), []),
    setDestination: useCallback((code: string) => setTravelerIdleState({ destination: code }), []),
    setDurationPreviewMs: useCallback((ms: number | null) => setTravelerIdleState({ durationPreviewMs: ms }), []),
    setTravelMode: useCallback((mode: TravelMode) => setTravelModeAndReset(mode), []),
    setActiveTechnique: useCallback((t: ActiveTechnique) => setTravelerIdleState({ activeTechnique: t }), []),
    start: useCallback(() => callAllStartFns(), []),
    search: useCallback(() => callAllSearchFns(), []),
    startPomodoro: useCallback(() => callAllPomodoroStartFns(), []),
    reset: useCallback(() => {
      // Clear the store's inputs/preview
      setTravelerIdleState({
        departure: '',
        destination: '',
        durationPreviewMs: null,
      });
      // Then notify the QuickTimer to also clear its local state
      callAllResetFns();
    }, []),
  };
};

/**
 * Read the current store snapshot without subscribing to it.
 * Useful inside effects that need to react to store-driven changes
 * (e.g. clearing local state when the store resets via a PiP action).
 */
export const readTravelerIdleSnapshot = () => ({ ...state, searchLoading });

export const destroyTravelerIdleState = () => {
  state = { ...initial };
  searchLoading = false;
  startFns.clear();
  searchFns.clear();
  pomodoroStartFns.clear();
  resetFns.clear();
  listeners.clear();
};