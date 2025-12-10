import React, { useState, useEffect, useCallback } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { FertilizationBoardEntity, FertilizationCard, FertilizationColumn } from '@/lib/persistence-types';
import { usePersistence } from '@/hooks/usePersistence';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Eye, EyeOff, Play, RotateCcw, Plus, Trash2, ThumbsUp, HatGlasses, Minus, Clock, Square } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks'; // For converting to tasks
import { UserSelector } from './UserSelector';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

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
                yFertilizationCards.set(card.id, card);
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

        const newState = {
            ...boardState,
            isSessionActive: false,
            moderatorId: null,
            cards: [],
            columns: DEFAULT_COLUMNS, // Reset locks
            timer: null,
            hiddenEdition: true,
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
            likedBy: [],
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

    const likeCard = async (cardId: string) => {
        if (!boardState) return;
        const newCards = boardState.cards.map(c => {
            if (c.id === cardId) {
                const hasLiked = c.likedBy.includes(currentUserId);
                let newLikedBy;
                if (hasLiked) {
                    // Unlike
                    newLikedBy = c.likedBy.filter(id => id !== currentUserId);
                } else {
                    // Like
                    newLikedBy = [...c.likedBy, currentUserId];
                }
                return { ...c, likedBy: newLikedBy };
            }
            return c;
        });
        await saveBoard({ ...boardState, cards: newCards });
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
                <h2 className="text-2xl font-bold">Fertilization Board</h2>
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
                        <Button variant="outline" size="sm" onClick={becomeModerator}>
                            Become Moderator
                        </Button>
                    )}
                </div>
            </div>

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
                            <span>{column.title}</span>
                            <div className="flex items-center space-x-1">
                                <span className="text-xs text-muted-foreground">
                                    {boardState.cards.filter(c => c.columnId === column.id).length}
                                </span>
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

                            {boardState.cards
                                .filter(c => c.columnId === column.id)
                                .map(card => {
                                    // Determine if card content should be hidden (blurred)
                                    // Anonymous cards (authorId === null) are also blurred in hidden mode for everyone
                                    const isHiddenFromUser = boardState.hiddenEdition && !card.isRevealed && (card.authorId === null || card.authorId !== currentUserId);

                                    return (
                                        <div
                                            key={card.id}
                                            draggable={!column.isLocked && !isHiddenFromUser}
                                            onDragStart={(e) => isHiddenFromUser ? e.preventDefault() : handleDragStart(e, card.id)}
                                            className={`p-3 rounded border bg-card shadow-sm ${isHiddenFromUser ? 'blur-sm select-none pointer-events-none' : ''}`}
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
                                                    {!isHiddenFromUser && (card.authorId === currentUserId || isModerator) && (
                                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={() => deleteCard(card.id)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-2 flex justify-between items-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => likeCard(card.id)}
                                                    disabled={isHiddenFromUser}
                                                >
                                                    <ThumbsUp className={`h-3 w-3 mr-1 ${card.likedBy.includes(currentUserId) ? 'fill-current text-blue-500' : ''}`} />
                                                    {card.likedBy.length}
                                                </Button>
                                                {!isHiddenFromUser && (
                                                    <UserSelector
                                                        value={card.authorId || ''}
                                                        onChange={(selectedId) => updateCardAuthor(card.id, selectedId === '' ? null : selectedId)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FertilizationView;
