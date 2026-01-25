import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { FertilizationBoardEntity, FertilizationCard, FertilizationColumn } from '@/lib/persistence-types';
import { usePersistence } from '@/hooks/usePersistence';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Eye, EyeOff, Play, RotateCcw, Plus, Trash2, ThumbsUp, HatGlasses, Minus, Clock, Square, Search, X, ChevronDown, ChevronRight, ChevronUp, Info, Link, Unlink, ArrowUpRight } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks'; // For converting to tasks
import { UserSelector } from './UserSelector';
import { UserFilterSelector } from './UserFilterSelector';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { aStarTextSearch } from '@/lib/a-star-search';

// Voting Constants
type VotingMode = 'THUMBS_UP' | 'THUMBS_UD_NEUTRAL' | 'POINTS' | 'MAJORITY_JUDGMENT';
type VotingPhase = 'IDLE' | 'VOTING' | 'REVEALED';

const MJ_SCALE = [
    { value: -1, label: 'Reject', color: 'bg-red-600', hoverColor: 'hover:bg-red-700', icon: '⛔' },
    { value: 0, label: 'Insufficient', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-600', icon: '👎' },
    { value: 1, label: 'Passable', color: 'bg-yellow-400', hoverColor: 'hover:bg-yellow-500', icon: '😐' },
    { value: 2, label: 'Acceptable', color: 'bg-lime-500', hoverColor: 'hover:bg-lime-600', icon: '🙂' },
    { value: 3, label: 'Good', color: 'bg-green-600', hoverColor: 'hover:bg-green-700', icon: '👍' },
    { value: 4, label: 'Excellent', color: 'bg-green-900', hoverColor: 'hover:bg-green-950', icon: '🌟' },
];

// Default columns
const DEFAULT_COLUMNS: FertilizationColumn[] = [
    { id: 'facts', title: 'Facts', color: '#FFFFFF', isLocked: false },
    { id: 'satisfactions', title: 'Satisfactions', color: '#FACC15', isLocked: true },
    { id: 'discomfort', title: 'Discomfort', color: '#030303', isLocked: true },
    { id: 'levers', title: 'Levers', color: '#4ADE80', isLocked: true },
    { id: 'priorities', title: 'Priorities', color: '#60A5FA', isLocked: true },
];

interface FertilizationViewProps {
    onClose?: () => void;
}

// Imports for collaboration
import { doc, isCollaborationEnabled, initializeCollaboration, yFertilizationState, yFertilizationCards, yFertilizationColumns } from '@/lib/collaboration';
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";

export const FertilizationView: React.FC<FertilizationViewProps> = ({ onClose }) => {
    const persistence = usePersistence();
    const { userId: currentUserId, userSettings } = useUserSettings();
    const username = userSettings.username;
    const { createTask } = useTasks();

    const [boardState, setBoardState] = useState<FertilizationBoardEntity | null>(null);
    const [loading, setLoading] = useState(true);
    const [newCardContent, setNewCardContent] = useState('');
    const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
    const [isAnonymousMode, setIsAnonymousMode] = useState(false);

    // Filter state
    const [filterSearchText, setFilterSearchText] = useState('');
    const [filterUserId, setFilterUserId] = useState<string | null>(null);
    const [filterColumns, setFilterColumns] = useState<string[]>([]);
    const [filterMinLikes, setFilterMinLikes] = useState(0);
    const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);

    // Points Voting State
    const [pointsConfigOpen, setPointsConfigOpen] = useState(false);
    const [pointsConfigValue, setPointsConfigValue] = useState(10);

    // Linking mode state
    const [linkingCardId, setLinkingCardId] = useState<string | null>(null);

    // Sort state for each column
    const [columnSortOrder, setColumnSortOrder] = useState<Record<string, 'none' | 'asc' | 'desc'>>({});

    // Constants for filter
    const ALL_USERS_VALUE = 'ALL_USERS';
    const UNASSIGNED_VALUE = 'UNASSIGNED';

    // Check if any filter is active
    const hasActiveFilters = filterSearchText.trim() !== '' ||
        filterUserId !== null ||
        filterColumns.length > 0 ||
        filterMinLikes > 0;

    // Clear all filters
    const clearFilters = () => {
        setFilterSearchText('');
        setFilterUserId(null);
        setFilterColumns([]);
        setFilterMinLikes(0);
    };

    // Filter cards based on current filters
    const filteredCards = useMemo(() => {
        if (!boardState) return [];

        let cards = [...boardState.cards];

        // Apply column filter
        if (filterColumns.length > 0) {
            cards = cards.filter(card => filterColumns.includes(card.columnId));
        }

        // Apply user filter
        if (filterUserId !== null) {
            if (filterUserId === UNASSIGNED_VALUE) {
                // Unassigned means authorId is null or empty string
                cards = cards.filter(card => card.authorId === null || card.authorId === '');
            } else {
                cards = cards.filter(card => card.authorId === filterUserId);
            }
        }

        // Apply minimum likes filter
        if (filterMinLikes > 0) {
            // Count "likes" (votes > 0)
            cards = cards.filter(card => {
                const positiveVotes = Object.values(card.votes || {}).filter(v => v > 0).length;
                return positiveVotes >= filterMinLikes;
            });
        }

        // Apply search filter with A* algorithm
        if (filterSearchText.trim()) {
            const searchResults = aStarTextSearch(
                filterSearchText,
                cards.map(card => ({ id: card.id, title: card.content }))
            );
            const matchingIds = new Set(searchResults.map(r => r.taskId));
            cards = cards.filter(card => matchingIds.has(card.id));
        }

        return cards;
    }, [boardState?.cards, filterSearchText, filterUserId, filterColumns, filterMinLikes]);

    // Initialize collaboration
    useEffect(() => {
        if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
            initializeCollaboration();
        }
    }, [PERSISTENCE_CONFIG.FORCE_BROWSER]);

    // Sync state to Yjs
    const syncBoardToYjs = useCallback((state: FertilizationBoardEntity) => {
        if (!isCollaborationEnabled()) return;

        doc.transact(() => {
            // Sync State
            yFertilizationState.set('moderatorId', state.moderatorId);
            yFertilizationState.set('isSessionActive', state.isSessionActive);
            yFertilizationState.set('timer', state.timer);
            yFertilizationState.set('hiddenEdition', state.hiddenEdition);
            yFertilizationState.set('votingMode', state.votingMode);
            yFertilizationState.set('votingPhase', state.votingPhase);

            // Sync Columns
            state.columns.forEach(col => {
                yFertilizationColumns.set(col.id, col);
            });

            // Sync Cards
            const currentYCardIds = Array.from(yFertilizationCards.keys());
            const newCardIds = state.cards.map(c => c.id);

            // Remove deleted cards
            currentYCardIds.forEach(id => {
                if (!newCardIds.includes(id as string)) {
                    yFertilizationCards.delete(id as string);
                }
            });

            // Add/Update cards
            state.cards.forEach(card => {
                const existingCard = yFertilizationCards.get(card.id) as FertilizationCard;
                // Only update if changed to avoid unnecessary re-renders/traffic
                // Simple equality check for now, can be optimized
                if (!existingCard || JSON.stringify(existingCard) !== JSON.stringify(card)) {
                    yFertilizationCards.set(card.id, card);
                }
            });
        });
    }, []);

    // Observer for Yjs updates
    useEffect(() => {
        if (!isCollaborationEnabled()) return;

        const observer = () => {
            // Reconstruct state from Yjs
            const moderatorId = yFertilizationState.get('moderatorId') as string | null;
            const isSessionActive = yFertilizationState.get('isSessionActive') as boolean;
            const timer = yFertilizationState.get('timer') as any;
            const hiddenEdition = yFertilizationState.get('hiddenEdition') as boolean;
            const votingMode = (yFertilizationState.get('votingMode') as VotingMode) || 'THUMBS_UP';
            const votingPhase = (yFertilizationState.get('votingPhase') as VotingPhase) || 'IDLE';

            const columns = Array.from(yFertilizationColumns.values()) as FertilizationColumn[];
            // Sort columns to ensure consistent order (optional but good practice)
            // We can rely on DEFAULT_COLUMNS order
            const sortedColumns = DEFAULT_COLUMNS.map(defCol =>
                columns.find(c => c.id === defCol.id) || defCol
            );

            const cards = Array.from(yFertilizationCards.values()) as FertilizationCard[];

            // Only update if we have complete data? 
            // Yjs might be empty initially.
            if (columns.length > 0) {
                const newState: FertilizationBoardEntity = {
                    moderatorId: moderatorId ?? null,
                    isSessionActive: isSessionActive ?? false,
                    timer: timer ?? null,
                    hiddenEdition: hiddenEdition ?? true,
                    votingMode,
                    votingPhase,
                    columns: sortedColumns,
                    cards: cards
                };
                setBoardState(newState);
            }
        };

        yFertilizationState.observe(observer);
        yFertilizationCards.observe(observer);
        yFertilizationColumns.observe(observer);

        return () => {
            yFertilizationState.unobserve(observer);
            yFertilizationCards.unobserve(observer);
            yFertilizationColumns.unobserve(observer);
        };
    }, []);

    // Load board state (Initial load)
    useEffect(() => {
        const loadBoard = async () => {
            try {
                // Check if Yjs has data
                if (isCollaborationEnabled() && yFertilizationColumns.size > 0) {
                    // Initial load from Yjs will be handled by observer or we can do it here manually
                    // The observer runs immediately? No, only on change. 
                    // So we should manually set state from Yjs if it exists.
                    const moderatorId = yFertilizationState.get('moderatorId') as string | null;
                    const isSessionActive = yFertilizationState.get('isSessionActive') as boolean;
                    const timer = yFertilizationState.get('timer') as any;
                    const hiddenEdition = yFertilizationState.get('hiddenEdition') as boolean;
                    const votingMode = (yFertilizationState.get('votingMode') as VotingMode) || 'THUMBS_UP';
                    const votingPhase = (yFertilizationState.get('votingPhase') as VotingPhase) || 'IDLE';
                    const columns = Array.from(yFertilizationColumns.values()) as FertilizationColumn[];
                    const sortedColumns = DEFAULT_COLUMNS.map(defCol =>
                        columns.find(c => c.id === defCol.id) || defCol
                    );
                    const cards = Array.from(yFertilizationCards.values()) as FertilizationCard[];

                    if (columns.length > 0) {
                        setBoardState({
                            moderatorId: moderatorId ?? null,
                            isSessionActive: isSessionActive ?? false,
                            timer: timer ?? null,
                            hiddenEdition: hiddenEdition ?? true,
                            votingMode,
                            votingPhase,
                            columns: sortedColumns,
                            cards: cards
                        });
                        setLoading(false);
                        return;
                    }
                }

                let state = await persistence.getFertilizationBoardState();
                if (!state) {
                    // Initialize new board
                    state = {
                        moderatorId: null, // Will be set when session starts
                        isSessionActive: false,
                        columns: DEFAULT_COLUMNS,
                        cards: [],
                        timer: null,
                        hiddenEdition: true,
                        votingMode: 'THUMBS_UP',
                        votingPhase: 'IDLE',
                    };
                    await persistence.updateFertilizationBoardState(state);
                }
                setBoardState(state);

                // Populate Yjs if it's empty
                if (isCollaborationEnabled() && yFertilizationColumns.size === 0) {
                    syncBoardToYjs(state);
                }

            } catch (error) {
                console.error('Error loading fertilization board:', error);
            } finally {
                setLoading(false);
            }
        };
        loadBoard();
    }, [persistence, syncBoardToYjs]);

    // Save board state helper
    const saveBoard = async (newState: FertilizationBoardEntity) => {
        setBoardState(newState);
        syncBoardToYjs(newState);
        await persistence.updateFertilizationBoardState(newState);
    };

    const startSession = async () => {
        if (!boardState) return;
        const newState = {
            ...boardState,
            isSessionActive: true,
            moderatorId: currentUserId,
        };
        await saveBoard(newState);
    };

    const restartSession = async () => {
        if (!boardState) return;
        if (!confirm('Are you sure you want to restart the session? This will clear all cards.')) return;

        const newState: FertilizationBoardEntity = {
            ...boardState,
            isSessionActive: false,
            moderatorId: null,
            cards: [],
            columns: DEFAULT_COLUMNS, // Reset locks
            timer: null,
            hiddenEdition: true,
            votingMode: 'THUMBS_UP',
            votingPhase: 'IDLE',
        };
        await saveBoard(newState);
    };

    const becomeModerator = async () => {
        if (!boardState) return;
        if (!confirm('⚠️ Warning: You are about to take over as moderator.\n\nThis should only be done if the current moderator has left the session or is unavailable.\n\nAre you sure you want to become the moderator?')) return;

        const newState = {
            ...boardState,
            moderatorId: currentUserId,
        };
        await saveBoard(newState);
    };

    const isModerator = boardState?.moderatorId === currentUserId;

    const toggleLock = async (columnId: string) => {
        if (!boardState || !isModerator) return;

        // Logic: "By default all other columns than facts should be locked unless the moderator unlock consecutive columns"
        // Also: "Only the first column is unlock at fresh session but once the group goes to the other column it should still be possible for the moderator to lock the first one"

        const newColumns = boardState.columns.map(col => {
            if (col.id === columnId) {
                return { ...col, isLocked: !col.isLocked };
            }
            return col;
        });

        await saveBoard({ ...boardState, columns: newColumns });
    };

    const toggleHiddenEdition = async () => {
        if (!boardState || !isModerator) return;
        await saveBoard({ ...boardState, hiddenEdition: !boardState.hiddenEdition });
    };

    const addCard = async (columnId: string, anonymous: boolean = false) => {
        if (!boardState || !newCardContent.trim()) return;

        const newCard: FertilizationCard = {
            id: crypto.randomUUID(),
            columnId,
            content: newCardContent,
            authorId: anonymous ? null : currentUserId,
            votes: {},
            isRevealed: !boardState.hiddenEdition,
        };

        await saveBoard({
            ...boardState,
            cards: [...boardState.cards, newCard],
        });
        setNewCardContent('');
        setActiveColumnId(null);
    };

    const deleteCard = async (cardId: string) => {
        if (!boardState) return;
        await saveBoard({
            ...boardState,
            cards: boardState.cards.filter(c => c.id !== cardId),
        });
    };

    // State for editing column titles
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [editingColumnTitle, setEditingColumnTitle] = useState('');

    const updateColumnTitle = async (columnId: string, title: string) => {
        if (!boardState || !isModerator) return;
        const newColumns = boardState.columns.map(c => {
            if (c.id === columnId) {
                return { ...c, title };
            }
            return c;
        });
        await saveBoard({ ...boardState, columns: newColumns });
    };

    const updateCardAuthor = async (cardId: string, authorId: string | null) => {
        if (!boardState) return;
        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                return { ...c, authorId };
            }
            return c;
        });
        await saveBoard({ ...boardState, cards: newCards });
    };

    const updateCardContent = async (cardId: string, content: string) => {
        if (!boardState) return;
        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                return { ...c, content };
            }
            return c;
        });
        await saveBoard({ ...boardState, cards: newCards });
    };

    // State for editing cards
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editingCardContent, setEditingCardContent] = useState('');

    // Toggle link between two cards (bidirectional)
    const toggleLinkCards = async (cardId1: string, cardId2: string) => {
        if (!boardState || cardId1 === cardId2) return;

        const card1 = boardState.cards.find(c => c.id === cardId1);
        const card2 = boardState.cards.find(c => c.id === cardId2);
        if (!card1 || !card2) return;

        const card1Links = card1.linkedCardIds || [];
        const card2Links = card2.linkedCardIds || [];
        const isLinked = card1Links.includes(cardId2);

        const newCards = boardState.cards.map(c => {
            if (c.id === cardId1) {
                return {
                    ...c,
                    linkedCardIds: isLinked
                        ? card1Links.filter(id => id !== cardId2)
                        : [...card1Links, cardId2]
                };
            }
            if (c.id === cardId2) {
                return {
                    ...c,
                    linkedCardIds: isLinked
                        ? card2Links.filter(id => id !== cardId1)
                        : [...card2Links, cardId1]
                };
            }
            return c;
        });

        await saveBoard({ ...boardState, cards: newCards });
    };

    // Get all cards linked to a given card (including transitive links)
    const getLinkedCardIds = (cardId: string): Set<string> => {
        if (!boardState) return new Set();
        const visited = new Set<string>();
        const toVisit = [cardId];

        while (toVisit.length > 0) {
            const currentId = toVisit.pop()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            const card = boardState.cards.find(c => c.id === currentId);
            if (card?.linkedCardIds) {
                for (const linkedId of card.linkedCardIds) {
                    if (!visited.has(linkedId)) {
                        toVisit.push(linkedId);
                    }
                }
            }
        }

        visited.delete(cardId); // Don't include the card itself
        return visited;
    };

    // Promote a fertilization card to a task in the backlog
    const promoteToBacklog = async (cardId: string) => {
        if (!boardState) return;

        const card = boardState.cards.find(c => c.id === cardId);
        if (!card) return;

        // Create a task with Backlog status
        const newTaskId = await createTask(card.content, null, currentUserId);

        // Update the card to store the promoted task ID
        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                return { ...c, promotedTaskId: newTaskId };
            }
            return c;
        });

        await saveBoard({ ...boardState, cards: newCards });
    };

    // Calculate total votes for a card based on voting mode
    const calculateCardVoteScore = (card: FertilizationCard): number => {
        if (!boardState) return 0;
        const votes = card.votes || {};
        const values = Object.values(votes);
        if (values.length === 0) return 0;

        switch (boardState.votingMode) {
            case 'THUMBS_UP':
                return values.filter(v => v === 1).length;
            case 'THUMBS_UD_NEUTRAL':
                return values.reduce((acc, v) => acc + v, 0);
            case 'POINTS':
                return values.reduce((acc, v) => acc + v, 0);
            case 'MAJORITY_JUDGMENT': {
                // Use median for MJ
                const sorted = [...values].sort((a, b) => a - b);
                const midIndex = Math.ceil(sorted.length / 2) - 1;
                return sorted[Math.max(0, midIndex)];
            }
            default:
                return 0;
        }
    };

    // Toggle sort order for a column
    const toggleColumnSort = (columnId: string) => {
        setColumnSortOrder(prev => {
            const currentOrder = prev[columnId] || 'none';
            const nextOrder = currentOrder === 'none' ? 'desc' : currentOrder === 'desc' ? 'asc' : 'none';
            return { ...prev, [columnId]: nextOrder };
        });
    };

    const voteCard = async (cardId: string, value: number) => {
        if (!boardState) return;

        // Ensure voting is open
        if (boardState.votingPhase !== 'VOTING') return;

        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                const currentVote = c.votes[currentUserId];
                const newVotes = { ...c.votes };

                // Toggle behavior for Thumbs Up and Up/Down (if same value selected)
                // For MJ, no toggle, just selection
                if (boardState.votingMode !== 'MAJORITY_JUDGMENT' && currentVote === value) {
                    delete newVotes[currentUserId];
                } else {
                    newVotes[currentUserId] = value;
                }

                return { ...c, votes: newVotes };
            }
            return c;
        });
        await saveBoard({ ...boardState, cards: newCards });
    };

    // Calculate MJ Median Grade
    const getMJMedian = (votes: Record<string, number>) => {
        const values = Object.values(votes).sort((a, b) => a - b);
        if (values.length === 0) return null;

        // Majority Judgment Median calculation:
        // If odd number of votes (2n+1), median is at index n.
        // If even number of votes (2n), median is at index n-1 (lower median).
        // e.g., 4 votes: indices 0, 1, 2, 3. Median is index 1.
        // e.g., 5 votes: indices 0, 1, 2, 3, 4. Median is index 2.

        const midIndex = Math.ceil(values.length / 2) - 1;
        return values[Math.max(0, midIndex)];
    };

    // Helper to render MJ Distribution
    const renderMJDistribution = (votes: Record<string, number>) => {
        const totalVotes = Object.keys(votes).length;
        if (totalVotes === 0) return <div className="text-sm text-muted-foreground p-2">No votes cast yet.</div>;

        const medianValue = getMJMedian(votes);

        // Calculate distribution
        const distribution = MJ_SCALE.map(grade => {
            const count = Object.values(votes).filter(v => v === grade.value).length;
            const percentage = (count / totalVotes) * 100;
            return {
                ...grade,
                count,
                percentage
            };
        });

        return (
            <div className="flex flex-col gap-3 min-w-[300px]">
                {/* Legend */}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground mb-1">
                    {MJ_SCALE.map(grade => (
                        <div key={grade.value} className="flex items-center gap-1">
                            <div className={`w-3 h-3 rounded ${grade.color}`}></div>
                            <span>{grade.label}</span>
                        </div>
                    ))}
                </div>

                {/* Stacked Bar */}
                <div className="relative w-full h-8 flex rounded-md shadow-sm bg-gray-100">
                    {(() => {
                        const visibleSegments = distribution.filter(d => d.count > 0);
                        return visibleSegments.map((item, index) => {
                            const isMedian = item.value === medianValue;
                            const isFirst = index === 0;
                            const isLast = index === visibleSegments.length - 1;

                            return (
                                <div
                                    key={item.value}
                                    className={`h-full flex items-center justify-center relative ${item.color} 
                                        ${isFirst ? 'rounded-l-md' : ''} 
                                        ${isLast ? 'rounded-r-md' : ''} 
                                        ${isMedian ? 'ring-2 ring-white z-20 shadow-lg scale-y-125 mx-0.5 rounded-sm origin-center' : ''}
                                    `}
                                    style={{
                                        width: `${item.percentage}%`,
                                        /* If median, we want it to visually pop out, so we might need slightly more width or just margin? 
                                           The margin mx-0.5 adds space around it, which might shift things. 
                                           Let's stick to scale-y for vertical pop and ring for border. 
                                           The ring will be visible now that overflow is not hidden. */
                                    }}
                                    title={`${item.label}: ${item.count} votes (${item.percentage.toFixed(1)}%)`}
                                >
                                    {item.percentage >= 10 && (
                                        <span className={`text-[10px] font-bold ${[1, 2].includes(item.value) ? 'text-black' : 'text-white'} drop-shadow-md`}>
                                            {item.percentage.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>
        );
    };

    const handleDragStart = (e: React.DragEvent, cardId: string) => {
        e.dataTransfer.setData('cardId', cardId);
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('cardId');
        if (!boardState || !cardId) return;

        const card = boardState.cards.find(c => c.id === cardId);
        if (!card) return;

        if (card.columnId === targetColumnId) return;

        // If moving to Priorities, create a task
        if (targetColumnId === 'priorities') {
            // "transform it as standard top parent card"
            // We'll create a task and remove the card from the board? 
            // Or keep it in priorities column?
            // The requirement says: "unless they are put in the last column Priorities, then treat the element put in this column and transform it as standard top parent card."
            // This implies it becomes a task.

            createTask(card.content, null, currentUserId);

            // Remove from fertilization board or keep it?
            // Usually in retro tools, items in "Action Items" (Priorities) are kept there for reference.
            // But if it's transformed into a task, maybe we should just update the columnId.
            // Let's just update the columnId for now, so it shows in the Priorities column.
        }

        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                return { ...c, columnId: targetColumnId };
            }
            return c;
        });

        await saveBoard({ ...boardState, cards: newCards });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const [isTimerDialogOpen, setIsTimerDialogOpen] = useState(false);
    const [timerMinutes, setTimerMinutes] = useState(5);
    const [timerSeconds, setTimerSeconds] = useState(0);

    const startTimerWithDuration = async () => {
        if (!boardState || !isModerator) return;
        const totalSeconds = timerMinutes * 60 + timerSeconds;
        if (totalSeconds <= 0 || totalSeconds > 3600) return; // Max 1 hour

        await saveBoard({
            ...boardState,
            timer: {
                isRunning: true,
                startTime: Date.now(),
                duration: totalSeconds,
            },
        });
        setIsTimerDialogOpen(false);
    };

    const stopTimer = async () => {
        if (!boardState || !isModerator) return;
        await saveBoard({
            ...boardState,
            timer: {
                ...boardState.timer!,
                isRunning: false,
            },
        });
    };

    const [timeLeft, setTimeLeft] = useState<number>(0);

    useEffect(() => {
        if (!boardState?.timer) {
            setTimeLeft(0);
            return;
        }

        if (!boardState.timer.isRunning) {
            // Show the set duration when not running
            setTimeLeft(boardState.timer.duration || 0);
            return;
        }

        // Timer is running - calculate remaining time
        const calculateRemaining = () => {
            const elapsed = Math.floor((Date.now() - boardState.timer!.startTime!) / 1000);
            const remaining = Math.max(0, boardState.timer!.duration - elapsed);
            return remaining;
        };

        setTimeLeft(calculateRemaining());

        const interval = setInterval(async () => {
            const remaining = calculateRemaining();
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                // Auto-lock all columns when timer ends (only moderator executes this)
                if (isModerator && boardState.timer?.isRunning) {
                    const lockedColumns = boardState.columns.map(col => ({ ...col, isLocked: true }));
                    await saveBoard({
                        ...boardState,
                        columns: lockedColumns,
                        timer: {
                            ...boardState.timer,
                            isRunning: false,
                        },
                    });
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [boardState?.timer]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const adjustMinutes = (delta: number) => {
        setTimerMinutes(m => Math.min(60, Math.max(0, m + delta)));
    };

    const adjustSeconds = (delta: number) => {
        setTimerSeconds(s => {
            const newVal = s + delta;
            if (newVal < 0) return 50;
            if (newVal >= 60) return 0;
            return newVal;
        });
    };

    if (loading) return <div>Loading...</div>;

    const handleStartVoting = () => {
        if (boardState?.votingMode === 'POINTS' && boardState.votingPhase === 'IDLE') {
            setPointsConfigOpen(true);
        } else {
            saveBoard({ ...boardState!, votingPhase: 'VOTING' });
        }
    };

    const confirmPointsConfig = async () => {
        if (!boardState) return;
        await saveBoard({
            ...boardState,
            votingPhase: 'VOTING',
            maxPointsPerUser: pointsConfigValue
        });
        setPointsConfigOpen(false);
    };

    const calculateUserUsedPoints = (userId: string) => {
        if (!boardState) return 0;
        return boardState.cards.reduce((acc, card) => {
            return acc + (card.votes[userId] || 0);
        }, 0);
    };

    const votePoints = async (cardId: string, delta: number) => {
        if (!boardState || boardState.votingMode !== 'POINTS') return;

        const maxPoints = boardState.maxPointsPerUser || 10;
        const usedPoints = calculateUserUsedPoints(currentUserId);
        const card = boardState.cards.find(c => c.id === cardId);
        if (!card) return;

        const currentCardPoints = card.votes[currentUserId] || 0;
        const newCardPoints = currentCardPoints + delta;

        // Validation
        if (newCardPoints < 0) return; // Cannot be negative
        if (usedPoints - currentCardPoints + newCardPoints > maxPoints) return; // Cannot exceed budget

        const newVotes = { ...card.votes };
        if (newCardPoints === 0) {
            delete newVotes[currentUserId];
        } else {
            newVotes[currentUserId] = newCardPoints;
        }

        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                return { ...c, votes: newVotes };
            }
            return c;
        });

        await saveBoard({ ...boardState, cards: newCards });
    };

    if (!boardState?.isSessionActive) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <h2 className="text-2xl font-bold">Fertilization Board</h2>
                <p className="text-muted-foreground">No moderator active. Start a session to become the moderator.</p>
                <Button onClick={startSession}>Start Session</Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4 p-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    Fertilization Board
                    {boardState?.votingMode === 'POINTS' && boardState.votingPhase === 'VOTING' && (
                        <div className="text-sm font-normal px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-primary">
                            Budget: <span className="font-bold">{calculateUserUsedPoints(currentUserId)}</span> / {boardState.maxPointsPerUser || 10} pts
                        </div>
                    )}
                </h2>
                <div className="flex items-center space-x-2">
                    {/* Always show timer countdown */}
                    <div className={`text-xl font-mono font-bold mr-4 ${boardState.timer?.isRunning && timeLeft <= 10 ? 'text-red-500 animate-pulse' : ''}`}>
                        {formatTime(timeLeft)}
                    </div>
                    {isModerator && (
                        <>
                            {boardState.timer?.isRunning ? (
                                <Button variant="outline" size="sm" onClick={stopTimer}>
                                    <Square className="mr-2 h-4 w-4" />
                                    Stop Timer
                                </Button>
                            ) : (
                                <Dialog open={isTimerDialogOpen} onOpenChange={setIsTimerDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <Clock className="mr-2 h-4 w-4" />
                                            Set Timer
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>Start/Stop Timer</DialogTitle>
                                            <DialogDescription>
                                                Adjust minutes and seconds using the + and - controls, or the Up and Down arrows on keyboard. Max allowed is 1 hour.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="flex justify-center gap-4 py-4">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm text-muted-foreground mb-2">Minutes</span>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={60}
                                                        value={timerMinutes}
                                                        onChange={(e) => setTimerMinutes(Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))}
                                                        className="w-16 text-center"
                                                    />
                                                    <div className="flex flex-col">
                                                        <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => adjustMinutes(-1)}>
                                                            <Minus className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="secondary" size="icon" className="h-6 w-6 mt-1" onClick={() => adjustMinutes(1)}>
                                                            <Plus className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm text-muted-foreground mb-2">Seconds</span>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={59}
                                                        value={timerSeconds}
                                                        onChange={(e) => setTimerSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                                        className="w-16 text-center"
                                                    />
                                                    <div className="flex flex-col">
                                                        <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => adjustSeconds(-10)}>
                                                            <Minus className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="secondary" size="icon" className="h-6 w-6 mt-1" onClick={() => adjustSeconds(10)}>
                                                            <Plus className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <Button onClick={startTimerWithDuration} className="w-full">
                                            Start
                                        </Button>
                                    </DialogContent>
                                </Dialog>
                            )}
                            <Button variant="outline" size="sm" onClick={toggleHiddenEdition}>
                                {boardState.hiddenEdition ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                {boardState.hiddenEdition ? 'Hidden Mode' : 'Visible Mode'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={restartSession}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Restart Session
                            </Button>
                        </>
                    )}

                    {!isModerator && boardState.isSessionActive && (
                        <div className="flex items-center gap-2 border-l pl-4 ml-2">
                            <div className="px-3 py-1 bg-muted rounded-full text-xs font-semibold">
                                {boardState.votingPhase === 'VOTING' && <span className="text-green-600 flex items-center gap-1"><Play className="h-3 w-3" /> Voting Open</span>}
                                {boardState.votingPhase === 'IDLE' && <span className="text-muted-foreground">Voting Closed</span>}
                                {boardState.votingPhase === 'REVEALED' && <span className="text-blue-600 flex items-center gap-1"><Eye className="h-3 w-3" /> Results Revealed</span>}
                            </div>
                        </div>
                    )}
                    {!isModerator && boardState.isSessionActive && (
                        <Button variant="outline" size="sm" onClick={becomeModerator}>
                            Become Moderator
                        </Button>
                    )}
                </div>
            </div>

            {/* Voting Controls - Second Line */}
            {isModerator && (
                <div className="flex items-center gap-2 self-end">
                    <span className="text-sm font-medium mr-1">Voting:</span>
                    <Select
                        value={boardState.votingMode}
                        onValueChange={(val: VotingMode) => saveBoard({ ...boardState, votingMode: val, votingPhase: 'IDLE' })}
                        disabled={boardState.votingPhase !== 'IDLE'}
                    >
                        <SelectTrigger className="w-[180px] h-8">
                            <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="THUMBS_UP">Thumbs Up</SelectItem>
                            <SelectItem value="THUMBS_UD_NEUTRAL">Up / Down / Neutral</SelectItem>
                            <SelectItem value="POINTS">Points Budget</SelectItem>
                            <SelectItem value="MAJORITY_JUDGMENT">Majority Judgment</SelectItem>
                        </SelectContent>
                    </Select>

                    {boardState.votingPhase === 'IDLE' && (
                        <>
                            <Button size="sm" onClick={handleStartVoting}>
                                <Play className="h-3 w-3 mr-1" /> Start Voting
                            </Button>
                            <Dialog open={pointsConfigOpen} onOpenChange={setPointsConfigOpen}>
                                <DialogContent className="sm:max-w-sm">
                                    <DialogHeader>
                                        <DialogTitle>Configure Points Budget</DialogTitle>
                                        <DialogDescription>
                                            Set the maximum number of points each user can distribute across all cards.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex items-center gap-4 py-4">
                                        <Label className="text-right">Max Points:</Label>
                                        <Input
                                            type="number"
                                            value={pointsConfigValue}
                                            onChange={(e) => setPointsConfigValue(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="col-span-3"
                                        />
                                    </div>
                                    <Button onClick={confirmPointsConfig}>Start Points Voting</Button>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                    {boardState.votingPhase === 'VOTING' && (
                        <Button size="sm" variant="secondary" onClick={() => saveBoard({ ...boardState, votingPhase: 'IDLE' })}>
                            <Square className="h-3 w-3 mr-1" /> Stop Voting
                        </Button>
                    )}
                    {boardState.votingPhase !== 'REVEALED' && (
                        <Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState, votingPhase: 'REVEALED' })}>
                            <Eye className="h-3 w-3 mr-1" /> Reveal Votes
                        </Button>
                    )}
                    {boardState.votingPhase === 'REVEALED' && (
                        <Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState, votingPhase: 'IDLE' })}>
                            <RotateCcw className="h-3 w-3 mr-1" /> Continue Voting
                        </Button>
                    )}
                </div>
            )}

            {/* Collapsible Filters & Controls */}
            <div className="flex flex-col gap-2">
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

                {!isFiltersCollapsed && (
                    <div className="flex flex-wrap items-center gap-4 border rounded-lg p-3">
                        {/* Search */}
                        <div className="flex items-center gap-2">
                            <Label>Search:</Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search cards..."
                                    value={filterSearchText}
                                    onChange={(e) => setFilterSearchText(e.target.value)}
                                    className="pl-8 w-40"
                                />
                            </div>
                        </div>

                        {/* Vertical separator */}
                        <div className="h-6 border-l border-gray-300"></div>

                        {/* User Filter */}
                        <UserFilterSelector
                            selectedUserId={filterUserId}
                            onUserChange={setFilterUserId}
                            className="w-40"
                        />

                        {/* Vertical separator */}
                        <div className="h-6 border-l border-gray-300"></div>

                        {/* Column Filter */}
                        <div className="flex items-center gap-2">
                            <Label>Column:</Label>
                            <MultiSelect
                                options={boardState.columns.map(col => ({ value: col.id, label: col.title }))}
                                selected={filterColumns}
                                onChange={setFilterColumns}
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
                                value={filterMinLikes}
                                onChange={(e) => setFilterMinLikes(Math.max(0, parseInt(e.target.value) || 0))}
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

            {/* Linking mode banner */}
            {linkingCardId && (
                <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            Linking mode: Click on other cards to link/unlink them
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLinkingCardId(null)}
                        className="border-blue-300 text-blue-700 hover:bg-blue-200 dark:border-blue-600 dark:text-blue-300"
                    >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                    </Button>
                </div>
            )}

            <div className="flex-grow flex space-x-4 overflow-x-auto">
                {boardState.columns.map(column => (
                    <div
                        key={column.id}
                        className="min-w-[300px] w-1/5 flex flex-col border rounded-lg bg-background"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, column.id)}
                    >
                        <div
                            className="p-3 font-bold flex justify-between items-center rounded-t-lg"
                            style={{ borderTop: `4px solid ${column.color}` }}
                        >
                            {editingColumnId === column.id ? (
                                <Input
                                    autoFocus
                                    value={editingColumnTitle}
                                    onChange={(e) => setEditingColumnTitle(e.target.value)}
                                    onBlur={() => {
                                        if (editingColumnTitle.trim() && editingColumnTitle.trim() !== column.title) {
                                            updateColumnTitle(column.id, editingColumnTitle.trim());
                                        }
                                        setEditingColumnId(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (editingColumnTitle.trim() && editingColumnTitle.trim() !== column.title) {
                                                updateColumnTitle(column.id, editingColumnTitle.trim());
                                            }
                                            setEditingColumnId(null);
                                        } else if (e.key === 'Escape') {
                                            setEditingColumnId(null);
                                        }
                                    }}
                                    className="h-6 px-1 py-0 text-sm font-bold"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span
                                    className={isModerator ? 'cursor-pointer' : ''}
                                    onDoubleClick={(e) => {
                                        if (isModerator) {
                                            e.stopPropagation();
                                            setEditingColumnId(column.id);
                                            setEditingColumnTitle(column.title);
                                        }
                                    }}
                                >
                                    {column.title}
                                </span>
                            )}
                            <div className="flex items-center space-x-1">
                                <span className="text-xs text-muted-foreground">
                                    {boardState.cards.filter(c => c.columnId === column.id).length}
                                </span>
                                {/* Sort by votes button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => toggleColumnSort(column.id)}
                                    title={columnSortOrder[column.id] === 'desc' ? 'Sorted by votes (high to low)' : columnSortOrder[column.id] === 'asc' ? 'Sorted by votes (low to high)' : 'Sort by votes'}
                                >
                                    {columnSortOrder[column.id] === 'desc' ? (
                                        <ChevronDown className="h-3 w-3 text-primary" />
                                    ) : columnSortOrder[column.id] === 'asc' ? (
                                        <ChevronUp className="h-3 w-3 text-primary" />
                                    ) : (
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </Button>
                                {isModerator && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleLock(column.id)}>
                                        {column.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                    </Button>
                                )}
                                {!isModerator && column.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </div>
                        </div>

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
                                                    if (e.key === 'Enter') addCard(column.id, isAnonymousMode);
                                                    if (e.key === 'Escape') {
                                                        setActiveColumnId(null);
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
                                                    onClick={() => addCard(column.id, isAnonymousMode)}
                                                >
                                                    Add {isAnonymousMode ? ' (Anonymously)' : ''}
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => {
                                                    setActiveColumnId(null);
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
                                                    setActiveColumnId(column.id);
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
                                                    setActiveColumnId(column.id);
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

                            {filteredCards
                                .filter(c => c.columnId === column.id)
                                .sort((a, b) => {
                                    const sortOrder = columnSortOrder[column.id];
                                    if (!sortOrder || sortOrder === 'none') return 0;
                                    const scoreA = calculateCardVoteScore(a);
                                    const scoreB = calculateCardVoteScore(b);
                                    return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
                                })
                                .map(card => {
                                    // Determine if card content should be hidden (blurred)
                                    // Anonymous cards (authorId === null) are also blurred in hidden mode for everyone
                                    const isHiddenFromUser = boardState.hiddenEdition && !card.isRevealed && (card.authorId === null || card.authorId !== currentUserId);

                                    // Check if this card is linked to the card being linked
                                    const isLinkedToLinkingCard = linkingCardId && card.id !== linkingCardId && getLinkedCardIds(linkingCardId).has(card.id);
                                    const isDirectlyLinked = linkingCardId && card.id !== linkingCardId &&
                                        (boardState.cards.find(c => c.id === linkingCardId)?.linkedCardIds?.includes(card.id) || false);
                                    const isLinkingSource = linkingCardId === card.id;
                                    const hasLinkedCards = (card.linkedCardIds?.length || 0) > 0;

                                    return (
                                        <div
                                            key={card.id}
                                            draggable={!column.isLocked && !isHiddenFromUser && !linkingCardId}
                                            onDragStart={(e) => isHiddenFromUser || linkingCardId ? e.preventDefault() : handleDragStart(e, card.id)}
                                            onClick={() => {
                                                // If in linking mode and clicking a different card, toggle link
                                                if (linkingCardId && card.id !== linkingCardId && !isHiddenFromUser) {
                                                    toggleLinkCards(linkingCardId, card.id);
                                                }
                                            }}
                                            className={`p-3 rounded border bg-card shadow-sm transition-all duration-200 ${isHiddenFromUser ? 'blur-sm select-none pointer-events-none' : ''} ${isLinkingSource ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''} ${isLinkedToLinkingCard ? 'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : ''} ${linkingCardId && !isLinkingSource && !isHiddenFromUser ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                {editingCardId === card.id ? (
                                                    <Input
                                                        autoFocus
                                                        value={editingCardContent}
                                                        onChange={(e) => setEditingCardContent(e.target.value)}
                                                        onBlur={() => {
                                                            if (editingCardContent.trim() !== card.content) {
                                                                updateCardContent(card.id, editingCardContent.trim());
                                                            }
                                                            setEditingCardId(null);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                if (editingCardContent.trim() !== card.content) {
                                                                    updateCardContent(card.id, editingCardContent.trim());
                                                                }
                                                                setEditingCardId(null);
                                                            } else if (e.key === 'Escape') {
                                                                setEditingCardId(null);
                                                            }
                                                        }}
                                                        className="flex-1 text-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                ) : (
                                                    <div
                                                        className={`text-sm whitespace-pre-wrap flex-1 ${!isHiddenFromUser && (card.authorId === currentUserId || (isModerator && !isHiddenFromUser)) ? 'cursor-pointer' : ''}`}
                                                        onDoubleClick={(e) => {
                                                            e.stopPropagation();
                                                            // Allow editing if: owner OR moderator (and card is visible)
                                                            if (!isHiddenFromUser && (card.authorId === currentUserId || isModerator)) {
                                                                setEditingCardId(card.id);
                                                                setEditingCardContent(card.content);
                                                            }
                                                        }}
                                                    >
                                                        {isHiddenFromUser
                                                            ? 'Hidden content'
                                                            : card.content}
                                                    </div>
                                                )}
                                                <div className="flex flex-col space-y-1 ml-2">
                                                    {!isHiddenFromUser && (
                                                        <>
                                                            {/* Link button */}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className={`h-4 w-4 ${hasLinkedCards || isLinkingSource ? 'text-blue-500' : 'text-muted-foreground'} hover:text-blue-600`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setLinkingCardId(linkingCardId === card.id ? null : card.id);
                                                                }}
                                                                title={linkingCardId === card.id ? 'Cancel linking' : hasLinkedCards ? `Linked to ${card.linkedCardIds?.length} card(s) - click to manage links` : 'Link to other cards'}
                                                            >
                                                                {linkingCardId === card.id ? <Unlink className="h-3 w-3" /> : <Link className="h-3 w-3" />}
                                                            </Button>
                                                            {/* Promote to backlog button */}
                                                            {!card.promotedTaskId && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-4 w-4 text-muted-foreground hover:text-green-600"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        promoteToBacklog(card.id);
                                                                    }}
                                                                    title="Promote to backlog"
                                                                >
                                                                    <ArrowUpRight className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                            {card.promotedTaskId && (
                                                                <span className="text-[10px] text-green-600 font-medium" title="Already promoted to backlog">
                                                                    <ArrowUpRight className="h-3 w-3 inline" />
                                                                </span>
                                                            )}
                                                            {/* Delete button */}
                                                            {(card.authorId === currentUserId || isModerator) && (
                                                                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}>
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-2 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    {!isHiddenFromUser && boardState.votingPhase === 'VOTING' ? (
                                                        <div className="flex items-center gap-1">
                                                            {boardState.votingMode === 'THUMBS_UP' && (
                                                                <Button
                                                                    variant={card.votes?.[currentUserId] === 1 ? "default" : "ghost"}
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0 rounded-full"
                                                                    onClick={() => voteCard(card.id, 1)}
                                                                >
                                                                    <ThumbsUp className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                            {boardState.votingMode === 'THUMBS_UD_NEUTRAL' && (
                                                                <>
                                                                    <Button
                                                                        variant={card.votes?.[currentUserId] === 1 ? "default" : "ghost"}
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 rounded-full"
                                                                        onClick={() => voteCard(card.id, 1)}
                                                                        title="For"
                                                                    >
                                                                        <ThumbsUp className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                        variant={card.votes?.[currentUserId] === 0 ? "default" : "ghost"}
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 rounded-full"
                                                                        onClick={() => voteCard(card.id, 0)}
                                                                        title="Neutral"
                                                                    >
                                                                        <Minus className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                        variant={card.votes?.[currentUserId] === -1 ? "default" : "ghost"}
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 rounded-full"
                                                                        onClick={() => voteCard(card.id, -1)}
                                                                        title="Against"
                                                                    >
                                                                        <ThumbsUp className="h-3 w-3 rotate-180" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                            {boardState.votingMode === 'POINTS' && (
                                                                <div className="flex items-center gap-1 bg-muted rounded p-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={() => votePoints(card.id, -1)}
                                                                        disabled={(card.votes?.[currentUserId] || 0) <= 0}
                                                                    >
                                                                        <Minus className="h-3 w-3" />
                                                                    </Button>
                                                                    <span className="text-xs font-mono font-bold w-4 text-center">
                                                                        {card.votes?.[currentUserId] || 0}
                                                                    </span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={() => votePoints(card.id, 1)}

                                                                        disabled={calculateUserUsedPoints(currentUserId) >= (boardState.maxPointsPerUser || 10)}
                                                                    >
                                                                        <Plus className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                            {boardState.votingMode === 'MAJORITY_JUDGMENT' && (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button
                                                                            variant={card.votes?.[currentUserId] !== undefined ? "default" : "outline"}
                                                                            size="sm"
                                                                            className="h-6 px-2 text-[10px]"
                                                                        >
                                                                            {card.votes?.[currentUserId] !== undefined
                                                                                ? MJ_SCALE.find(s => s.value === card.votes[currentUserId])?.label
                                                                                : "Vote"}
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-2">
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className="text-xs font-semibold mb-1 text-center">Rate this option:</span>
                                                                            {MJ_SCALE.slice().reverse().map(step => (
                                                                                <Button
                                                                                    key={step.value}
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className={`justify-start h-7 text-xs ${card.votes?.[currentUserId] === step.value ? 'bg-accent' : ''} ${step.hoverColor} hover:text-white`}
                                                                                    onClick={() => voteCard(card.id, step.value)}
                                                                                >
                                                                                    <span className="mr-2">{step.icon}</span>
                                                                                    {step.label}
                                                                                </Button>
                                                                            ))}
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-xs font-medium">
                                                            {isModerator || boardState.votingPhase === 'REVEALED' ? (
                                                                <>
                                                                    {boardState.votingMode === 'THUMBS_UP' && (
                                                                        <span className="flex items-center text-blue-600">
                                                                            <span className="flex items-center text-green-600"><ThumbsUp className="h-3 w-3 mr-1" /></span>
                                                                            {Object.values(card.votes || {}).filter(v => v === 1).length}
                                                                        </span>
                                                                    )}
                                                                    {boardState.votingMode === 'THUMBS_UD_NEUTRAL' && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="flex items-center text-green-600"><ThumbsUp className="h-3 w-3 mr-1" />{Object.values(card.votes || {}).filter(v => v === 1).length}</span>
                                                                            <span className="flex items-center text-gray-500"><Minus className="h-3 w-3 mr-1" />{Object.values(card.votes || {}).filter(v => v === 0).length}</span>
                                                                            <span className="flex items-center text-red-600"><ThumbsUp className="h-3 w-3 mr-1 rotate-180" />{Object.values(card.votes || {}).filter(v => v === -1).length}</span>
                                                                        </div>
                                                                    )}
                                                                    {boardState.votingMode === 'POINTS' && (
                                                                        <span className="flex items-center text-green-600 font-bold">
                                                                            {Object.values(card.votes || {}).reduce((a, b) => a + b, 0)} pts
                                                                        </span>
                                                                    )}
                                                                    {boardState.votingMode === 'MAJORITY_JUDGMENT' && (
                                                                        <HoverCard openDelay={0} closeDelay={0}>
                                                                            <HoverCardTrigger asChild>
                                                                                <div className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors">
                                                                                    {(() => {
                                                                                        const median = getMJMedian(card.votes || {});
                                                                                        if (median === null) return <span className="text-muted-foreground">No votes</span>;
                                                                                        const grade = MJ_SCALE.find(s => s.value === median);
                                                                                        return (
                                                                                            <span className={`px-2 py-0.5 rounded text-white flex items-center gap-1 ${grade?.color || 'bg-gray-500'}`}>
                                                                                                {grade?.icon} {grade?.label}
                                                                                                <span className="ml-1 opacity-75 text-[10px]">({Object.keys(card.votes || {}).length})</span>
                                                                                            </span>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            </HoverCardTrigger>
                                                                            <HoverCardContent className="w-[400px] p-4 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
                                                                                {renderMJDistribution(card.votes || {})}
                                                                            </HoverCardContent>
                                                                        </HoverCard>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground italic">
                                                                    {Object.keys(card.votes || {}).length > 0 ? `${Object.keys(card.votes || {}).length} voters` : 'No votes yet'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {!isHiddenFromUser && (
                                                    <UserSelector
                                                        value={card.authorId || ''}
                                                        onChange={(selectedId) => updateCardAuthor(card.id, selectedId === '' ? null : selectedId)}
                                                    />
                                                )}
                                            </div>
                                            {/* Linked cards indicator */}
                                            {!isHiddenFromUser && hasLinkedCards && !linkingCardId && (
                                                <div className="mt-2 pt-2 border-t border-dashed">
                                                    <div className="flex items-center gap-1 text-[10px] text-blue-600">
                                                        <Link className="h-3 w-3" />
                                                        <span>Linked to {card.linkedCardIds?.length} card(s)</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}      </div>
                    </div>
                ))}
            </div>
        </div >
    );
};

export default FertilizationView;
