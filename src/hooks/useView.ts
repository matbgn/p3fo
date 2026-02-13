import { useContext } from 'react';
import { ViewContext, ViewNavigationContext, ViewDisplayContext } from '@/context/ViewContextDefinition';

// Legacy hook — provides the full combined context (navigation + display)
// Components using this will re-render on BOTH view changes and compactness changes.
export const useView = () => {
    const context = useContext(ViewContext);
    if (context === undefined) {
        throw new Error('useView must be used within a ViewProvider');
    }
    return context;
};

// Navigation-only hook — only re-renders when view or focusedTaskId changes.
// Use this in components that need view/setView/handleFocusOnTask.
export const useViewNavigation = () => {
    const context = useContext(ViewNavigationContext);
    if (context === undefined) {
        throw new Error('useViewNavigation must be used within a ViewProvider');
    }
    return context;
};

// Display-only hook — only re-renders when cardCompactness changes.
// Use this in TaskCard, KanbanBoard, etc. that only need cardCompactness.
export const useViewDisplay = () => {
    const context = useContext(ViewDisplayContext);
    if (context === undefined) {
        throw new Error('useViewDisplay must be used within a ViewProvider');
    }
    return context;
};
