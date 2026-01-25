import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserFilterSelector } from '@/components/UserFilterSelector';
import { ChevronDown, ChevronRight, Search, X, ThumbsUp } from 'lucide-react';

export interface FilterState {
    searchText: string;
    userId: string | null;
    columns: string[];
    minLikes: number;
}

export interface ColumnOption {
    value: string;
    label: string;
}

interface BoardHeaderProps {
    title: string;
    titleContent?: React.ReactNode; // Extra content in title (e.g. Budget)
    filterState: FilterState;
    onFilterChange: (newState: FilterState) => void;
    columnOptions: ColumnOption[];
    sessionControls?: React.ReactNode;
    customControls?: React.ReactNode; // e.g., Moderator controls
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
    title,
    titleContent,
    filterState,
    onFilterChange,
    columnOptions,
    sessionControls,
    customControls,
}) => {
    const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);

    const hasActiveFilters = filterState.searchText.trim() !== '' ||
        filterState.userId !== null ||
        filterState.columns.length > 0 ||
        filterState.minLikes > 0;

    const updateFilter = (key: keyof FilterState, value: FilterState[keyof FilterState]) => {
        onFilterChange({ ...filterState, [key]: value });
    };

    const clearFilters = () => {
        onFilterChange({
            searchText: '',
            userId: null,
            columns: [],
            minLikes: 0,
        });
    };

    return (
        <div className="flex flex-col space-y-4">
            {/* Top Row: Title & Session Controls */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    {title}
                    {titleContent}
                </h2>
                <div className="flex items-center space-x-2">
                    {sessionControls}
                </div>
            </div>

            {/* Controls Row: Filters Toggle & Custom Controls */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-6 w-6"
                            onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                        >
                            {isFiltersCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <span
                            className="text-sm font-medium text-muted-foreground cursor-pointer select-none"
                            onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                        >
                            Filters & Controls
                            {hasActiveFilters && (
                                <span className="ml-2 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">!</span>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {customControls}
                    </div>
                </div>

                {/* Collapsible Filter Panel */}
                {!isFiltersCollapsed && (
                    <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3 bg-background animate-in fade-in slide-in-from-top-2">
                        {/* Search */}
                        <div className="flex items-center gap-2">
                            <Label>Search:</Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search cards..."
                                    value={filterState.searchText}
                                    onChange={(e) => updateFilter('searchText', e.target.value)}
                                    className="pl-8 w-40"
                                />
                            </div>
                        </div>

                        {/* Vertical separator */}
                        <div className="h-6 border-l border-gray-300"></div>

                        {/* User Filter */}
                        <div className="flex items-center gap-2">
                            <UserFilterSelector
                                className="w-40"
                                selectedUserId={filterState.userId}
                                onUserChange={(id) => updateFilter('userId', id)}
                            />
                        </div>

                        {/* Vertical separator */}
                        <div className="h-6 border-l border-gray-300"></div>

                        {/* Column Filter */}
                        <div className="flex items-center gap-2">
                            <Label>Column:</Label>
                            <MultiSelect
                                options={columnOptions}
                                selected={filterState.columns}
                                onChange={(cols) => updateFilter('columns', cols)}
                                placeholder="All columns..."
                                className="w-40"
                            />
                        </div>

                        {/* Vertical separator */}
                        <div className="h-6 border-l border-gray-300"></div>

                        {/* Min Likes */}
                        <div className="flex items-center gap-2">
                            <Label>Min Likes:</Label>
                            <Input
                                type="number"
                                min={0}
                                value={filterState.minLikes}
                                onChange={(e) => updateFilter('minLikes', Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-16"
                            />
                        </div>

                        {hasActiveFilters && (
                            <>
                                {/* Vertical separator */}
                                <div className="h-6 border-l border-gray-300"></div>
                                <Button variant="outline" size="sm" onClick={clearFilters}>
                                    <X className="mr-2 h-4 w-4" />
                                    Clear Filters
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
