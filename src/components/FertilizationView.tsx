import React, { useState, useEffect, useCallback } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { FertilizationBoardEntity, FertilizationCard, FertilizationColumn } from '@/lib/persistence-types';
import { usePersistence } from '@/hooks/usePersistence';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Eye, EyeOff, Play, RotateCcw, Plus, Trash2, Heart } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks'; // For converting to tasks

// Default columns
const DEFAULT_COLUMNS: FertilizationColumn[] = [
    { id: 'facts', title: 'Facts', color: '#F87171', isLocked: false }, // Red
    { id: 'satisfactions', title: 'Satisfactions', color: '#FACC15', isLocked: true }, // Yellow
    { id: 'discomfort', title: 'Discomfort', color: '#FB923C', isLocked: true }, // Orange
    { id: 'levers', title: 'Levers', color: '#4ADE80', isLocked: true }, // Green
    { id: 'priorities', title: 'Priorities', color: '#60A5FA', isLocked: true }, // Blue
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

    const addCard = async (columnId: string) => {
        if (!boardState || !newCardContent.trim()) return;

        const newCard: FertilizationCard = {
            id: crypto.randomUUID(),
            columnId,
            content: newCardContent,
            authorId: currentUserId,
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

    const toggleTimer = async () => {
        if (!boardState || !isModerator) return;

        if (boardState.timer?.isRunning) {
            // Stop timer
            await saveBoard({
                ...boardState,
                timer: {
                    ...boardState.timer,
                    isRunning: false,
                },
            });
        } else {
            // Start timer (default 5 minutes if not set)
            const duration = boardState.timer?.duration || 300;
            await saveBoard({
                ...boardState,
                timer: {
                    isRunning: true,
                    startTime: Date.now(),
                    duration: duration,
                },
            });
        }
    };

    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!boardState?.timer?.isRunning || !boardState.timer.startTime) {
            setTimeLeft(null);
            return;
        }

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - boardState.timer!.startTime!) / 1000);
            const remaining = boardState.timer!.duration - elapsed;
            if (remaining <= 0) {
                setTimeLeft(0);
                // Optionally stop timer automatically?
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [boardState?.timer]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
                    {boardState.timer?.isRunning && timeLeft !== null && (
                        <div className="text-xl font-mono font-bold mr-4">
                            {formatTime(timeLeft)}
                        </div>
                    )}
                    {isModerator && (
                        <>
                            <Button variant="outline" size="sm" onClick={toggleTimer}>
                                {boardState.timer?.isRunning ? <RotateCcw className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                                {boardState.timer?.isRunning ? 'Stop Timer' : 'Start 5m Timer'}
                            </Button>
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
                                                    if (e.key === 'Enter') addCard(column.id);
                                                    if (e.key === 'Escape') {
                                                        setActiveColumnId(null);
                                                        setNewCardContent('');
                                                    }
                                                }}
                                                placeholder="Type..."
                                            />
                                            <div className="flex space-x-2">
                                                <Button size="sm" onClick={() => addCard(column.id)}>Add</Button>
                                                <Button size="sm" variant="ghost" onClick={() => {
                                                    setActiveColumnId(null);
                                                    setNewCardContent('');
                                                }}>Cancel</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            className="w-full border-dashed"
                                            onClick={() => setActiveColumnId(column.id)}
                                        >
                                            <Plus className="mr-2 h-4 w-4" /> Add Card
                                        </Button>
                                    )}
                                </div>
                            )}

                            {boardState.cards
                                .filter(c => c.columnId === column.id)
                                .map(card => (
                                    <div
                                        key={card.id}
                                        draggable={!column.isLocked} // Can only drag if column is unlocked? Or maybe always drag? Let's assume unlocked.
                                        onDragStart={(e) => handleDragStart(e, card.id)}
                                        className={`p-3 rounded border bg-card shadow-sm ${boardState.hiddenEdition && !card.isRevealed && card.authorId !== currentUserId ? 'blur-sm select-none' : ''}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="text-sm whitespace-pre-wrap">
                                                {boardState.hiddenEdition && !card.isRevealed && card.authorId !== currentUserId
                                                    ? 'Hidden content'
                                                    : card.content}
                                            </div>
                                            <div className="flex flex-col space-y-1 ml-2">
                                                {card.authorId === currentUserId && (
                                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={() => deleteCard(card.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => likeCard(card.id)}>
                                                <Heart className={`h-3 w-3 mr-1 ${card.likedBy.includes(currentUserId) ? 'fill-current text-red-500' : ''}`} />
                                                {card.likedBy.length}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FertilizationView;
