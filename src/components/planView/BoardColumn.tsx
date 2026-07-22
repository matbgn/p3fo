import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Plus, HatGlasses, ChevronDown, ChevronUp } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

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
    onAddCard: (content: string, anonymous: boolean, tag?: string) => void;
    renderCard: (card: T) => React.ReactNode;

    // Optional tag selector for add input (e.g. fact tags)
    tagOptions?: { value: string; label: string; letter: string; className?: string }[];
    tagValue?: string;
    onTagChange?: (value: string) => void;

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
    votingToolbar?: React.ReactNode;
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
    votingToolbar,
    tagOptions,
    tagValue,
    onTagChange,
}: BoardColumnProps<T>) {
    const { t } = useTranslation();
    const [newCardContent, setNewCardContent] = useState('');
    const [isAnonymousMode, setIsAnonymousMode] = useState(false);

    // Initial sort button title
    const sortTitle = sortOrder === 'desc'
        ? t('board.sortedHighToLow')
        : sortOrder === 'asc'
            ? t('board.sortedLowToHigh')
            : t('board.sortByVotes');

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

            {/* Column Voting Toolbar */}
            {votingToolbar && (
                <div className="px-3 py-2 border-b bg-muted/30">
                    {votingToolbar}
                </div>
            )}

            {/* Column Content */}
            <div className="flex-grow p-2 space-y-2 overflow-y-auto">
                {!column.isLocked && (
                    <div className="mb-2">
                        {activeColumnId === column.id ? (
                            <div className="space-y-2">
                                <div className="flex gap-1 items-center">
                                    <Input
                                        autoFocus
                                        value={newCardContent}
                                        onChange={(e) => setNewCardContent(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                onAddCard(newCardContent, isAnonymousMode, tagValue);
                                                setNewCardContent('');
                                            }
                                            if (e.key === 'Escape') {
                                                onSetActiveColumnId(null);
                                                setNewCardContent('');
                                                setIsAnonymousMode(false);
                                            }
                                        }}
                                        placeholder={t('board.typePlaceholder')}
                                        className="flex-1"
                                    />
                                    {tagOptions && onTagChange && (
                                        <Select value={tagValue || ''} onValueChange={onTagChange}>
                                            <SelectTrigger className="w-12 h-10 px-1 text-xs justify-center">
                                                {(() => {
                                                    const selected = tagOptions.find(o => o.value === tagValue);
                                                    return selected ? (
                                                        <span className={selected.className}>{selected.letter}</span>
                                                    ) : (
                                                         <span className="text-muted-foreground">{t('board.tag')}</span>
                                                    );
                                                })()}
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tagOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                                        <span className={opt.className}>{opt.letter}</span> {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                <div className="flex space-x-1">
                                    <Button
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => {
                                            onAddCard(newCardContent, isAnonymousMode, tagValue);
                                            setNewCardContent('');
                                        }}
                                    >
                                        {isAnonymousMode ? t('board.addAnonymously') : t('common.add')}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => {
                                        onSetActiveColumnId(null);
                                        setNewCardContent('');
                                        setIsAnonymousMode(false);
                                    }}>{t('common.cancel')}</Button>
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
                                    title={t('board.addCardWithName')}
                                >
                                    <Plus className="h-4 w-4" /> {t('board.addCard')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="flex-1 rounded-none h-9"
                                    onClick={() => {
                                        onSetActiveColumnId(column.id);
                                        setIsAnonymousMode(true);
                                    }}
                                    title={t('board.addAnonymousCard')}
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
                        {t('board.noCards')}
                    </div>
                )}

                {cards.map(card => (
                    <React.Fragment key={card.id}>
                        {renderCard(card)}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
