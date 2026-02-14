
import React, { useState, useEffect } from 'react';
import {
    DreamCard,
    FertilizationCard,
    VotingMode,
    VotingPhase,
    UserSettingsEntity
} from '@/lib/persistence-types';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
    HatGlasses,
    Minus,
    Link as LinkIcon,
    Unlink,
    ArrowUpRight,
    Trash2,
    ThumbsUp,
    Plus,
    ChevronDown
} from 'lucide-react';
import { MJ_SCALE } from './constants';

export interface CardViewProps {
    card: DreamCard | FertilizationCard;
    isModerator: boolean;
    currentUserId: string;
    users: UserSettingsEntity[];
    userSettings: { username: string; logo: string }; // Current user settings

    // Board State
    hiddenEdition: boolean;
    votingMode: VotingMode;
    votingPhase: VotingPhase;
    maxPoints?: number;
    userPointsUsed?: number;

    // Interaction State
    isEditing: boolean;
    onEditStart: () => void;
    onEditEnd: () => void;

    // Linking State
    linkingCardId: string | null;
    isLinkedToLinkingCard: boolean; // Is this card linked to the active linking card?
    isDirectlyLinked: boolean; // Is this card directly linked (for styling)

    // Actions
    onUpdateContent: (content: string) => void;
    onUpdateAuthor: (authorId: string | null) => void;
    onDelete: () => void;
    onPromote?: () => void; // Optional as not all cards might be promotable or feature enabled
    onVote: (value: number) => void;
    onToggleLink: () => void;

    // Drag & Drop
    onDragStart: (e: React.DragEvent) => void;
    isDraggable: boolean;

    // Visuals
    tags?: { label: string; color?: string; icon?: React.ReactNode; className?: string }[];
}

