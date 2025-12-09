import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

import { ViewContext, ViewType, ViewContextType, COMPACTNESS_FULL, COMPACTNESS_ULTRA } from './ViewContextDefinition';

import { useUserSettings } from "@/hooks/useUserSettings";

export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [view, setView] = useState<ViewType>("kanban");
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const { userSettings, updateCardCompactness, loading } = useUserSettings();

    // Initialize from user settings, default to ULTRA if not set
    const [cardCompactness, setLocalCardCompactness] = useState<number>(userSettings.cardCompactness ?? COMPACTNESS_ULTRA);

    // Sync local state when user settings change (e.g. from other tabs/devices)
    useEffect(() => {
        if (!loading && userSettings.cardCompactness !== undefined) {
            setLocalCardCompactness(userSettings.cardCompactness);
        }
    }, [userSettings.cardCompactness, loading]);

    const handleFocusOnTask = (taskId: string) => {
        setView("focus");
        setFocusedTaskId(taskId);
    };

    const setCardCompactness = (value: number) => {
        setLocalCardCompactness(value);
        updateCardCompactness(value);
    };

    return (
        <ViewContext.Provider value={{ view, setView, focusedTaskId, setFocusedTaskId, handleFocusOnTask, cardCompactness, setCardCompactness }}>
            {children}
        </ViewContext.Provider>
    );
};
