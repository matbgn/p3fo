import React, { useState, ReactNode, useEffect, useMemo, useRef, useCallback } from 'react';

import {
    ViewNavigationContext, ViewDisplayContext, ViewContext,
    ViewType, COMPACTNESS_ULTRA
} from './ViewContextDefinition';

import type { ModuleId } from '@/lib/persistence-types';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useSettingsContext } from '@/context/SettingsContext';

export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [view, setView] = useState<ViewType>("kanban");
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const [pendingSubView, setPendingSubView] = useState<string | null>(null);
    const { userSettings, updateCardCompactness, loading } = useUserSettings();
    const { settings, updateSettings } = useSettingsContext();

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

    const disabledModules = useMemo(() => settings.disabledModules ?? [], [settings.disabledModules]);

    const setDisabledModules = useCallback((modules: ModuleId[]) => {
        updateSettings({ disabledModules: modules }, 'global');
    }, [updateSettings]);

    // Auto-navigate away from disabled views
    useEffect(() => {
        if (disabledModules.includes(view as ModuleId)) {
            const ALL_VIEWS: ViewType[] = ['kanban', 'focus', 'timetable', 'celebration', 'dream', 'plan', 'program', 'metrics', 'voting', 'settings'];
            const fallback = ALL_VIEWS.find(v => !disabledModules.includes(v as ModuleId)) || 'kanban';
            setView(fallback);
        }
    }, [disabledModules, view]);

    // Memoize context values to prevent unnecessary re-renders
    const navValue = useMemo(() => ({
        view, setView, focusedTaskId, setFocusedTaskId, handleFocusOnTask,
        pendingSubView, navigateTo, clearPendingSubView,
        disabledModules, setDisabledModules,
    }), [view, focusedTaskId, handleFocusOnTask, pendingSubView, navigateTo, clearPendingSubView, disabledModules, setDisabledModules]);

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
