import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { DreamBoardEntity, DreamColumn, TimeFrame, DreamCard } from '@/lib/persistence-types';
import { useUserSettings } from '@/hooks/useUserSettings';
import { usePersistence } from '@/hooks/usePersistence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Unlock, Play, RotateCcw, Eye, EyeOff, Maximize2, Minimize2, ArrowUpRight, Plus, Trash2, Clock, Square, Minus, ThumbsUp, Link, Unlink, HatGlasses, MousePointer2, MousePointerClick, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from '@/components/ui/label';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

import { aStarTextSearch } from '@/lib/a-star-search';

// Board Components
import { BoardLayout } from './planView/BoardLayout';
import { BoardHeader, FilterState } from './planView/BoardHeader';
import { BoardColumn } from './planView/BoardColumn';
import { CardView } from './planView/CardView';
import { useBoardTimer } from '@/hooks/useBoardTimer';
import { useUsers } from '@/hooks/useUsers';

// Imports for collaboration
import { doc, isCollaborationEnabled, initializeCollaboration, yDreamState, yDreamCards, yDreamColumns } from '@/lib/collaboration';
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";

// Voting Constants
type VotingMode = 'THUMBS_UP' | 'THUMBS_UD_NEUTRAL' | 'POINTS' | 'MAJORITY_JUDGMENT';
type VotingPhase = 'IDLE' | 'VOTING' | 'REVEALED';

import { MJ_SCALE } from './planView/constants';

// Default columns for Dream mode
const DEFAULT_DREAM_COLUMNS: DreamColumn[] = [
  { id: 'dreams', title: 'Dreams', color: '#FFFFFF', isLocked: false },
  { id: 'strengths', title: 'Strengths', color: '#FACC15', isLocked: true },
  { id: 'threats', title: 'Threats', color: '#030303', isLocked: true },
  { id: 'levers', title: 'Levers', color: '#4ADE80', isLocked: true },
  { id: 'priorities', title: 'Priorities', color: '#60A5FA', isLocked: true },
];

// Default board state
const DEFAULT_DREAM_BOARD: DreamBoardEntity = {
  moderatorId: null,
  isSessionActive: false,
  columns: DEFAULT_DREAM_COLUMNS,
  cards: [],
  timer: null,
  hiddenEdition: false,
  votingMode: 'THUMBS_UP',
  votingPhase: 'IDLE',
  maxPointsPerUser: undefined,
  isTimelineExpanded: false,

  timeSortDirection: 'nearest',
  areCursorsVisible: true,
  showAllLinks: false,
};

// Column to time frame mapping for expanded mode
const COLUMN_TO_TIMEFRAME: Record<string, TimeFrame> = {
  'dreams': '3mo',
  'strengths': '6mo',
  'threats': '1y',
  'levers': '2y',
  'priorities': '4y',
};

// Time frame to column mapping for expanded mode
const TIMEFRAME_TO_COLUMN: Record<TimeFrame, string> = {
  '3mo': 'dreams',
  '6mo': 'strengths',
  '1y': 'threats',
  '2y': 'levers',
  '4y': 'priorities',
};

// Time frame order for sorting
const TIME_FRAME_ORDER: Record<TimeFrame, number> = {
  '3mo': 1,
  '6mo': 2,
  '1y': 3,
  '2y': 4,
  '4y': 5,
};

// Time frame display labels for expanded timeline view
const TIME_FRAME_LABELS: Record<TimeFrame, string> = {
  '3mo': '3 months',
  '6mo': '6 months',
  '1y': '12 months',
  '2y': '2 years',
  '4y': '4 years',
};

// TimeTagBadge component
interface TimeTagBadgeProps {
  timeFrame: TimeFrame;
  onChange: (newTimeFrame: TimeFrame) => void;
  disabled?: boolean;
}

