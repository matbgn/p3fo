import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { FertilizationBoardEntity, FertilizationCard, FertilizationColumn } from '@/lib/persistence-types';
import { usePersistence } from '@/hooks/usePersistence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Eye, EyeOff, Play, RotateCcw, Link, Unlink, ArrowUpRight, Minus, Clock, Square, Info, Plus, X, Trash2, ThumbsUp, HatGlasses, MousePointer2, MousePointerClick } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useUsers } from '@/hooks/useUsers';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { aStarTextSearch } from '@/lib/a-star-search';

// Board Components
import { BoardLayout } from './planView/BoardLayout';
import { BoardHeader, FilterState, ColumnOption } from './planView/BoardHeader';
import { BoardColumn } from './planView/BoardColumn';
import { CardView } from './planView/CardView';

// Imports for collaboration
import { doc, isCollaborationEnabled, initializeCollaboration, yFertilizationState, yFertilizationCards, yFertilizationColumns } from '@/lib/collaboration';
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useBoardTimer } from '@/hooks/useBoardTimer';
import { UserAvatar } from '@/components/UserAvatar';

// Voting Constants
type VotingMode = 'THUMBS_UP' | 'THUMBS_UD_NEUTRAL' | 'POINTS' | 'MAJORITY_JUDGMENT';
type VotingPhase = 'IDLE' | 'VOTING' | 'REVEALED';

import { MJ_SCALE } from './planView/constants';

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
    onPromoteToKanban?: (taskId: string) => void;
}