export const CardView: React.FC<CardViewProps> = ({
    card,
    isModerator,
    currentUserId,
    users,
    userSettings,
    hiddenEdition,
    votingMode,
    votingPhase,
    maxPoints,
    userPointsUsed = 0,
    isEditing,
    onEditStart,
    onEditEnd,
    linkingCardId,
    isLinkedToLinkingCard,
    isDirectlyLinked,
    onUpdateContent,
    onUpdateAuthor,
    onDelete,
    onPromote,
    onVote,
    onToggleLink,
    onDragStart,
    isDraggable,
    tags = []
}) => {
    // Local state for editing content ensures smooth typing
    const [editContent, setEditContent] = useState(card.content);

    // Sync edit content when card content changes or editing starts
    useEffect(() => {
        setEditContent(card.content);
    }, [card.content, isEditing]);

    const isHiddenFromUser = hiddenEdition && !card.isRevealed && (card.authorId === null || card.authorId !== currentUserId);
    const isLinkingSource = linkingCardId === card.id;
    const hasLinkedCards = (card.linkedCardIds?.length || 0) > 0;

    const handleVote = (delta: number) => {
        if (votingPhase !== 'VOTING') return;
        onVote(delta);
    };

    const getMJMedian = (votes: Record<string, number>) => {
        const values = Object.values(votes).sort((a, b) => a - b);
        if (values.length === 0) return null;
        const midIndex = Math.ceil(values.length / 2) - 1;
        return values[Math.max(0, midIndex)];
    };

    const renderMJDistribution = (votes: Record<string, number>) => {
        const counts: Record<number, number> = {};
        Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
        const total = Object.values(votes).length;
        const medianValue = getMJMedian(votes);

        return (
            <div className="space-y-4 pt-1">
                {/* Legend */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-content-start">
                    {MJ_SCALE.map(grade => (
                        <div key={grade.value} className="flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded ${grade.color} ${grade.value === medianValue ? 'ring-4 ring-gray-900 ring-offset-1 ring-offset-transparent' : ''}`}></div>
                            <span className={`text-[10px] whitespace-nowrap ${grade.value === medianValue ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{grade.label}</span>
                        </div>
                    ))}
                </div>

                {/* Stacked Bar */}
                {total > 0 ? (
                    <div className="h-9 w-full flex rounded-md overflow-hidden ring-1 ring-border/50 shadow-sm relative bg-secondary/20">
                        {MJ_SCALE.map(grade => {
                            const count = counts[grade.value] || 0;
                            if (count === 0) return null;
                            const percent = (count / total) * 100;
                            const isMedian = grade.value === medianValue;
                            return (
                                <div
                                    key={grade.value}
                                    className={`h-full flex items-center justify-center ${grade.color} transition-all hover:brightness-110 relative ${isMedian ? 'ring-inset ring-4 ring-gray-900 z-10' : ''}`}
                                    style={{ width: `${percent}%` }}
                                    title={`${grade.label}: ${count} votes (${percent.toFixed(1)}%) ${isMedian ? '(Median)' : ''}`}
                                >
                                    {percent > 8 && (
                                        <span className={`text-[10px] font-bold px-1 truncate ${[1, 2].includes(grade.value) ? 'text-black/80' : 'text-white/90'}`}>
                                            {percent.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center text-xs text-muted-foreground py-2 italic">No votes cast yet</div>
                )}
            </div>
        );
    };

    const renderUDNeutralDistribution = (votes: Record<string, number>) => {
        const counts: Record<number, number> = {};
        Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
        const total = Object.values(votes).length;
        const medianValue = getMJMedian(votes);

        const scale = [
            { value: -1, label: '-1', color: 'bg-red-500' },
            { value: 0, label: '0', color: 'bg-gray-500' },
            { value: 1, label: '+1', color: 'bg-green-500' }
        ];

        return (
            <div className="space-y-4 pt-1">
                {/* Legend */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-content-start">
                    {scale.map(grade => (
                        <div key={grade.value} className="flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded ${grade.color} ${grade.value === medianValue ? 'ring-4 ring-gray-900 ring-offset-1 ring-offset-transparent' : ''}`}></div>
                            <span className={`text-[10px] whitespace-nowrap ${grade.value === medianValue ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{grade.label}</span>
                        </div>
                    ))}
                </div>

                {/* Stacked Bar */}
                {total > 0 ? (
                    <div className="h-9 w-full flex rounded-md overflow-hidden ring-1 ring-border/50 shadow-sm relative bg-secondary/20">
                        {scale.map(grade => {
                            const count = counts[grade.value] || 0;
                            if (count === 0) return null;
                            const percent = (count / total) * 100;
                            const isMedian = grade.value === medianValue;
                            return (
                                <div
                                    key={grade.value}
                                    className={`h-full flex items-center justify-center ${grade.color} transition-all hover:brightness-110 relative ${isMedian ? 'ring-inset ring-4 ring-gray-900 z-10' : ''}`}
                                    style={{ width: `${percent}%` }}
                                    title={`${grade.label}: ${count} votes (${percent.toFixed(1)}%) ${isMedian ? '(Median)' : ''}`}
                                >
                                    {percent > 8 && (
                                        <span className="text-[10px] font-bold px-1 truncate text-white/90">
                                            {percent.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center text-xs text-muted-foreground py-2 italic">No votes cast yet</div>
                )}
            </div>
        );
    };

    const handleCommitEdit = () => {
        if (editContent.trim() !== card.content) {
            onUpdateContent(editContent.trim());
        }
        onEditEnd();
    };

    return (
        <div
            data-card-id={card.id}
            draggable={isDraggable}
            onDragStart={onDragStart}
            onClick={(e) => {
                if (linkingCardId && card.id !== linkingCardId && !isHiddenFromUser) {
                    onToggleLink();
                }
            }}
            className={`p-3 rounded border bg-card shadow-sm transition-all duration-200 
                ${isHiddenFromUser ? 'blur-sm select-none pointer-events-none' : ''} 
                ${isLinkingSource ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''} 
                ${isLinkedToLinkingCard ? 'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : ''} 
                ${linkingCardId && !isLinkingSource && !isHiddenFromUser ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''}
            `}
        >
            <div className="flex justify-between items-start">
                {isEditing ? (
                    <Input
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onBlur={handleCommitEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitEdit();
                            else if (e.key === 'Escape') onEditEnd();
                        }}
                        className="flex-1 text-sm"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div
                        className={`text-sm whitespace-pre-wrap flex-1 ${!isHiddenFromUser && (card.authorId === currentUserId || (isModerator && !isHiddenFromUser)) ? 'cursor-pointer' : ''}`}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (!isHiddenFromUser && (card.authorId === currentUserId || isModerator)) {
                                onEditStart();
                            }
                        }}
                    >
                        {isHiddenFromUser ? 'Hidden content' : card.content}
                    </div>
                )}

                <div className="flex flex-row gap-1 ml-2 items-center">
                    {/* Author Avatar */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="focus:outline-none">
                            {card.authorId ? (
                                <UserAvatar
                                    username={users.find(u => u.userId === card.authorId)?.username || 'Unknown'}
                                    logo={users.find(u => u.userId === card.authorId)?.logo}
                                    size="sm"
                                    className="h-5 w-5 mr-1 hover:ring-2 hover:ring-ring transition-all"
                                    trigram={(users.find(u => u.userId === card.authorId) as any)?.trigram}
                                />
                            ) : (
                                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground mr-1 hover:bg-muted/80 transition-colors" title="Anonymous">
                                    <HatGlasses className="h-3 w-3" />
                                </div>
                            )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Msg author</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateAuthor(null); }}>
                                <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center mr-2">
                                    <Minus className="h-3 w-3" />
                                </div>
                                Unassigned
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateAuthor(currentUserId); }}>
                                <UserAvatar
                                    username={userSettings.username}
                                    logo={userSettings.logo}
                                    size="sm"
                                    className="h-4 w-4 mr-2"
                                    trigram={(users.find(u => u.userId === currentUserId) as any)?.trigram}
                                />
                                Myself ({userSettings.username})
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {users.filter(u => u.userId !== currentUserId).map(user => (
                                <DropdownMenuItem key={user.userId} onClick={(e) => { e.stopPropagation(); onUpdateAuthor(user.userId); }}>
                                    <UserAvatar
                                        username={user.username}
                                        logo={user.logo}
                                        size="sm"
                                        className="h-4 w-4 mr-2"
                                        trigram={(user as any).trigram}
                                    />
                                    {user.username}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {!isHiddenFromUser && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-4 w-4 ${hasLinkedCards || isLinkingSource || isLinkedToLinkingCard ? 'text-blue-500' : 'text-muted-foreground'} hover:text-blue-600`}
                                onClick={(e) => { e.stopPropagation(); onToggleLink(); }}
                                title={isLinkingSource ? 'Cancel linking' : 'Link cards'}
                            >
                                {isLinkingSource ? <Unlink className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                            </Button>
                            {onPromote && !card.promotedTaskId && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-green-600" onClick={(e) => { e.stopPropagation(); onPromote(); }} title="Promote to backlog">
                                    <ArrowUpRight className="h-3 w-3" />
                                </Button>
                            )}
                            {(card.authorId === currentUserId || isModerator) && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tags */}
            {tags && tags.length > 0 && !isHiddenFromUser && (
                <div className="flex flex-wrap gap-1 mt-2 mb-1">
                    {tags.map((tag, i) => (
                        <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1 ${tag.className || 'bg-secondary text-secondary-foreground'}`}>
                            {tag.icon}
                            {tag.label}
                        </span>
                    ))}
                </div>
            )}

            {/* Voting UI */}
            {!isHiddenFromUser && votingPhase !== 'IDLE' && (
                <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                    {votingMode === 'THUMBS_UP' && (
                        <Button
                            variant={card.votes[currentUserId] === 1 ? 'default' : 'outline'}
                            size="sm"
                            className="w-full h-8"
                            onClick={(e) => { e.stopPropagation(); handleVote(1); }}
                            disabled={votingPhase !== 'VOTING'}
                        >
                            <ThumbsUp className="h-3 w-3 mr-2" />
                            {votingPhase === 'REVEALED'
                                ? Object.values(card.votes).filter(v => v === 1).length
                                : (card.votes[currentUserId] === 1 ? 1 : "")}
                        </Button>
                    )}
                    {votingMode === 'THUMBS_UD_NEUTRAL' && (
                        <>
                            <div className="flex justify-between gap-1">
                                <Button
                                    variant={card.votes[currentUserId] === 1 ? 'default' : 'outline'}
                                    size="sm"
                                    className={`flex-1 h-8 ${card.votes[currentUserId] === 1
                                        ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                                        : 'text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/30'
                                        }`}
                                    onClick={(e) => { e.stopPropagation(); handleVote(1); }}
                                    disabled={votingPhase !== 'VOTING'}
                                >
                                    +1
                                </Button>
                                <Button
                                    variant={card.votes[currentUserId] === 0 ? 'default' : 'outline'}
                                    size="sm"
                                    className={`flex-1 h-8 ${card.votes[currentUserId] === 0
                                        ? 'bg-gray-500 hover:bg-gray-600 text-white border-gray-500'
                                        : 'text-gray-500 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/30'
                                        }`}
                                    onClick={(e) => { e.stopPropagation(); handleVote(0); }}
                                    disabled={votingPhase !== 'VOTING'}
                                >
                                    0
                                </Button>
                                <Button
                                    variant={card.votes[currentUserId] === -1 ? 'default' : 'outline'}
                                    size="sm"
                                    className={`flex-1 h-8 ${card.votes[currentUserId] === -1
                                        ? 'bg-red-500 hover:bg-red-600 text-white border-red-500'
                                        : 'text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30'
                                        }`}
                                    onClick={(e) => { e.stopPropagation(); handleVote(-1); }}
                                    disabled={votingPhase !== 'VOTING'}
                                >
                                    -1
                                </Button>
                            </div>
                            {(votingPhase === 'REVEALED' || isModerator) && (
                                <HoverCard>
                                    <HoverCardTrigger asChild>
                                        <div className="pt-2 cursor-help text-center">
                                            {(() => {
                                                const median = getMJMedian(card.votes);
                                                if (median === null) return <span className="text-xs text-muted-foreground">No votes</span>;
                                                const label = median > 0 ? '+1' : (median < 0 ? '-1' : '0');
                                                const color = median > 0 ? 'text-green-600' : (median < 0 ? 'text-red-600' : 'text-gray-600');
                                                return <span className={`text-xs font-bold ${color}`}>Median: {label} <span className="text-muted-foreground font-normal">({Object.keys(card.votes).length} votes)</span></span>
                                            })()}
                                        </div>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-80">
                                        {renderUDNeutralDistribution(card.votes)}
                                    </HoverCardContent>
                                </HoverCard>
                            )}
                        </>
                    )}
                    {votingMode === 'POINTS' && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleVote(-1); }} disabled={votingPhase !== 'VOTING'}><Minus className="h-3 w-3" /></Button>
                                <span className="text-sm font-bold w-6 text-center">{card.votes[currentUserId] || 0}</span>
                                <Button variant="outline" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleVote(1); }} disabled={votingPhase !== 'VOTING'}><Plus className="h-3 w-3" /></Button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Unspent: {(maxPoints || 10) - (userPointsUsed || 0)} pts
                            </div>
                        </div>
                    )}
                    {votingMode === 'MAJORITY_JUDGMENT' && (
                        <HoverCard open={votingPhase === 'REVEALED' ? undefined : false}>
                            <HoverCardTrigger asChild>
                                <div className="w-full">
                                    {(votingPhase === 'REVEALED') ? (
                                        <div className={`
                                            flex items-center justify-center gap-2 p-1.5 rounded-md text-sm font-medium border
                                            ${(() => {
                                                const median = getMJMedian(card.votes);
                                                const grade = MJ_SCALE.find(g => g.value === median);
                                                return grade ? grade.color : 'bg-muted';
                                            })()}
                                            ${(() => {
                                                const median = getMJMedian(card.votes);
                                                return [1, 2].includes(median || 0) ? 'text-black' : 'text-white';
                                            })()}
                                        `}>
                                            {(() => {
                                                const median = getMJMedian(card.votes);
                                                const grade = MJ_SCALE.find(g => g.value === median);
                                                return grade ? (
                                                    <>
                                                        {grade.icon}
                                                        {grade.label}
                                                    </>
                                                ) : 'No Votes';
                                            })()}
                                            <span className="opacity-80 text-xs ml-1">({Object.keys(card.votes).length})</span>
                                        </div>
                                    ) : (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-full justify-between" disabled={votingPhase !== 'VOTING'}>
                                                    <div className="flex items-center gap-2">
                                                        {card.votes[currentUserId] !== undefined ? (
                                                            <>
                                                                {MJ_SCALE.find(g => g.value === card.votes[currentUserId])?.icon}
                                                                {MJ_SCALE.find(g => g.value === card.votes[currentUserId])?.label}
                                                            </>
                                                        ) : (
                                                            <span className="text-muted-foreground">Evaluate...</span>
                                                        )}
                                                    </div>
                                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[200px]">
                                                <DropdownMenuLabel>Select Grade</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {MJ_SCALE.map(grade => (
                                                    <DropdownMenuItem
                                                        key={grade.value}
                                                        onClick={(e) => { e.stopPropagation(); handleVote(grade.value); }}
                                                        className="flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className={`flex items-center justify-center w-5 h-5 rounded ${grade.color} text-[10px]`}>
                                                            {grade.icon}
                                                        </span>
                                                        <span>{grade.label}</span>
                                                        {card.votes[currentUserId] === grade.value && (
                                                            <ThumbsUp className="h-3 w-3 ml-auto" />
                                                        )}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            </HoverCardTrigger>
                            {(votingPhase === 'REVEALED' || isModerator) && (
                                <HoverCardContent className="w-80">
                                    {renderMJDistribution(card.votes)}
                                </HoverCardContent>
                            )}
                        </HoverCard>
                    )}
                </div>
            )}
        </div>
    );
};
