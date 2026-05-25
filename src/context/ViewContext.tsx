import React, { useState, ReactNode, useEffect, useMemo, useRef, useCallback } from 'react';

import {
    ViewNavigationContext, ViewDisplayContext, ViewContext,
    ViewType, COMPACTNESS_ULTRA
} from './ViewContextDefinition';

import { useUserSettings } from "@/hooks/useUserSettings";

export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [view, setView] = useState<ViewType>("kanban");
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const [pendingSubView, setPendingSubView] = useState<string | null>(null);
    const { userSettings, updateCardCompactness, loading } = useUserSettings();

    // Initialize from user settings, default to ULTRA if not set
    const [cardCompactness, setLocalCardCompactness] = useState<number>(userSettings.cardCompactness ?? COMPACTNESS_ULTRA);

    // Sync local state when user settings change (e.g. from other tabs/devices)
    useEffect(() => {
        if (!loading && userSettings.cardCompactness !== undefined) {
            setLocalCardCompactness(userSettings.cardCompactness);
        }
    }, [userSettings.cardCompactness, loading]);

    const handleFocusOnTask = React.useCallback((taskId: string) => {
        setView("focus");
        setFocusedTaskId(taskId);
    }, []);

    const pendingSubViewRef = useRef<string | null>(null);
    useEffect(() => {
        pendingSubViewRef.current = pendingSubView;
    }, [pendingSubView]);

    const navigateTo = useCallback((newView: ViewType, subView?: string) => {
        setView(newView);
        if (subView) {
            setPendingSubView(subView);
        }
    }, []);

    const clearPendingSubView = useCallback(() => {
        setPendingSubView(null);
    }, []);

    const setCardCompactness = React.useCallback((value: number) => {
        setLocalCardCompactness(value);
        updateCardCompactness(value);
    }, [updateCardCompactness]);

    // Memoize context values to prevent unnecessary re-renders
    const navValue = useMemo(() => ({
        view, setView, focusedTaskId, setFocusedTaskId, handleFocusOnTask,
        pendingSubView, navigateTo, clearPendingSubView,
    }), [view, focusedTaskId, handleFocusOnTask, pendingSubView, navigateTo, clearPendingSubView]);

    const displayValue = useMemo(() => ({
        cardCompactness, setCardCompactness,
    }), [cardCompactness, setCardCompactness]);

    // Legacy combined context value (for any remaining consumers during migration)
    const legacyValue = useMemo(() => ({
        ...navValue, ...displayValue,
    }), [navValue, displayValue]);

    return (
        <ViewNavigationContext.Provider value={navValue}>
            <ViewDisplayContext.Provider value={displayValue}>
                <ViewContext.Provider value={legacyValue}>
                    {children}
                </ViewContext.Provider>
            </ViewDisplayContext.Provider>
        </ViewNavigationContext.Provider>
    );
};
