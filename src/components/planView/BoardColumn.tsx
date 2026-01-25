import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Plus, HatGlasses, ChevronDown, ChevronUp } from 'lucide-react';

export interface ColumnDefinition {
    id: string;
    title: string;
    color: string;
    isLocked: boolean;
}

interface BoardColumnProps<T> {
    column: ColumnDefinition;
    cards: T[];
    activeColumnId: string | null;
    onSetActiveColumnId: (id: string | null) => void;
    onAddCard: (content: string, anonymous: boolean) => void;
    renderCard: (card: T) => React.ReactNode;

    // Drag & Drop
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;

    // Sorting
    sortOrder?: 'asc' | 'desc' | 'none';
    onToggleSort?: () => void;

    // Extra Header Actions (e.g. Timeline toggle)
    headerActions?: React.ReactNode;

    // Lock logic
    isModerator?: boolean;
    onToggleLock?: () => void;

    // Editing Title
    isEditingTitle?: boolean;
    editingTitleValue?: string;
    onEditingTitleChange?: (val: string) => void;
    onEditingTitleCommit?: () => void;
    onEditingTitleCancel?: () => void;
    onTitleDoubleClick?: () => void;
    onChangeColor?: (color: string) => void;
    className?: string;
}

export function BoardColumn<T extends { id: string }>({
    column,
    cards,
    activeColumnId,
    onSetActiveColumnId,
    onAddCard,
    renderCard,
    onDragOver,
    onDrop,
    sortOrder,
    onToggleSort,
    headerActions,
    isModerator,
    onToggleLock,
    isEditingTitle,
    editingTitleValue,
    onEditingTitleChange,
    onEditingTitleCommit,
    onEditingTitleCancel,
    onTitleDoubleClick,
    className = "min-w-[300px] w-1/5",
}: BoardColumnProps<T>) {
    const [newCardContent, setNewCardContent] = useState('');
    const [isAnonymousMode, setIsAnonymousMode] = useState(false);

    // Initial sort button title
    const sortTitle = sortOrder === 'desc'
        ? 'Sorted by votes (high to low)'
        : sortOrder === 'asc'
            ? 'Sorted by votes (low to high)'
            : 'Sort by votes';

    return (
        <div
            className={`flex flex-col border rounded-lg bg-background ${className}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Column Header */}
            <div
                className="p-3 font-bold flex justify-between items-center rounded-t-lg bg-background border-b"
                style={{ borderTop: `4px solid ${column.color}` }}
            >
                {isEditingTitle ? (
                    <Input
                        autoFocus
                        value={editingTitleValue}
                        onChange={(e) => onEditingTitleChange?.(e.target.value)}
                        onBlur={onEditingTitleCommit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onEditingTitleCommit?.();
                            else if (e.key === 'Escape') onEditingTitleCancel?.();
                        }}
                        className="h-6 px-1 py-0 text-sm font-bold"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span
                        className={isModerator && onTitleDoubleClick ? 'cursor-pointer' : ''}
                        onDoubleClick={(e) => {
                            if (isModerator && onTitleDoubleClick) {
                                e.stopPropagation();
                                onTitleDoubleClick();
                            }
                        }}
                    >
                        {column.title}
                    </span>
                )}

                <div className="flex items-center space-x-1">
                    <span className="text-xs text-muted-foreground">
                        {cards.length}
                    </span>

                    {/* Custom Actions (e.g. Timeline toggle) */}
                    {headerActions}

                    {/* Sort Button */}
                    {onToggleSort && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={onToggleSort}
                            title={sortTitle}
                        >
                            {sortOrder === 'desc' ? (
                                <ChevronDown className="h-3 w-3 text-primary" />
                            ) : sortOrder === 'asc' ? (
                                <ChevronUp className="h-3 w-3 text-primary" />
                            ) : (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            )}
                        </Button>
                    )}

                    {/* Lock Button */}
                    {isModerator && onToggleLock ? (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleLock}>
                            {column.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        </Button>
                    ) : (
                        column.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                </div>
            </div>

            {/* Column Content */}
            <div className="flex-grow p-2 space-y-2 overflow-y-auto">
                {!column.isLocked && (
                    <div className="mb-2">
                        {activeColumnId === column.id ? (
                            <div className="space-y-2">
                                <Input
                                    autoFocus
                                    value={newCardContent}
                                    onChange={(e) => setNewCardContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onAddCard(newCardContent, isAnonymousMode);
                                            setNewCardContent(''); // Keep open or close? Typically keep open for rapid entry but maybe reset content
                                            // Actually original behavior was to NOT close, but clear content.
                                        }
                                        if (e.key === 'Escape') {
                                            onSetActiveColumnId(null);
                                            setNewCardContent('');
                                            setIsAnonymousMode(false);
                                        }
                                    }}
                                    placeholder="Type..."
                                />
                                <div className="flex space-x-1">
                                    <Button
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => {
                                            onAddCard(newCardContent, isAnonymousMode);
                                            setNewCardContent('');
                                        }}
                                    >
                                        Add {isAnonymousMode ? ' (Anonymously)' : ''}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => {
                                        onSetActiveColumnId(null);
                                        setNewCardContent('');
                                        setIsAnonymousMode(false);
                                    }}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex w-full rounded-md border border-dashed overflow-hidden">
                                <Button
                                    variant="ghost"
                                    className="flex-1 rounded-none border-r border-dashed h-9"
                                    onClick={() => {
                                        onSetActiveColumnId(column.id);
                                        setIsAnonymousMode(false);
                                    }}
                                    title="Add card with your name"
                                >
                                    <Plus className="h-4 w-4" /> Add Card
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="flex-1 rounded-none h-9"
                                    onClick={() => {
                                        onSetActiveColumnId(column.id);
                                        setIsAnonymousMode(true);
                                    }}
                                    title="Add anonymous card"
                                >
                                    <Plus className="h-3 w-3" />
                                    <HatGlasses className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Render Cards */}
                {cards.length === 0 && activeColumnId !== column.id && (
                    <div className="text-center text-sm text-muted-foreground py-4">
                        No cards in this column yet.
                    </div>
                )}

                {cards.map(card => renderCard(card))}
            </div>
        </div>
    );
}