const TimeTagBadge: React.FC<TimeTagBadgeProps> = ({ timeFrame, onChange, disabled }) => {
  const TIME_FRAME_COLORS: Record<TimeFrame, string> = {
    '3mo': '#60A5FA', // blue
    '6mo': '#4ADE80', // green
    '1y': '#FACC15',  // yellow
    '2y': '#FB923C',  // orange
    '4y': '#F87171',  // red
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-2 py-0.5 rounded text-xs font-medium text-white hover:opacity-80 transition-opacity"
          style={{ backgroundColor: TIME_FRAME_COLORS[timeFrame] }}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          {timeFrame}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-1">
          {(['3mo', '6mo', '1y', '2y', '4y'] as TimeFrame[]).map((tf) => (
            <Button
              key={tf}
              variant={timeFrame === tf ? 'default' : 'outline'}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onChange(tf);
              }}
            >
              {tf}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface DreamViewProps {
  onClose?: () => void;
  onPromoteToKanban?: (taskId: string) => void;
}

export const DreamView: React.FC<DreamViewProps> = ({ onClose, onPromoteToKanban }) => {
  const persistence = usePersistence();
  const { userId: currentUserId, userSettings } = useUserSettings();
  const { users } = useUsers();

  const [boardState, setBoardState] = useState<DreamBoardEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  // Card Editing State
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardContent, setEditingCardContent] = useState('');

  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    searchText: '',
    userId: null,
    columns: [],
    minLikes: 0,
  });

  // Timer State


  // Points Voting State
  const [pointsConfigOpen, setPointsConfigOpen] = useState(false);
  const [pointsConfigValue, setPointsConfigValue] = useState(10);

  // Linking State
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);

  // Promotion State
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [cardToPromote, setCardToPromote] = useState<DreamCard | null>(null);

  // Link Visualization State
  const [linkLines, setLinkLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  // Track collaboration active state
  const [isCollabActive, setIsCollabActive] = useState(false);

  // Initialize collaboration
  useEffect(() => {
    // FIX: Check config directly, do not rely on isCollaborationEnabled() which depends on this running first
    if (!PERSISTENCE_CONFIG.FORCE_BROWSER) {
      initializeCollaboration();
      setIsCollabActive(true);
    }
  }, []);

  // Helper: Reconstruct state from Yjs
  const reconstructStateFromYjs = useCallback((): DreamBoardEntity => {
    const moderatorId = yDreamState.get('moderatorId') as string | null;
    const isSessionActive = yDreamState.get('isSessionActive') as boolean;
    const columns = Array.from(yDreamColumns.values()) as DreamColumn[];
    const cards = Array.from(yDreamCards.values()) as DreamCard[];
    const timer = yDreamState.get('timer') as unknown as { isRunning: boolean; startTime: number; duration: number; } | null;
    const hiddenEdition = yDreamState.get('hiddenEdition') as boolean;
    const votingMode = (yDreamState.get('votingMode') as VotingMode) || 'THUMBS_UP';
    const votingPhase = (yDreamState.get('votingPhase') as VotingPhase) || 'IDLE';
    const maxPointsPerUser = yDreamState.get('maxPointsPerUser') as number | undefined;
    const isTimelineExpanded = yDreamState.get('isTimelineExpanded') as boolean ?? false;
    const timeSortDirection = (yDreamState.get('timeSortDirection') as 'nearest' | 'farthest') || 'nearest';
    const areCursorsVisible = yDreamState.get('areCursorsVisible') as boolean ?? true;
    const showAllLinks = yDreamState.get('showAllLinks') as boolean ?? false;

    // Ensure columns are complete (merge with defaults)
    const sortedColumns = DEFAULT_DREAM_COLUMNS.map(defCol =>
      columns.find(c => c.id === defCol.id) || { ...defCol }
    );
    // Update isLocked status from YJS if present, otherwise default
    const finalColumns = sortedColumns.map(col => {
      const yCol = columns.find(c => c.id === col.id);
      return yCol ? yCol : col;
    });


    return {
      moderatorId: moderatorId ?? null,
      isSessionActive: isSessionActive ?? false,
      columns: finalColumns,
      cards: cards,
      timer: timer ?? null,
      hiddenEdition: hiddenEdition ?? false,
      votingMode,
      votingPhase,
      maxPointsPerUser,
      isTimelineExpanded,
      timeSortDirection,
      areCursorsVisible,
      showAllLinks
    };
  }, []);

  // Sync state to Yjs
  const syncBoardToYjs = useCallback((state: DreamBoardEntity) => {
    if (!isCollaborationEnabled()) return;

    doc.transact(() => {
      // Sync State
      yDreamState.set('moderatorId', state.moderatorId);
      yDreamState.set('isSessionActive', state.isSessionActive);
      yDreamState.set('timer', state.timer);
      yDreamState.set('hiddenEdition', state.hiddenEdition);
      yDreamState.set('votingMode', state.votingMode);
      yDreamState.set('votingPhase', state.votingPhase);
      yDreamState.set('areCursorsVisible', state.areCursorsVisible);
      yDreamState.set('isTimelineExpanded', state.isTimelineExpanded);
      yDreamState.set('timeSortDirection', state.timeSortDirection);
      yDreamState.set('showAllLinks', state.showAllLinks);
      if (state.maxPointsPerUser !== undefined) yDreamState.set('maxPointsPerUser', state.maxPointsPerUser);

      // Sync Columns
      state.columns.forEach(col => {
        yDreamColumns.set(col.id, col);
      });

      // Sync Cards
      const currentYCardIds = Array.from(yDreamCards.keys());
      const newCardIds = state.cards.map(c => c.id);

      // Remove deleted cards
      currentYCardIds.forEach(id => {
        if (!newCardIds.includes(id as string)) {
          yDreamCards.delete(id as string);
        }
      });

      // Add/Update cards
      state.cards.forEach(card => {
        const existingCard = yDreamCards.get(card.id) as DreamCard;
        if (!existingCard || JSON.stringify(existingCard) !== JSON.stringify(card)) {
          yDreamCards.set(card.id, card);
        }
      });
    });
  }, []);

  // Load board state
  useEffect(() => {
    const loadBoard = async () => {
      try {
        // ALWAYS try to load from local persistence first for immediate display (Offline-First)
        const savedState = await persistence.getDreamBoardState();
        if (savedState) {
          setBoardState(savedState);
        } else {
          setBoardState(DEFAULT_DREAM_BOARD);
        }

        // Then, if collaboration is enabled and has data, override/sync
        if (isCollaborationEnabled()) {
          // If Yjs has data, use it (it's the truth in collab mode)
          if (yDreamColumns.size > 0 || yDreamCards.size > 0) {
            const newState = reconstructStateFromYjs();
            setBoardState(newState);
            // We should also update local persistence with latest cloud state
            persistence.updateDreamBoardState(newState);
          } else if (savedState) {
            // If Yjs is empty but we have local state, initialize Yjs from local
            syncBoardToYjs(savedState);
          }
        }
      } catch (error) {
        console.error('Error loading dream board:', error);
        setBoardState(DEFAULT_DREAM_BOARD);
      } finally {
        setLoading(false);
      }
    };
    loadBoard();
  }, [persistence, reconstructStateFromYjs, syncBoardToYjs, isCollabActive]);

  // Observer for Yjs updates
  useEffect(() => {
    if (!isCollaborationEnabled()) return;

    const observer = () => {
      // Reconstruct state from Yjs
      const newState = reconstructStateFromYjs();
      setBoardState(newState);
    };
    yDreamState.observe(observer);
    yDreamCards.observe(observer);
    yDreamColumns.observe(observer);

    return () => {
      yDreamState.unobserve(observer);
      yDreamCards.unobserve(observer);
      yDreamColumns.unobserve(observer);
    };
  }, [reconstructStateFromYjs]);


  // Sync cursor visibility to CursorOverlay
  useEffect(() => {
    if (boardState) {
      const event = new CustomEvent('setCursorVisibility', {
        detail: { visible: boardState.areCursorsVisible ?? true }
      });
      window.dispatchEvent(event);
    }
    return () => {
      // Reset to visible when unmounting or leaving view
      const event = new CustomEvent('setCursorVisibility', { detail: { visible: true } });
      window.dispatchEvent(event);
    };
  }, [boardState?.areCursorsVisible]); // eslint-disable-line react-hooks/exhaustive-deps




  const saveBoard = useCallback(async (newState: DreamBoardEntity) => {
    setBoardState(newState);
    syncBoardToYjs(newState);
    await persistence.updateDreamBoardState(newState);
  }, [persistence, syncBoardToYjs]);

  const isModerator = boardState?.moderatorId === currentUserId || boardState?.moderatorId === null;

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
  } = useBoardTimer(boardState, saveBoard, !!isModerator);

  // Voting Handlers
  const handleStartVoting = async () => {
    if (!boardState || !isModerator) return;
    if (boardState.votingMode === 'POINTS') {
      setPointsConfigOpen(true);
    } else {
      await saveBoard({ ...boardState, votingPhase: 'VOTING' as VotingPhase, areCursorsVisible: false });
    }
  };

  const confirmPointsConfig = async () => {
    if (!boardState || !isModerator) return;
    await saveBoard({ ...boardState, votingPhase: 'VOTING' as VotingPhase, maxPointsPerUser: pointsConfigValue, areCursorsVisible: false });
    setPointsConfigOpen(false);
  };

  const calculateUserUsedPoints = (userId: string): number => {
    if (!boardState) return 0;
    let used = 0;
    boardState.cards.forEach(card => {
      if (card.votes && card.votes[userId]) {
        used += card.votes[userId];
      }
    });
    return used;
  };

  const voteCard = async (cardId: string, value: number) => {
    if (!boardState) return;
    if (boardState.votingPhase !== 'VOTING') return;

    const newCards = boardState.cards.map(c => {
      if (c.id === cardId) {
        const currentVote = c.votes[currentUserId];
        const newVotes = { ...c.votes };

        if (boardState.votingMode !== 'MAJORITY_JUDGMENT' && currentVote === value) {
          // Toggle off if same value (except MJ where you pick a grade)
          delete newVotes[currentUserId];
        } else {
          newVotes[currentUserId] = value;
        }
        return { ...c, votes: newVotes };
      }
      return c;
    });
    const newState = { ...boardState, cards: newCards };
    await saveBoard(newState);
  };

  const votePoints = async (cardId: string, delta: number) => {
    if (!boardState) return;
    if (boardState.votingPhase !== 'VOTING') return;

    const card = boardState.cards.find(c => c.id === cardId);
    if (!card) return;

    const currentPoints = card.votes[currentUserId] || 0;
    const newPoints = currentPoints + delta;

    if (newPoints < 0) return; // Cannot have negative points on a card

    const usedPoints = calculateUserUsedPoints(currentUserId);
    const maxPoints = boardState.maxPointsPerUser || 10;

    // If adding points, check budget
    if (delta > 0 && usedPoints + delta > maxPoints) return;

    const newVotes = { ...card.votes };
    if (newPoints === 0) {
      delete newVotes[currentUserId];
    } else {
      newVotes[currentUserId] = newPoints;
    }

    const newCards = boardState.cards.map(c => c.id === cardId ? { ...c, votes: newVotes } : c);
    const newState = { ...boardState, cards: newCards };
    await saveBoard(newState);
  };

  const calculateCardVoteScore = (card: DreamCard): number => {
    if (!boardState) return 0;
    const votes = card.votes || {};
    const values = Object.values(votes);
    if (values.length === 0) return 0;
    switch (boardState.votingMode) {
      case 'THUMBS_UP': return values.filter(v => v === 1).length;
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

  const getMJMedian = (votes: Record<string, number>) => {
    const values = Object.values(votes).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const midIndex = Math.ceil(values.length / 2) - 1;
    return values[Math.max(0, midIndex)];
  };

  const renderMJDistribution = (votes: Record<string, number>) => {
    const totalVotes = Object.keys(votes).length;
    if (totalVotes === 0) return <div className="text-sm text-muted-foreground p-2">No votes cast yet.</div>;

    const medianValue = getMJMedian(votes);

    return (
      <div className="p-2 space-y-2">
        <div className="text-xs font-semibold mb-2">
          Median Grade: {MJ_SCALE.find(g => g.value === medianValue)?.label || 'N/A'}
          <span className="ml-1 text-muted-foreground">({totalVotes} votes)</span>
        </div>
        <div className="space-y-1">
          {MJ_SCALE.slice().reverse().map(grade => {
            const count = Object.values(votes).filter(v => v === grade.value).length;
            const percentage = Math.round((count / totalVotes) * 100);
            return (
              <div key={grade.value} className="flex items-center text-[10px] gap-2">
                <div className="w-20 truncate" title={grade.label}>{grade.icon} {grade.label}</div>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full ${grade.color}`} style={{ width: `${percentage}%` }} />
                </div>
                <div className="w-8 text-right text-muted-foreground">{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Handlers
  const toggleLock = async (columnId: string) => {
    if (!boardState || !isModerator) return;
    const newColumns = boardState.columns.map(col =>
      col.id === columnId ? { ...col, isLocked: !col.isLocked } : col
    );
    const newState = { ...boardState, columns: newColumns };
    await saveBoard(newState);
  };

  const addCard = useCallback(async (content: string, anonymous: boolean) => {
    if (!boardState) return;

    let targetTimeFrame: TimeFrame = '3mo';
    // Default to 'dreams' if collapsed and no specific logic, OR activeColumnId if collapsed
    // If expanded, targetColumnId is technically 'dreams' separated by timeframe, OR we use the logic below.

    // START FIX: 
    // If collapsed, use activeColumnId if valid, else 'dreams'.
    // If expanded, 'dreams' is the only real column, so we default to 'dreams' but set timeframe based on the "visual" column (which maps to timeframe).

    let targetColumnId = 'dreams';

    if (boardState.isTimelineExpanded) {
      // Expanded mode: Visual columns are timeframes. activeColumnId is likely one of 'dreams', 'strengths' etc. acting as timeframe buckets.
      // The card strictly belongs to 'dreams' (as per schema) but has a timeframe.
      targetColumnId = 'dreams';
      if (activeColumnId && COLUMN_TO_TIMEFRAME[activeColumnId]) {
        targetTimeFrame = COLUMN_TO_TIMEFRAME[activeColumnId];
      }
    } else {
      // Collapsed mode: Use the actual active column.
      targetColumnId = activeColumnId || 'dreams';
      // Timeframe default is 3mo, or maybe we want to keep it synonymous with the column if that column HAD a timeframe mapping?
      // But in collapsed mode, 'Strengths' doesn't necessarily imply '6mo' unless we enforce it?
      // The original code implies COLUMN_TO_TIMEFRAME logic was only for expanded.
      // However, 'Strengths' column always exists.
      // Let's check if the user wants 'Strengths' column to imply '6mo' even in collapsed? 
      // The request says "Adding a card in strength add it in Dreams columns why?". 
      // This implies they expect it to stay in 'Strengths'.
      // My fix: set targetColumnId = activeColumnId.
    }

    const newCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      columnId: targetColumnId,
      content,
      authorId: anonymous ? null : currentUserId,
      votes: {},
      isRevealed: true,
      timeFrame: targetTimeFrame,
    };

    const newState = { ...boardState, cards: [...boardState.cards, newCard] };
    await saveBoard(newState);
    // setActiveColumnId(null); // Keep open for bulk insert
  }, [boardState, currentUserId, activeColumnId, saveBoard]);

  const deleteCard = useCallback(async (cardId: string) => {
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

    const newState = { ...boardState, cards: cleanedCards };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const updateCardContent = useCallback(async (cardId: string, content: string) => {
    if (!boardState) return;
    const newState = { ...boardState, cards: boardState.cards.map(c => c.id === cardId ? { ...c, content } : c) };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const updateCardTimeFrame = useCallback(async (cardId: string, timeFrame: TimeFrame) => {
    if (!boardState) return;
    const newState = { ...boardState, cards: boardState.cards.map(c => c.id === cardId ? { ...c, timeFrame } : c) };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const updateCardAuthor = useCallback(async (cardId: string, authorId: string | null) => {
    if (!boardState) return;
    const newState = { ...boardState, cards: boardState.cards.map(c => c.id === cardId ? { ...c, authorId } : c) };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const toggleTimelineExpansion = useCallback(async () => {
    if (!boardState) return;
    const newState = { ...boardState, isTimelineExpanded: !boardState.isTimelineExpanded };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const toggleTimeSortDirection = useCallback(async () => {
    if (!boardState) return;
    const newDirection: 'nearest' | 'farthest' = boardState.timeSortDirection === 'nearest' ? 'farthest' : 'nearest';
    const newState = { ...boardState, timeSortDirection: newDirection };
    await saveBoard(newState);
  }, [boardState, saveBoard]);

  const startSession = useCallback(async () => {
    if (!boardState) return;
    const newState = { ...boardState, isSessionActive: true, moderatorId: currentUserId };
    await saveBoard(newState);
  }, [boardState, currentUserId, saveBoard]);

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, cardId: string) => e.dataTransfer.setData('text/plain', cardId);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (!boardState || !cardId) return;

    const targetColumn = boardState.columns.find(c => c.id === targetColumnId);
    if (targetColumn?.isLocked) return;

    const newState = {
      ...boardState,
      cards: boardState.cards.map(card => {
        if (card.id === cardId) {
          return {
            ...card,
            columnId: 'dreams', // Always 'dreams'
            timeFrame: boardState.isTimelineExpanded && COLUMN_TO_TIMEFRAME[targetColumnId] ? COLUMN_TO_TIMEFRAME[targetColumnId] : card.timeFrame
          };
        }
        return card;
      })
    };
    await saveBoard(newState);
  };

  // Filter Logic
  const filteredCards = useMemo(() => {
    if (!boardState) return [];
    let cards = [...boardState.cards];

    if (filterState.columns.length > 0) cards = cards.filter(c => filterState.columns.includes(c.columnId));
    if (filterState.userId) {
      if (filterState.userId === 'UNASSIGNED') cards = cards.filter(c => !c.authorId);
      else cards = cards.filter(c => c.authorId === filterState.userId);
    }
    if (filterState.minLikes > 0) {
      cards = cards.filter(c => Object.values(c.votes || {}).filter(v => v > 0).length >= filterState.minLikes);
    }
    if (filterState.searchText.trim()) {
      const results = aStarTextSearch(filterState.searchText, cards.map(c => ({ id: c.id, title: c.content })));
      const ids = new Set(results.map(r => r.taskId));
      cards = cards.filter(c => ids.has(c.id));
    }
    return cards;
  }, [boardState, filterState]);

  // Linking Helpers
  const getLinkedCardIds = useCallback((sourceId: string): Set<string> => {
    if (!boardState) return new Set();
    const visited = new Set<string>();
    const toVisit = [sourceId];

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
    visited.delete(sourceId); // Remove self
    return visited;
  }, [boardState]);

  const toggleLinkCards = async (sourceId: string, targetId: string) => {
    if (!boardState) return;
    const card1 = boardState.cards.find(c => c.id === sourceId);
    const card2 = boardState.cards.find(c => c.id === targetId);
    if (!card1 || !card2) return;

    const card1Links = card1.linkedCardIds || [];
    const card2Links = card2.linkedCardIds || [];
    // Check if linked in EITHER direction to be safe, but usually just check source
    const isLinked = card1Links.includes(targetId);

    const newCards = boardState.cards.map(c => {
      if (c.id === sourceId) {
        return {
          ...c,
          linkedCardIds: isLinked ? card1Links.filter(id => id !== targetId) : [...card1Links, targetId]
        };
      }
      if (c.id === targetId) {
        return {
          ...c,
          linkedCardIds: isLinked ? card2Links.filter(id => id !== sourceId) : [...card2Links, sourceId]
        };
      }
      return c;
    });

    const newState = { ...boardState, cards: newCards };
    await saveBoard(newState);
  };

  // Promotion Helpers
  const openPromoteDialog = (card: DreamCard) => {
    setCardToPromote(card);
    setPromoteDialogOpen(true);
  };



  // Link Visualization Logic
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

      // Calculate path (simplified logic from FertilizationView)
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
  }, [linkingCardId, boardState, getLinkedCardIds]); // include getLinkedCardIds

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


  const promoteToBacklog = () => {
    if (cardToPromote && onPromoteToKanban) {
      onPromoteToKanban(cardToPromote.id);
      setPromoteDialogOpen(false);
      setCardToPromote(null);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!boardState) return <div>Error loading board</div>;

  // Card Sorting specific to DreamView
  const getSortedCardsForColumn = (columnId: string) => {
    let cardsInColumn: DreamCard[] = [];

    if (boardState.isTimelineExpanded) {
      // In expanded, distribute by timeframe
      // Iterate all filtered cards, if card timeframe matches column's timeframe, add it
      // BUT only if the card is in 'dreams' conceptual column (which they all are)
      cardsInColumn = filteredCards.filter(c => {
        if (c.columnId !== 'dreams') return false; // Should not happen in Dreams view usually
        return TIMEFRAME_TO_COLUMN[c.timeFrame] === columnId;
      });
    } else {
      // Normal mode: check native columnId
      cardsInColumn = filteredCards.filter(c => c.columnId === columnId);

      // Sort by timeframe if Dreams column
      if (columnId === 'dreams') {
        cardsInColumn.sort((a, b) => {
          const orderA = TIME_FRAME_ORDER[a.timeFrame];
          const orderB = TIME_FRAME_ORDER[b.timeFrame];
          return boardState.timeSortDirection === 'nearest' ? orderA - orderB : orderB - orderA;
        });
      }
    }
    return cardsInColumn;
  };


  if (!boardState?.isSessionActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <h2 className="text-2xl font-bold">Dream Mode</h2>
        <p className="text-muted-foreground">No moderator active. Start a session to become the moderator.</p>
        <Button onClick={startSession}>Start Session</Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
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
          title="Dream Mode"
          titleContent={
            boardState?.votingMode === 'POINTS' && boardState.votingPhase === 'VOTING' && (
              <div className="text-sm font-normal px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-primary">
                Budget: <span className="font-bold">{calculateUserUsedPoints(currentUserId)}</span> / {boardState.maxPointsPerUser || 10} pts
              </div>
            )
          }
          filterState={filterState}
          onFilterChange={setFilterState}
          columnOptions={boardState.columns.map(c => ({ label: c.title, value: c.id }))}
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

                  <Button variant="outline" size="sm" onClick={() => {
                    const newState = { ...boardState, hiddenEdition: !boardState.hiddenEdition };
                    saveBoard(newState);
                  }}>
                    {boardState.hiddenEdition ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {boardState.hiddenEdition ? 'Hidden Mode' : 'Visible Mode'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (confirm('Are you sure you want to restart the session? This will clear all cards.')) {
                      const newState = {
                        ...boardState,
                        isSessionActive: false,
                        moderatorId: null,
                        cards: [],
                        columns: DEFAULT_DREAM_COLUMNS,
                        timer: null,
                        votingPhase: 'IDLE' as VotingPhase,
                        areCursorsVisible: true
                      };
                      saveBoard(newState);
                    }
                  }}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Restart Session
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const newState = { ...boardState, areCursorsVisible: !boardState.areCursorsVisible };
                    saveBoard(newState);
                    // Force dispatch to ensure immediate UI update
                    const event = new CustomEvent('setCursorVisibility', { detail: { visible: newState.areCursorsVisible } });
                    window.dispatchEvent(event);
                  }}>
                    {boardState.areCursorsVisible ? <MousePointer2 className="mr-2 h-4 w-4" /> : <MousePointerClick className="mr-2 h-4 w-4 text-muted-foreground" />}
                    {boardState.areCursorsVisible ? 'Hide Cursors' : 'Show Cursors'}
                  </Button>

                  <Button variant={boardState.showAllLinks ? "secondary" : "outline"} size="sm" onClick={() => {
                    const newState = { ...boardState, showAllLinks: !boardState.showAllLinks };
                    saveBoard(newState);
                  }}>
                    {boardState.showAllLinks ? <Unlink className="mr-2 h-4 w-4" /> : <Link className="mr-2 h-4 w-4" />}
                    {boardState.showAllLinks ? 'Hide Links' : 'Show Links'}
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

              {boardState.moderatorId !== currentUserId && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (confirm('Become moderator?')) {
                    const newState = { ...boardState, moderatorId: currentUserId };
                    saveBoard(newState);
                  }
                }}>Become Moderator</Button>
              )}
            </>
          }
          customControls={
            <>
              {isModerator && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium mr-1">Voting:</span>
                  <Select value={boardState.votingMode} onValueChange={(val: VotingMode) => saveBoard({ ...boardState!, votingMode: val, votingPhase: 'IDLE' as VotingPhase })} disabled={boardState.votingPhase !== 'IDLE'}>
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
                  {boardState.votingPhase === 'VOTING' && (<Button size="sm" variant="secondary" onClick={() => saveBoard({ ...boardState!, votingPhase: 'IDLE' as VotingPhase })}><Square className="h-3 w-3 mr-1" /> Stop Voting</Button>)}
                  {boardState.votingPhase !== 'REVEALED' && (<Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState!, votingPhase: 'REVEALED' as VotingPhase })}><Eye className="h-3 w-3 mr-1" /> Reveal Votes</Button>)}
                  {boardState.votingPhase === 'REVEALED' && (<Button size="sm" variant="outline" onClick={() => saveBoard({ ...boardState!, votingPhase: 'IDLE' as VotingPhase })}><RotateCcw className="h-3 w-3 mr-1" /> Continue Voting</Button>)}
                </div>
              )}
            </>
          }
        />

        {/* Linking mode banner */}
        {linkingCardId && (
          <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-3 flex items-center justify-between mb-2 mx-4">
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
        )}

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
          {boardState.columns.map(column => {
            // Determine width class
            // Determine width class
            let widthClass = "min-w-[300px] w-1/5";
            if (boardState.isTimelineExpanded) {
              widthClass = "min-w-[300px] w-1/5"; // All equal in expanded
            }

            // Header action for Dreams column (Timeline toggle)
            let headerActions = null;
            if (column.id === 'dreams') {
              headerActions = (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={toggleTimelineExpansion}
                  title={boardState.isTimelineExpanded ? "Collapse Timeline" : "Expand Timeline"}
                >
                  {boardState.isTimelineExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
              );
            }

            // When timeline is expanded, change column titles to time frame labels, unlock them, and set generic color
            const displayColumn = boardState.isTimelineExpanded && COLUMN_TO_TIMEFRAME[column.id]
              ? {
                ...column,
                title: TIME_FRAME_LABELS[COLUMN_TO_TIMEFRAME[column.id]],
                isLocked: false,
                color: '#FFFFFF'
              }
              : column;

            return (
              <BoardColumn
                key={column.id}
                column={displayColumn}
                cards={getSortedCardsForColumn(column.id)}
                activeColumnId={activeColumnId}
                onSetActiveColumnId={setActiveColumnId}
                onAddCard={(content, anonymous) => addCard(content, anonymous)}
                isModerator={!!isModerator}
                onToggleLock={boardState.isTimelineExpanded && COLUMN_TO_TIMEFRAME[column.id] ? undefined : () => toggleLock(column.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
                headerActions={headerActions}
                onChangeColor={async (color) => {
                  const newColumns = boardState.columns.map(c => c.id === column.id ? { ...c, color } : c);
                  const newState = { ...boardState, columns: newColumns };
                  setBoardState(newState);
                  await saveBoard(newState);
                }}
                isEditingTitle={false} // Dream headers are static for now or add logic
                // ... pass other necessary props
                renderCard={(card) => (
                  <CardView
                    card={card}
                    tags={(!boardState.isTimelineExpanded && card.columnId === 'dreams') ? [{
                      label: TIME_FRAME_LABELS[card.timeFrame],
                      // Determine color based on timeFrame -> column mapping
                      className: (() => {
                        const colId = TIMEFRAME_TO_COLUMN[card.timeFrame];
                        // Fallback classes if logic fails.
                        if (colId === 'dreams') return "bg-white text-black border border-gray-200";
                        if (colId === 'strengths') return "bg-yellow-400 text-black";
                        if (colId === 'threats') return "bg-black text-white";
                        if (colId === 'levers') return "bg-green-400 text-black";
                        if (colId === 'priorities') return "bg-blue-400 text-white";
                        return "bg-secondary text-secondary-foreground";
                      })(),
                      icon: <Clock className="h-3 w-3" />
                    }] : []}
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
            );
          })}
        </div>
      </BoardLayout >
    </div >
  );
};