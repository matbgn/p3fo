import { createContext } from 'react';

export type ViewType =
    | "focus"
    | "kanban"
    | "timetable"
    | "program"
    | "settings"
    | "metrics"

    | "plan";

export interface ViewContextType {
    view: ViewType;
    setView: (view: ViewType) => void;
    focusedTaskId: string | null;
    setFocusedTaskId: (taskId: string | null) => void;
    handleFocusOnTask: (taskId: string) => void;
}

export const ViewContext = createContext<ViewContextType | undefined>(undefined);
