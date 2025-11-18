import { useEffect, useState } from 'react';
import { awareness } from '@/lib/collaboration';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useView } from '@/context/ViewContext';

// Define the cursor state structure
export type CursorState = {
    x: number;
    y: number;
    user: {
        name: string;
        color: string;
    };
    view?: string;
};

const colors = [
    '#f87171', // red-400
    '#fb923c', // orange-400
    '#facc15', // yellow-400
    '#a3e635', // lime-400
    '#4ade80', // green-400
    '#2dd4bf', // teal-400
    '#38bdf8', // sky-400
    '#818cf8', // indigo-400
    '#c084fc', // purple-400
    '#f472b6', // pink-400
];

const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

export const useCursors = () => {
    const [cursors, setCursors] = useState<Map<number, CursorState>>(new Map());
    const { userSettings } = useUserSettings();
    const { view } = useView();
    const [userColor] = useState(getRandomColor());

    useEffect(() => {
        // Set local user state
        awareness.setLocalStateField('user', {
            name: userSettings.username,
            color: userColor,
        });
        awareness.setLocalStateField('view', view);

        // Handle mouse movement
        const handleMouseMove = (e: MouseEvent) => {
            awareness.setLocalStateField('cursor', {
                x: e.clientX,
                y: e.clientY,
            });
        };

        // Handle awareness updates
        const handleAwarenessUpdate = () => {
            const newCursors = new Map<number, CursorState>();

            awareness.getStates().forEach((state, clientId) => {
                if (clientId === awareness.clientID) return; // Ignore self

                if (state.cursor && state.user) {
                    newCursors.set(clientId, {
                        x: state.cursor.x,
                        y: state.cursor.y,
                        user: state.user,
                        view: state.view,
                    });
                }
            });

            setCursors(newCursors);
        };

        window.addEventListener('mousemove', handleMouseMove);
        awareness.on('change', handleAwarenessUpdate);

        // Clean up on unmount
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            awareness.off('change', handleAwarenessUpdate);
        };
    }, [userSettings.username, userColor, view]);

    return cursors;
};
