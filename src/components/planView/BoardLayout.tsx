import React from 'react';

interface BoardLayoutProps {
    children: React.ReactNode;
    className?: string;
}

export const BoardLayout: React.FC<BoardLayoutProps> = ({ children, className = '' }) => {
    return (
        <div className={`h-full flex flex-col space-y-4 p-4 ${className}`}>
            {children}
        </div>
    );
};
