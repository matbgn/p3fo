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
    | "celebration";

export const COMPACTNESS_ULTRA = 0;
export const COMPACTNESS_COMPACT = 1;
export const COMPACTNESS_FULL = 2;

// Navigation context: view state + navigation actions
// Only consumed by Index.tsx + components that need to navigate
export interface ViewNavigationContextType {
    view: ViewType;
    setView: (view: ViewType) => void;
    focusedTaskId: string | null;
    setFocusedTaskId: (taskId: string | null) => void;
    handleFocusOnTask: (taskId: string) => void;
}

// Display context: visual preferences that don't change on tab switch
// Consumed by TaskCard, KanbanBoard, etc.
export interface ViewDisplayContextType {
    cardCompactness: number;
    setCardCompactness: (compactness: number) => void;
}

// Legacy combined type for backward compatibility
export interface ViewContextType extends ViewNavigationContextType, ViewDisplayContextType { }

export const ViewNavigationContext = createContext<ViewNavigationContextType | undefined>(undefined);
export const ViewDisplayContext = createContext<ViewDisplayContextType | undefined>(undefined);

// Legacy context — kept for any remaining consumers during migration
export const ViewContext = createContext<ViewContextType | undefined>(undefined);