export const FertilizationView: React.FC<FertilizationViewProps> = ({ onClose, onPromoteToKanban }) => {
    const persistence = usePersistence();
    const { userId: currentUserId, userSettings } = useUserSettings();
    const { createTask } = useTasks();
    const { users } = useUsers();

    const [boardState, setBoardState] = useState<FertilizationBoardEntity | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

    // Filter state
    const [filterState, setFilterState] = useState<FilterState>({
        searchText: '',
        userId: null,
        columns: [],
        minLikes: 0,
    });

    // Points Voting State
    const [pointsConfigOpen, setPointsConfigOpen] = useState(false);
    const [pointsConfigValue, setPointsConfigValue] = useState(10);

    // Linking mode state
    const [linkingCardId, setLinkingCardId] = useState<string | null>(null);

    // Sort state for each column
    const [columnSortOrder, setColumnSortOrder] = useState<Record<string, 'none' | 'asc' | 'desc'>>({});

    // Promotion confirmation modal state
    const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
    const [cardToPromote, setCardToPromote] = useState<FertilizationCard | null>(null);

    // Ref for the board container (for SVG threading)
    const boardContainerRef = useRef<HTMLDivElement | null>(null);
    const [linkLines, setLinkLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

    // Filter cards based on current filters
    const filteredCards = useMemo(() => {
        if (!boardState) return [];

        let cards = [...boardState.cards];

        // Apply column filter
        if (filterState.columns.length > 0) {
            cards = cards.filter(card => filterState.columns.includes(card.columnId));
        }

        // Apply user filter
        if (filterState.userId !== null) {
            if (filterState.userId === 'UNASSIGNED') {
                cards = cards.filter(card => card.authorId === null || card.authorId === '');
            } else {
                cards = cards.filter(card => card.authorId === filterState.userId);
            }
        }

        // Apply minimum likes filter
        if (filterState.minLikes > 0) {
            cards = cards.filter(card => {
                const positiveVotes = Object.values(card.votes || {}).filter(v => v > 0).length;
                return positiveVotes >= filterState.minLikes;
            });
        }

        // Apply search filter with A* algorithm
        if (filterState.searchText.trim()) {
            const searchResults = aStarTextSearch(
                filterState.searchText,
                cards.map(card => ({ id: card.id, title: card.content }))
            );
            const matchingIds = new Set(searchResults.map(r => r.taskId));
            cards = cards.filter(card => matchingIds.has(card.id));
        }

        return cards;
    }, [boardState, filterState]);

    // Initialize collaboration
    useEffect(() => {
        if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
            initializeCollaboration();
        }
    }, []);

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
            yFertilizationState.set('areCursorsVisible', state.areCursorsVisible);
            yFertilizationState.set('showAllLinks', state.showAllLinks);

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
            const timer = yFertilizationState.get('timer') as unknown as { isRunning: boolean; startTime: number; duration: number; } | null;
            const hiddenEdition = yFertilizationState.get('hiddenEdition') as boolean;
            const votingMode = (yFertilizationState.get('votingMode') as VotingMode) || 'THUMBS_UP';
            const votingPhase = (yFertilizationState.get('votingPhase') as VotingPhase) || 'IDLE';
            const areCursorsVisible = yFertilizationState.get('areCursorsVisible') as boolean ?? true;
            const showAllLinks = yFertilizationState.get('showAllLinks') as boolean ?? false;

            const columns = Array.from(yFertilizationColumns.values()) as FertilizationColumn[];
            const sortedColumns = DEFAULT_COLUMNS.map(defCol =>
                columns.find(c => c.id === defCol.id) || defCol
            );

            const cards = Array.from(yFertilizationCards.values()) as FertilizationCard[];

            if (columns.length > 0) {
                const newState: FertilizationBoardEntity = {
                    moderatorId: moderatorId ?? null,
                    isSessionActive: isSessionActive ?? false,
                    timer: timer ?? null,
                    hiddenEdition: hiddenEdition ?? true,
                    votingMode,
                    votingPhase,
                    areCursorsVisible,
                    showAllLinks,
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
                // ALWAYS try to load from local persistence first (Offline-First)
                let savedState = await persistence.getFertilizationBoardState();
                if (!savedState) {
                    savedState = {
                        moderatorId: null,
                        isSessionActive: false,
                        columns: DEFAULT_COLUMNS,
                        cards: [],
                        timer: null,
                        hiddenEdition: true,
                        votingMode: 'THUMBS_UP',
                        votingPhase: 'IDLE',
                        areCursorsVisible: true,
                        showAllLinks: false,
                    };
                    await persistence.updateFertilizationBoardState(savedState);
                }
                setBoardState(savedState);

                // Then check for collaboration override
                if (isCollaborationEnabled()) {
                    // If Yjs has data, use it
                    if (yFertilizationColumns.size > 0) {
                        const moderatorId = yFertilizationState.get('moderatorId') as string | null;
                        const isSessionActive = yFertilizationState.get('isSessionActive') as boolean;
                        const timer = yFertilizationState.get('timer') as unknown as { isRunning: boolean; startTime: number; duration: number; } | null;
                        const hiddenEdition = yFertilizationState.get('hiddenEdition') as boolean;
                        const votingMode = (yFertilizationState.get('votingMode') as VotingMode) || 'THUMBS_UP';
                        const votingPhase = (yFertilizationState.get('votingPhase') as VotingPhase) || 'IDLE';
                        const areCursorsVisible = yFertilizationState.get('areCursorsVisible') as boolean ?? true;
                        const showAllLinks = yFertilizationState.get('showAllLinks') as boolean ?? false;
                        const columns = Array.from(yFertilizationColumns.values()) as FertilizationColumn[];
                        const sortedColumns = DEFAULT_COLUMNS.map(defCol =>
                            columns.find(c => c.id === defCol.id) || defCol
                        );
                        const cards = Array.from(yFertilizationCards.values()) as FertilizationCard[];

                        const newState: FertilizationBoardEntity = {
                            moderatorId: moderatorId ?? null,
                            isSessionActive: isSessionActive ?? false,
                            timer: timer ?? null,
                            hiddenEdition: hiddenEdition ?? true,
                            votingMode,
                            votingPhase,
                            areCursorsVisible,
                            showAllLinks,
                            columns: sortedColumns,
                            cards: cards
                        };
                        setBoardState(newState);
                        // Sync back to local persistence
                        await persistence.updateFertilizationBoardState(newState);
                    } else {
                        // If Yjs is empty, sync from local to Yjs
                        syncBoardToYjs(savedState);
                    }
                }

            } catch (error) {
                console.error('Error loading fertilization board:', error);
            } finally {
                setLoading(false);
            }
        };
        loadBoard();
    }, [persistence, syncBoardToYjs]);

    // Sync cursor visibility to CursorOverlay
    useEffect(() => {
        if (boardState) {
            const event = new CustomEvent('setCursorVisibility', {
                detail: { visible: boardState.areCursorsVisible ?? true }
            });
            window.dispatchEvent(event);
        }
        return () => {
            const event = new CustomEvent('setCursorVisibility', { detail: { visible: true } });
            window.dispatchEvent(event);
        };
    }, [boardState?.areCursorsVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveBoard = useCallback(async (newState: FertilizationBoardEntity) => {
        setBoardState(newState);
        syncBoardToYjs(newState);
        await persistence.updateFertilizationBoardState(newState);
    }, [persistence, syncBoardToYjs]);

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
            columns: DEFAULT_COLUMNS,
            timer: null,
            hiddenEdition: true,
            votingMode: 'THUMBS_UP',
            votingPhase: 'IDLE',
            areCursorsVisible: true,
            showAllLinks: false,
        };
        await saveBoard(newState);
    };

    const becomeModerator = async () => {
        if (!boardState) return;
        if (!confirm('⚠️ Warning: You are about to take over as moderator.\n\nThis should only be done if the current moderator has left the session or is unavailable.\n\nAre you sure you want to become the moderator?')) return;
        const newState = { ...boardState, moderatorId: currentUserId };
        await saveBoard(newState);
    };

    const isModerator = boardState?.moderatorId === currentUserId;

    const toggleLock = async (columnId: string) => {
        if (!boardState || !isModerator) return;
        const newColumns = boardState.columns.map(col =>
            col.id === columnId ? { ...col, isLocked: !col.isLocked } : col
        );
        await saveBoard({ ...boardState, columns: newColumns });
    };

    const toggleHiddenEdition = async () => {
        if (!boardState || !isModerator) return;
        await saveBoard({ ...boardState, hiddenEdition: !boardState.hiddenEdition });
    };

    const addCard = async (content: string, anonymous: boolean) => {
        if (!boardState || !content.trim() || !activeColumnId) return;
        const newCard: FertilizationCard = {
            id: crypto.randomUUID(),
            columnId: activeColumnId,
            content: content,
            authorId: anonymous ? null : currentUserId,
            votes: {},
            isRevealed: !boardState.hiddenEdition,
        };
        await saveBoard({
            ...boardState,
            cards: [...boardState.cards, newCard],
        });
        // setActiveColumnId(null); // Keep open for bulk insert
    };

    const deleteCard = async (cardId: string) => {
        if (!boardState) return;

        // NEW: Clean up links. If cardId was in any other card's linkedCardIds, remove it.
        const cleanedCards = boardState.cards
            .filter(c => c.id !== cardId)
            .map(c => {
                if (c.linkedCardIds && c.linkedCardIds.includes(cardId)) {
                    return { ...c, linkedCardIds: c.linkedCardIds.filter(lid => lid !== cardId) };
                }
                return c;
            });

        await saveBoard({
            ...boardState,
            cards: cleanedCards,
        });
    };

    // Column/Card Editing State
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [editingColumnTitle, setEditingColumnTitle] = useState('');
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editingCardContent, setEditingCardContent] = useState('');

    const updateColumnTitle = async (columnId: string, title: string) => {
        if (!boardState || !isModerator) return;
        const newColumns = boardState.columns.map(c => c.id === columnId ? { ...c, title } : c);
        await saveBoard({ ...boardState, columns: newColumns });
    };

    const updateCardContent = async (cardId: string, content: string) => {
        if (!boardState) return;
        const newCards = boardState.cards.map(c => c.id === cardId ? { ...c, content } : c);
        await saveBoard({ ...boardState, cards: newCards });
    };

    const updateCardAuthor = async (cardId: string, authorId: string | null) => {
        if (!boardState) return;
        const newCards = boardState.cards.map(c => c.id === cardId ? { ...c, authorId } : c);
        await saveBoard({ ...boardState, cards: newCards });
    };

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
                    linkedCardIds: isLinked ? card1Links.filter(id => id !== cardId2) : [...card1Links, cardId2]
                };
            }
            if (c.id === cardId2) {
                return {
                    ...c,
                    linkedCardIds: isLinked ? card2Links.filter(id => id !== cardId1) : [...card2Links, cardId1]
                };
            }
            return c;
        });

        await saveBoard({ ...boardState, cards: newCards });
    };

    const getLinkedCardIds = useCallback((cardId: string): Set<string> => {
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
        visited.delete(cardId);
        return visited;
    }, [boardState]);


    const openPromoteDialog = (card: FertilizationCard) => {
        setCardToPromote(card);
        setPromoteDialogOpen(true);
    };

    const promoteToBacklog = async () => {
        if (!boardState || !cardToPromote) return;
        const card = cardToPromote;
        const newTaskId = await createTask(card.content, null, currentUserId);
        const newCards = boardState.cards.map(c => c.id === card.id ? { ...c, promotedTaskId: newTaskId } : c);
        await saveBoard({ ...boardState, cards: newCards });
        setPromoteDialogOpen(false);
        setCardToPromote(null);
        if (onPromoteToKanban) onPromoteToKanban(newTaskId);
    };

    const calculateCardVoteScore = (card: FertilizationCard): number => {
        if (!boardState) return 0;
        const votes = card.votes || {};
        const values = Object.values(votes);
        if (values.length === 0) return 0;
        switch (boardState.votingMode) {
            case 'THUMBS_UP': return values.filter(v => v > 0).length;
            case 'THUMBS_UD_NEUTRAL': return values.reduce((acc, v) => acc + v, 0);
            case 'POINTS': return values.reduce((acc, v) => acc + v, 0);
            case 'MAJORITY_JUDGMENT': {
                const sorted = [...values].sort((a, b) => a - b);
                const midIndex = Math.ceil(sorted.length / 2) - 1;
                return sorted[Math.max(0, midIndex)];
            }
            default: return 0;
        }
    };

    const toggleColumnSort = (columnId: string) => {
        setColumnSortOrder(prev => {
            const currentOrder = prev[columnId] || 'none';
            const nextOrder = currentOrder === 'none' ? 'desc' : currentOrder === 'desc' ? 'asc' : 'none';
            return { ...prev, [columnId]: nextOrder };
        });
    };

    const recomputeLinkLines = useCallback(() => {
        const container = boardContainerRef.current;
        if (!container || !boardState) {
            setLinkLines([]);
            return;
        }

        // Determine which cards need lines drawn
        const cardsToLink: Set<string> = new Set();
        const pairsToDraw: Array<[string, string]> = [];

        if (linkingCardId) {
            // If in linking mode, only show links relevant to the current card
            const linkedIds = getLinkedCardIds(linkingCardId);
            cardsToLink.add(linkingCardId);
            linkedIds.forEach(id => {
                cardsToLink.add(id);
                pairsToDraw.push([linkingCardId, id]);
            });
            linkedIds.forEach(id => {
                cardsToLink.add(id);
                pairsToDraw.push([linkingCardId, id]);
            });
        } else if (boardState.showAllLinks) {
            // If showAllLinks is enabled (visible to everyone), show ALL links
            boardState.cards.forEach(card => {
                if (card.linkedCardIds && card.linkedCardIds.length > 0) {
                    card.linkedCardIds.forEach(linkedId => {
                        // Avoid duplicates by sorting ids or just adding (we filter dupes later implicitly by line logic? No, we might double draw)
                        // Let's standardise order to avoid double lines
                        if (card.id < linkedId) {
                            pairsToDraw.push([card.id, linkedId]);
                        }
                    });
                }
            });
        } else {
            setLinkLines([]);
            return;
        }

        if (pairsToDraw.length === 0) {
            setLinkLines([]);
            return;
        }

        const cardElements = Array.from(container.querySelectorAll('[data-card-id]')) as HTMLElement[];
        const rectContainer = container.getBoundingClientRect();
        const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

        pairsToDraw.forEach(([idA, idB]) => {
            const elA = cardElements.find(el => el.dataset.cardId === idA);
            const elB = cardElements.find(el => el.dataset.cardId === idB);

            if (!elA || !elB) return;

            const ra = elA.getBoundingClientRect();
            const rb = elB.getBoundingClientRect();
            let x1: number, y1: number, x2: number, y2: number;

            if (ra.right < rb.left) {
                x1 = ra.right - rectContainer.left + container.scrollLeft;
                y1 = ra.top + ra.height / 2 - rectContainer.top + container.scrollTop;
                x2 = rb.left - rectContainer.left + container.scrollLeft;
                y2 = rb.top + rb.height / 2 - rectContainer.top + container.scrollTop;
            } else if (rb.right < ra.left) {
                x1 = ra.left - rectContainer.left + container.scrollLeft;
                y1 = ra.top + ra.height / 2 - rectContainer.top + container.scrollTop;
                x2 = rb.right - rectContainer.left + container.scrollLeft;
                y2 = rb.top + rb.height / 2 - rectContainer.top + container.scrollTop;
            } else {
                const centerX = (ra.left + ra.right) / 2 - rectContainer.left + container.scrollLeft;
                if (ra.bottom < rb.top) {
                    x1 = centerX; y1 = ra.bottom - rectContainer.top + container.scrollTop;
                    x2 = centerX; y2 = rb.top - rectContainer.top + container.scrollTop;
                } else {
                    x1 = centerX; y1 = ra.top - rectContainer.top + container.scrollTop;
                    x2 = centerX; y2 = rb.bottom - rectContainer.top + container.scrollTop;
                }
            }
            lines.push({ x1, y1, x2, y2 });
        });
        setLinkLines(lines);
    }, [linkingCardId, boardState, getLinkedCardIds]);

    useLayoutEffect(() => {
        recomputeLinkLines();
    }, [recomputeLinkLines, filteredCards]);

    useEffect(() => {
        const container = boardContainerRef.current;
        if (!container) return;
        const onScroll = () => recomputeLinkLines();
        container.addEventListener('scroll', onScroll, { passive: true });
        const ro = new ResizeObserver(() => recomputeLinkLines());
        ro.observe(container);
        const onResize = () => recomputeLinkLines();
        window.addEventListener('resize', onResize);
        return () => {
            container.removeEventListener('scroll', onScroll);
            ro.disconnect();
            window.removeEventListener('resize', onResize);
        };
    }, [recomputeLinkLines]);


    const voteCard = async (cardId: string, value: number) => {
        if (!boardState) return;
        if (boardState.votingPhase !== 'VOTING') return;
        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                const currentVote = c.votes[currentUserId];
                const newVotes = { ...c.votes };
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

    const getMJMedian = (votes: Record<string, number>) => {
        const values = Object.values(votes).sort((a, b) => a - b);
        if (values.length === 0) return null;
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

    const handleDragStart = (e: React.DragEvent, cardId: string) => e.dataTransfer.setData('cardId', cardId);

    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('cardId');
        if (!boardState || !cardId) return;
        const card = boardState.cards.find(c => c.id === cardId);
        if (!card) return;
        if (card.columnId === targetColumnId) return;

        if (targetColumnId === 'priorities') {
            createTask(card.content, null, currentUserId);
        }
        const newCards = boardState.cards.map(c => c.id === cardId ? { ...c, columnId: targetColumnId } : c);
        await saveBoard({ ...boardState, cards: newCards });
    };

    const onTimerExpire = useCallback(async () => {
        if (!boardState || !boardState.timer) return;
        const lockedColumns = boardState.columns.map(col => ({ ...col, isLocked: true }));
        await saveBoard({ ...boardState, columns: lockedColumns, timer: { ...boardState.timer, isRunning: false } });
    }, [boardState, saveBoard]);

    const {
        timeLeft,
        formatTime,
        isTimerDialogOpen,
        setIsTimerDialogOpen,
        timerMinutes,
        setTimerMinutes,
        timerSeconds,
        setTimerSeconds,
        startTimerWithDuration,
        stopTimer,
        adjustMinutes,
        adjustSeconds
    } = useBoardTimer(boardState, saveBoard, !!isModerator, onTimerExpire);

    const handleStartVoting = () => {
        if (boardState?.votingMode === 'POINTS' && boardState.votingPhase === 'IDLE') {
            setPointsConfigOpen(true);
        } else {
            saveBoard({ ...boardState!, votingPhase: 'VOTING', areCursorsVisible: false });
        }
    };

    const confirmPointsConfig = async () => {
        if (!boardState) return;
        await saveBoard({ ...boardState, votingPhase: 'VOTING', maxPointsPerUser: pointsConfigValue, areCursorsVisible: false });
        setPointsConfigOpen(false);
    };

    const calculateUserUsedPoints = (userId: string) => {
        if (!boardState) return 0;
        return boardState.cards.reduce((acc, card) => acc + (card.votes[userId] || 0), 0);
    };

    const votePoints = async (cardId: string, delta: number) => {
        if (!boardState || boardState.votingMode !== 'POINTS') return;
        const maxPoints = boardState.maxPointsPerUser || 10;
        const usedPoints = calculateUserUsedPoints(currentUserId);
        const card = boardState.cards.find(c => c.id === cardId);
        if (!card) return;
        const currentCardPoints = card.votes[currentUserId] || 0;
        const newCardPoints = currentCardPoints + delta;
        if (newCardPoints < 0) return;
        if (usedPoints - currentCardPoints + newCardPoints > maxPoints) return;
        const newVotes = { ...card.votes };
        if (newCardPoints === 0) delete newVotes[currentUserId];
        else newVotes[currentUserId] = newCardPoints;
        const newCards = boardState.cards.map(c => c.id === cardId ? { ...c, votes: newVotes } : c);
        await saveBoard({ ...boardState, cards: newCards });
    };

    if (loading) return <div>Loading...</div>;

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
        <BoardLayout>
            {/* Dialogs */}
            <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Promote to Kanban</DialogTitle>
                        <DialogDescription>
                            This will create a new task in the Kanban board with the content of this card.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>Cancel</Button>
                        <Button onClick={promoteToBacklog}>Promote</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <BoardHeader
                title="Fertilization Board"
                titleContent={
                    boardState?.votingMode === 'POINTS' && boardState.votingPhase === 'VOTING' && (
                        <div className="text-sm font-normal px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-primary">
                            Budget: <span className="font-bold">{calculateUserUsedPoints(currentUserId)}</span> / {boardState.maxPointsPerUser || 10} pts
                        </div>
                    )
                }
                filterState={filterState}
                onFilterChange={setFilterState}
                columnOptions={boardState.columns.map(col => ({ value: col.id, label: col.title }))}
                sessionControls={
                    <>
                        {/* Timer Display */}
                        <div className={`text-xl font-mono font-bold mr-4 ${boardState.timer?.isRunning && timeLeft <= 10 ? 'text-red-500 animate-pulse' : ''}`}>
                            {formatTime(timeLeft)}
                        </div>
                        {isModerator && (
                            <>
                                {boardState.timer?.isRunning ? (
                                    <Button variant="outline" size="sm" onClick={stopTimer}>
                                        <Square className="mr-2 h-4 w-4" /> Stop Timer
                                    </Button>
                                ) : (
                                    <Dialog open={isTimerDialogOpen} onOpenChange={setIsTimerDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Clock className="mr-2 h-4 w-4" /> Set Timer
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                                <DialogTitle>Start/Stop Timer</DialogTitle>
                                                <DialogDescription>Adjust minutes and seconds.</DialogDescription>
                                            </DialogHeader>
                                            <div className="flex justify-center gap-4 py-4">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-sm text-muted-foreground mb-2">Minutes</span>
                                                    <div className="flex items-center gap-2">
                                                        <Input type="number" min={0} max={60} value={timerMinutes} onChange={(e) => setTimerMinutes(Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))} className="w-16 text-center" />
                                                        <div className="flex flex-col">
                                                            <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => adjustMinutes(-1)}><Minus className="h-3 w-3" /></Button>
                                                            <Button variant="secondary" size="icon" className="h-6 w-6 mt-1" onClick={() => adjustMinutes(1)}><Plus className="h-3 w-3" /></Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-sm text-muted-foreground mb-2">Seconds</span>
                                                    <div className="flex items-center gap-2">
                                                        <Input type="number" min={0} max={59} value={timerSeconds} onChange={(e) => setTimerSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className="w-16 text-center" />
                                                        <div className="flex flex-col">
                                                            <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => adjustSeconds(-10)}><Minus className="h-3 w-3" /></Button>
                                                            <Button variant="secondary" size="icon" className="h-6 w-6 mt-1" onClick={() => adjustSeconds(10)}><Plus className="h-3 w-3" /></Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button onClick={startTimerWithDuration} className="w-full">Start</Button>
                                        </DialogContent>
                                    </Dialog>
                                )}
                                <Button variant="outline" size="sm" onClick={toggleHiddenEdition}>
                                    {boardState.hiddenEdition ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                    {boardState.hiddenEdition ? 'Hidden Mode' : 'Visible Mode'}
                                </Button>
                                <Button variant="destructive" size="sm" onClick={restartSession}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Restart Session
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => saveBoard({ ...boardState, areCursorsVisible: !boardState.areCursorsVisible })}>
                                    {boardState.areCursorsVisible ? <MousePointer2 className="mr-2 h-4 w-4" /> : <MousePointerClick className="mr-2 h-4 w-4 text-muted-foreground" />}
                                    {boardState.areCursorsVisible ? 'Hide Cursors' : 'Show Cursors'}
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

                        {isModerator && (
                            <Button variant={boardState.showAllLinks ? "secondary" : "outline"} size="sm" onClick={() => {
                                const newState = { ...boardState, showAllLinks: !boardState.showAllLinks };
                                saveBoard(newState);
                            }}>
                                {boardState.showAllLinks ? <Unlink className="mr-2 h-4 w-4" /> : <Link className="mr-2 h-4 w-4" />}
                                {boardState.showAllLinks ? 'Hide Links' : 'Show Links'}
                            </Button>
                        )}

                        {!isModerator && boardState.isSessionActive && (
                            <Button variant="outline" size="sm" onClick={becomeModerator}>Become Moderator</Button>
                        )}
                    </>
                }
                customControls={
                    <>
                        {
                            isModerator && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium mr-1">Voting:</span>
                                    <Select value={boardState.votingMode} onValueChange={(val: VotingMode) => saveBoard({ ...boardState!, votingMode: val, votingPhase: 'IDLE' })} disabled={boardState.votingPhase !== 'IDLE'}>
                                        <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Mode" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="THUMBS_UP">Thumbs Up</SelectItem>
                                            <SelectItem value="THUMBS_UD_NEUTRAL">Up / Down / Neutral</SelectItem>
                                            <SelectItem value="POINTS">Points Budget</SelectItem>
                                            <SelectItem value="MAJORITY_JUDGMENT">Majority Judgment</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {boardState.votingPhase === 'IDLE' && (
                                        <>
                                            <Button size="sm" onClick={handleStartVoting}><Play className="h-3 w-3 mr-1" /> Start Voting</Button>
                                            <Dialog open={pointsConfigOpen} onOpenChange={setPointsConfigOpen}>
                                                <DialogContent className="sm:max-w-sm">
                                                    <DialogHeader><DialogTitle>Configure Points Budget</DialogTitle></DialogHeader>
                                                    <div className="flex items-center gap-4 py-4">
                                                        <Label className="text-right">Max Points:</Label>
                                                        <Input type="number" value={pointsConfigValue} onChange={(e) => setPointsConfigValue(Math.max(1, parseInt(e.target.value) || 0))} className="col-span-3" />
                                                    </div>
                                                    <Button onClick={confirmPointsConfig}>Start Points Voting</Button>
                                                </DialogContent>
                                            </Dialog>
                                        </>
                                    )}
                                    {boardState.votingPhase === 'VOTING' && (<Button size="sm" variant="secondary" onClick={() => saveBoard({ ...boardState!, votingPhase: 'IDLE' })}><Square className="h-3 w-3 mr-1" /> Stop Voting</Button>)}
                                    {boardState.votingPhase !== 'REVEALED' && (<Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState!, votingPhase: 'REVEALED' })}><Eye className="h-3 w-3 mr-1" /> Reveal Votes</Button>)}
                                    {boardState.votingPhase === 'REVEALED' && (<Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState!, votingPhase: 'IDLE' })}><RotateCcw className="h-3 w-3 mr-1" /> Continue Voting</Button>)}
                                </div>
                            )
                        }
                    </>
                }
            />

            {/* Linking mode banner */}
            {
                linkingCardId && (
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
                            <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                    </div>
                )
            }

            <div className="flex-grow flex space-x-4 overflow-x-auto relative" ref={boardContainerRef}>
                {/* SVG overlay for link lines */}
                {(linkingCardId || boardState.showAllLinks) && linkLines.length > 0 && (
                    <svg
                        className="pointer-events-none absolute top-0 left-0 w-full h-full"
                        width={boardContainerRef.current?.clientWidth || 0}
                        height={boardContainerRef.current?.clientHeight || 0}
                        style={{ overflow: 'visible', zIndex: 10 }}
                    >
                        {linkLines.map((l, i) => (
                            <path
                                key={i}
                                d={`M ${l.x1} ${l.y1} C ${l.x1 + 40} ${l.y1}, ${l.x2 - 40} ${l.y2}, ${l.x2} ${l.y2}`}
                                stroke="#facc15"
                                strokeWidth="3"
                                fill="none"
                            />
                        ))}
                    </svg>
                )}

                {boardState.columns.map(column => (
                    <BoardColumn
                        key={column.id}
                        column={column}
                        cards={filteredCards.filter(c => c.columnId === column.id).sort((a, b) => {
                            const sortOrder = columnSortOrder[column.id];
                            if (!sortOrder || sortOrder === 'none') return 0;
                            const scoreA = calculateCardVoteScore(a);
                            const scoreB = calculateCardVoteScore(b);
                            return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
                        })}
                        activeColumnId={activeColumnId}
                        onSetActiveColumnId={setActiveColumnId}
                        onAddCard={(content, anonymous) => {
                            setActiveColumnId(column.id); // Context for add
                            addCard(content, anonymous);
                        }}
                        isModerator={isModerator}
                        onToggleLock={() => toggleLock(column.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, column.id)}
                        sortOrder={columnSortOrder[column.id]}
                        onToggleSort={() => toggleColumnSort(column.id)}
                        isEditingTitle={editingColumnId === column.id}
                        editingTitleValue={editingColumnTitle}
                        onEditingTitleChange={setEditingColumnTitle}
                        onEditingTitleCommit={() => {
                            if (editingColumnTitle.trim() && editingColumnTitle.trim() !== column.title) {
                                updateColumnTitle(column.id, editingColumnTitle.trim());
                            }
                            setEditingColumnId(null);
                        }}
                        onEditingTitleCancel={() => setEditingColumnId(null)}
                        onTitleDoubleClick={() => {
                            setEditingColumnId(column.id);
                            setEditingColumnTitle(column.title);
                        }}
                        renderCard={(card) => (
                            <CardView
                                card={card}
                                isModerator={!!isModerator}
                                currentUserId={currentUserId}
                                users={users}
                                userSettings={userSettings}
                                hiddenEdition={boardState.hiddenEdition}
                                votingMode={boardState.votingMode}
                                votingPhase={boardState.votingPhase}
                                maxPoints={boardState.maxPointsPerUser}
                                userPointsUsed={calculateUserUsedPoints(currentUserId)}
                                isEditing={editingCardId === card.id}
                                onEditStart={() => {
                                    setEditingCardId(card.id);
                                    setEditingCardContent(card.content);
                                }}
                                onEditEnd={() => setEditingCardId(null)}
                                linkingCardId={linkingCardId}
                                isLinkedToLinkingCard={!!linkingCardId && card.id !== linkingCardId && getLinkedCardIds(linkingCardId).has(card.id)}
                                isDirectlyLinked={!!linkingCardId && card.id !== linkingCardId && (boardState.cards.find(c => c.id === linkingCardId)?.linkedCardIds?.includes(card.id) || false)}
                                onUpdateContent={(content) => updateCardContent(card.id, content)}
                                onUpdateAuthor={(authorId) => updateCardAuthor(card.id, authorId)}
                                onDelete={() => deleteCard(card.id)}
                                onPromote={() => openPromoteDialog(card)}
                                onVote={(value) => {
                                    if (boardState.votingMode === 'POINTS') {
                                        votePoints(card.id, value);
                                    } else {
                                        voteCard(card.id, value);
                                    }
                                }}
                                onToggleLink={() => {
                                    if (linkingCardId && card.id !== linkingCardId) {
                                        toggleLinkCards(linkingCardId, card.id);
                                    } else {
                                        setLinkingCardId(linkingCardId === card.id ? null : card.id);
                                    }
                                }}
                                onDragStart={(e) => handleDragStart(e, card.id)}
                                isDraggable={!column.isLocked && !linkingCardId}
                            />
                        )}
                    />
                ))}
            </div>
        </BoardLayout>
    );
};
