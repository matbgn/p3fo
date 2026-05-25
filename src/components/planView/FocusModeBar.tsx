import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Minimize2 } from 'lucide-react';
import { useFocusMode } from '@/hooks/useFocusMode';

interface FocusModeBarProps {
    title?: string;
    leftContent?: React.ReactNode;
    rightContent?: React.ReactNode;
    hasActiveFilters?: boolean;
    filterDropdownContent?: React.ReactNode;
    moderatorDropdownContent?: React.ReactNode;
}

export const FocusModeBar: React.FC<FocusModeBarProps> = ({
    title = '',
    leftContent,
    rightContent,
    hasActiveFilters = false,
    filterDropdownContent,
    moderatorDropdownContent,
}) => {
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isModeratorOpen, setIsModeratorOpen] = useState(false);
    const { exitFocusMode } = useFocusMode();

    return (
        <div className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/80 backdrop-blur-sm">
                <div className="flex items-center gap-2 min-w-0">
                    {title && (
                        <span className="text-sm font-semibold text-muted-foreground truncate">{title}</span>
                    )}
                    {leftContent}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {rightContent}
                    {filterDropdownContent && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="p-0 h-6 w-6"
                                onClick={() => {
                                    setIsFiltersOpen(!isFiltersOpen);
                                    setIsModeratorOpen(false);
                                }}
                            >
                                {isFiltersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <span
                                className="text-sm font-medium text-muted-foreground cursor-pointer select-none"
                                onClick={() => {
                                    setIsFiltersOpen(!isFiltersOpen);
                                    setIsModeratorOpen(false);
                                }}
                            >
                                Filters
                                {hasActiveFilters && (
                                    <span className="ml-2 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">!</span>
                                )}
                            </span>
                        </div>
                    )}
                    {moderatorDropdownContent && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="p-0 h-6 w-6"
                                onClick={() => {
                                    setIsModeratorOpen(!isModeratorOpen);
                                    setIsFiltersOpen(false);
                                }}
                            >
                                {isModeratorOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <span
                                className="text-sm font-medium text-muted-foreground cursor-pointer select-none"
                                onClick={() => {
                                    setIsModeratorOpen(!isModeratorOpen);
                                    setIsFiltersOpen(false);
                                }}
                            >
                                Controls
                            </span>
                        </div>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={exitFocusMode}
                        title="Exit Focus Mode (F11 or Esc)"
                    >
                        <Minimize2 className="h-3 w-3 mr-1" />
                        Exit Focus
                    </Button>
                </div>
            </div>

            {isFiltersOpen && filterDropdownContent && (
                <div className="relative z-[102] flex flex-wrap items-center gap-4 border-x border-b rounded-b-lg p-3 bg-background shadow-lg">
                    {filterDropdownContent}
                </div>
            )}

            {isModeratorOpen && moderatorDropdownContent && (
                <div className="relative z-[102] flex flex-wrap items-center gap-4 border-x border-b rounded-b-lg p-3 bg-background shadow-lg">
                    {moderatorDropdownContent}
                </div>
            )}
        </div>
    );
};
