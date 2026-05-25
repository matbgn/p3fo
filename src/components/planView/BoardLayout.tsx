import React from 'react';
import { useFocusMode } from '@/hooks/useFocusMode';

interface BoardLayoutProps {
    children: React.ReactNode;
    className?: string;
}

export const BoardLayout: React.FC<BoardLayoutProps> = ({ children, className = '' }) => {
    const { isFocusMode } = useFocusMode();
    return (
        <div className={`h-full flex flex-col ${isFocusMode ? '' : 'space-y-4 p-4'} ${className}`}>
            {children}
        </div>
    );
};
