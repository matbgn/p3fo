import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ViewType =
    | "focus"
    | "kanban"
    | "timetable"
    | "program"
    | "settings"
    | "metrics"
    | "qol-survey"
    | "plan";

interface ViewContextType {
    view: ViewType;
    setView: (view: ViewType) => void;
    focusedTaskId: string | null;
    setFocusedTaskId: (taskId: string | null) => void;
    handleFocusOnTask: (taskId: string) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [view, setView] = useState<ViewType>("focus");
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

    const handleFocusOnTask = (taskId: string) => {
        setView("focus");
        setFocusedTaskId(taskId);
    };

    return (
        <ViewContext.Provider value={{ view, setView, focusedTaskId, setFocusedTaskId, handleFocusOnTask }}>
            {children}
        </ViewContext.Provider>
    );
};

export const useView = () => {
    const context = useContext(ViewContext);
    if (context === undefined) {
        throw new Error('useView must be used within a ViewProvider');
    }
    return context;
};
