import React, { createContext, useContext, useState, ReactNode } from 'react';

import { ViewContext, ViewType, ViewContextType } from './ViewContextDefinition';

export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [view, setView] = useState<ViewType>("kanban");
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
