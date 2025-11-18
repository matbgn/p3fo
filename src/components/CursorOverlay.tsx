import React from 'react';
import { useCursors } from '@/hooks/useCursors';
import { MousePointer2 } from 'lucide-react';

export const CursorOverlay = () => {
    const cursors = useCursors();

    return (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
            {Array.from(cursors.entries()).map(([clientId, state]) => (
                <div
                    key={clientId}
                    className="absolute transition-all duration-100 ease-linear"
                    style={{
                        left: state.x,
                        top: state.y,
                    }}
                >
                    <MousePointer2
                        className="h-5 w-5"
                        style={{ fill: state.user.color, color: state.user.color }}
                    />
                    <div
                        className="absolute left-4 top-4 rounded-full px-2 py-1 text-xs text-white whitespace-nowrap shadow-md"
                        style={{ backgroundColor: state.user.color }}
                    >
                        {state.user.name}
                    </div>
                </div>
            ))}
        </div>
    );
};
