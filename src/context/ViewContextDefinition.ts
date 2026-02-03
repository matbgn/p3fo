import { createContext } from 'react';

export type ViewType =
    | "focus"
    | "kanban"
    | "timetable"
    | "program"
    | "settings"
    | "metrics"
    | "plan"
    | "dream"
    | "celebration"
    | "circles";

export const COMPACTNESS_ULTRA = 0;
export const COMPACTNESS_COMPACT = 1;
export const COMPACTNESS_FULL = 2;

export interface ViewContextType {
    view: ViewType;
    setView: (view: ViewType) => void;
    focusedTaskId: string | null;
    setFocusedTaskId: (taskId: string | null) => void;
    handleFocusOnTask: (taskId: string) => void;
    cardCompactness: number;
    setCardCompactness: (compactness: number) => void;
}

export const ViewContext = createContext<ViewContextType | undefined>(undefined);
