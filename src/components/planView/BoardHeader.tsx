import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { UserFilterSelector } from '@/components/UserFilterSelector';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useFocusMode } from '@/hooks/useFocusMode';
import { FocusModeBar } from './FocusModeBar';

export interface FilterState {
    searchText: string;
    userId: string | null;
    columns: string[];
    minLikes: number;
    tags: string[];
}

export interface ColumnOption {
    value: string;
    label: string;
}

export interface TagOption {
    value: string;
    label: string;
    className?: string;
}

interface FilterPanelProps {
    filterState: FilterState;
    onFilterChange: (newState: FilterState) => void;
    columnOptions: ColumnOption[];
    tagOptions?: TagOption[];
    className?: string;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
    filterState,
    onFilterChange,
    columnOptions,
    tagOptions,
    className = '',
}) => {
    const hasActiveFilters = filterState.searchText.trim() !== '' ||
        filterState.userId !== null ||
        filterState.columns.length > 0 ||
        filterState.minLikes > 0 ||
        filterState.tags.length > 0;

    const updateFilter = (key: keyof FilterState, value: FilterState[keyof FilterState]) => {
        onFilterChange({ ...filterState, [key]: value });
    };

    const clearFilters = () => {
        onFilterChange({
            searchText: '',
            userId: null,
            columns: [],
            minLikes: 0,
            tags: [],
        });
    };

    return (
        <div className={`flex flex-wrap items-center gap-4 ${className}`}>
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

            <div className="h-6 border-l border-gray-300"></div>

            <div className="flex items-center gap-2">
                <UserFilterSelector
                    className="w-40"
                    selectedUserId={filterState.userId}
                    onUserChange={(id) => updateFilter('userId', id)}
                />
            </div>

            <div className="h-6 border-l border-gray-300"></div>

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

            <div className="h-6 border-l border-gray-300"></div>

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

            {tagOptions && tagOptions.length > 0 && (
                <>
                    <div className="h-6 border-l border-gray-300"></div>
                    <div className="flex items-center gap-2">
                        <Label>Tags:</Label>
                        <MultiSelect
                            options={tagOptions}
                            selected={filterState.tags}
                            onChange={(tags) => updateFilter('tags', tags)}
                            placeholder="All tags..."
                            className="w-40"
                        />
                    </div>
                </>
            )}

            {hasActiveFilters && (
                <>
                    <div className="h-6 border-l border-gray-300"></div>
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                        <X className="mr-2 h-4 w-4" />
                        Clear Filters
                    </Button>
                </>
            )}
        </div>
    );
};

interface BoardHeaderProps {
    title?: string;
    titleContent?: React.ReactNode; // Extra content in title (e.g. Budget)
    filterState: FilterState;
    onFilterChange: (newState: FilterState) => void;
    columnOptions: ColumnOption[];
    tagOptions?: TagOption[];
    sessionControls?: React.ReactNode;
    customControls?: React.ReactNode; // e.g., Moderator controls
    focusModeLeftContent?: React.ReactNode; // Extra content on the left of focus mode bar (next to title)
    focusModeRightExtra?: React.ReactNode; // Extra content on the right of focus mode bar (before Filters)
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
    title = '',
    titleContent,
    filterState,
    onFilterChange,
    columnOptions,
    tagOptions,
    sessionControls,
    customControls,
    focusModeLeftContent,
    focusModeRightExtra,
}) => {
    const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
    const [isModeratorControlsOpen, setIsModeratorControlsOpen] = useState(false);
    const { isFocusMode } = useFocusMode();

    // Collapse filters by default when entering focus mode
    React.useEffect(() => {
        if (isFocusMode) {
            setIsFiltersCollapsed(true);
            setIsModeratorControlsOpen(false);
        }
    }, [isFocusMode]);

    const hasActiveFilters = filterState.searchText.trim() !== '' ||
        filterState.userId !== null ||
        filterState.columns.length > 0 ||
        filterState.minLikes > 0 ||
        filterState.tags.length > 0;

    if (isFocusMode) {
        const filterDropdown = (
            <FilterPanel
                filterState={filterState}
                onFilterChange={onFilterChange}
                columnOptions={columnOptions}
                tagOptions={tagOptions}
            />
        );
        const moderatorDropdown = (
            <>
                {sessionControls}
                {customControls}
            </>
        );
        return (
            <FocusModeBar
                title={title}
                leftContent={focusModeLeftContent}
                rightContent={focusModeRightExtra}
                hasActiveFilters={hasActiveFilters}
                filterDropdownContent={filterDropdown}
                moderatorDropdownContent={(sessionControls || customControls) ? moderatorDropdown : undefined}
            />
        );
    }

    return (
        <div className="flex flex-col space-y-2">
            {/* Session controls row — right-aligned, wrapping */}
            {sessionControls && (
                <div className="flex flex-wrap justify-end items-center gap-2">
                    {sessionControls}
                </div>
            )}

            {/* Filters toggle (left) + custom controls (right) row */}
            <div className="flex flex-wrap items-start justify-between gap-y-2">
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
                {customControls && (
                    <div className="flex flex-wrap items-center gap-2">
                        {customControls}
                    </div>
                )}
            </div>

            {/* Collapsible Filter Panel */}
            {!isFiltersCollapsed && (
                <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3 bg-background animate-in fade-in slide-in-from-top-2">
                    <FilterPanel
                        filterState={filterState}
                        onFilterChange={onFilterChange}
                        columnOptions={columnOptions}
                        tagOptions={tagOptions}
                    />
                </div>
            )}
        </div>
    );
};
