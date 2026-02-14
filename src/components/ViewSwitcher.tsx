import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import {
  ListChecks,
  Calendar,
  BarChart3,
  Settings,
  Clock,
  LayoutDashboard,
  CircleDot,
  PartyPopper,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { useCursors } from '@/hooks/useCursors';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ViewId = "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "plan" | "dream" | "celebration";

interface ViewSwitcherProps {
  value: ViewId;
  onChange: (view: ViewId) => void;
  /** Items that sit in the pill bar after utility views (e.g. NotificationCenter, UserSection) */
  utilityItems?: React.ReactNode;
  /** Items that always stay visible in the right section (e.g. CompactnessSelector) */
  rightItems?: React.ReactNode;
}

interface ViewOption {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
  isUtility?: boolean;
}

type ColorCategory = 'green' | 'blue' | 'orange' | 'red';

const COLOR_MAP: Record<ViewId, ColorCategory> = {
  celebration: 'green',
  dream: 'blue',
  plan: 'orange',
  program: 'red',
  kanban: 'red',
  focus: 'red',
  metrics: 'red',
  timetable: 'red',
  settings: 'red',
};

const COLOR_CLASSES: Record<ColorCategory, { active: string; inactive: string }> = {
  green: {
    active: 'bg-green-600 text-white hover:bg-green-700 hover:text-white shadow-sm',
    inactive: 'text-green-700 hover:bg-green-50',
  },
  blue: {
    active: 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white shadow-sm',
    inactive: 'text-blue-700 hover:bg-blue-50',
  },
  orange: {
    active: 'bg-orange-500 text-white hover:bg-orange-600 hover:text-white shadow-sm',
    inactive: 'text-orange-700 hover:bg-orange-50',
  },
  red: {
    active: 'bg-red-600 text-white hover:bg-red-700 hover:text-white shadow-sm',
    inactive: 'text-red-700 hover:bg-red-50',
  },
};

// All navigation views — main colored pills first, then utility (always icon-only)
const allViews: ViewOption[] = [
  { id: 'celebration', label: 'Celebration', icon: <PartyPopper className="w-4 h-4" /> },
  { id: 'dream', label: 'Dream', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'plan', label: 'Plan', icon: <CircleDot className="w-4 h-4" /> },
  { id: 'program', label: 'Program', icon: <Calendar className="w-4 h-4" /> },
  { id: 'kanban', label: 'Project', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'focus', label: 'Focus', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'timetable', label: 'Timetable', icon: <Clock className="w-4 h-4" />, isUtility: true },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, isUtility: true },
];

const MAIN_COUNT = allViews.filter(v => !v.isUtility).length; // 7

type DisplayMode = 'full' | 'compact' | 'overflow';

// Approximate widths for calculating fit
const ITEM_FULL_WIDTH = 110;   // icon + text pill
const ITEM_COMPACT_WIDTH = 40;    // icon-only pill
const OVERFLOW_BTN_WIDTH = 40;    // three dots button
const UTILITY_ITEMS_WIDTH = 100;  // approximate width for notification bell + user avatar
const GAP = 16;                   // flex gap

export function ViewSwitcher({ value, onChange, utilityItems, rightItems }: ViewSwitcherProps) {
  const cursors = useCursors();
  const containerRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('full');
  const [visibleCount, setVisibleCount] = useState(allViews.length);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const userCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Array.from(cursors.values()).forEach(state => {
      if (state.view) {
        counts[state.view] = (counts[state.view] || 0) + 1;
      }
    });
    return counts;
  }, [cursors]);

  const calculateLayout = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const rightWidth = rightRef.current?.offsetWidth || 0;
    const logoWidth = logoRef.current?.offsetWidth || 0;
    // Available space for the pill bar (including potential overflow button)
    const availableForPills = containerWidth - logoWidth - rightWidth - GAP * 2;

    // Account for utilityItems (NotificationCenter, UserSection) in the pill bar
    const extraWidth = utilityItems ? UTILITY_ITEMS_WIDTH : 0;

    // Try full mode: main views get icon + text, utility views are always icon-only
    const utilCount = allViews.length - MAIN_COUNT;
    const fullWidth = MAIN_COUNT * ITEM_FULL_WIDTH + utilCount * ITEM_COMPACT_WIDTH + extraWidth;
    if (fullWidth <= availableForPills) {
      setDisplayMode('full');
      setVisibleCount(allViews.length);
      return;
    }

    // Try compact mode: all views icon-only
    const compactWidth = allViews.length * ITEM_COMPACT_WIDTH + extraWidth;
    if (compactWidth <= availableForPills) {
      setDisplayMode('compact');
      setVisibleCount(allViews.length);
      return;
    }

    // Overflow mode: show as many compact items as fit, rest in ⋯ dropdown
    setDisplayMode('overflow');
    const availableForItems = availableForPills - OVERFLOW_BTN_WIDTH;
    const fitCount = Math.max(1, Math.floor(availableForItems / ITEM_COMPACT_WIDTH));
    setVisibleCount(Math.min(fitCount, allViews.length));
  }, []);

  useEffect(() => {
    calculateLayout();
    const observer = new ResizeObserver(calculateLayout);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [calculateLayout]);

  // Split all views into visible and overflow
  let visibleViews = allViews.slice(0, visibleCount);
  let overflowViews = displayMode === 'overflow' ? allViews.slice(visibleCount) : [];

  // Ensure active view is always visible — swap it in if it overflowed
  const activeInOverflow = overflowViews.find(v => v.id === value);
  if (activeInOverflow && visibleViews.length > 0) {
    const lastVisible = visibleViews[visibleViews.length - 1];
    visibleViews = [...visibleViews.slice(0, -1), activeInOverflow];
    overflowViews = [lastVisible, ...overflowViews.filter(v => v.id !== value)];
  }

  const renderPillButton = (view: ViewOption, forceCompact = false) => {
    const isActive = value === view.id;
    const isCompact = forceCompact || displayMode !== 'full' || view.isUtility;

    // Utility views use neutral dark gray, main views use Dragon Dreaming colors
    let classes: string;
    if (view.isUtility) {
      classes = isActive ? 'bg-gray-700 text-white hover:bg-gray-800 hover:text-white shadow-sm' : 'text-muted-foreground hover:bg-gray-100';
    } else {
      const color = COLOR_MAP[view.id];
      classes = isActive ? COLOR_CLASSES[color].active : COLOR_CLASSES[color].inactive;
    }

    const button = (
      <Button
        key={view.id}
        variant="ghost"
        size={isCompact ? 'icon' : 'sm'}
        className={cn(
          "relative",
          isCompact ? 'h-8 w-8' : 'flex items-center gap-2',
          classes
        )}
        onClick={() => onChange(view.id)}
      >
        {view.icon}
        {!isCompact && view.label}
        {!isCompact && userCounts[view.id] > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              "ml-1 px-1.5 py-0 h-5 min-w-[1.25rem] flex items-center justify-center text-[10px]",
              isActive ? "bg-white/25 text-white hover:bg-white/35" : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {userCounts[view.id]}
          </Badge>
        )}
        {isCompact && userCounts[view.id] > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 px-1 py-0 h-4 min-w-[1rem] flex items-center justify-center text-[9px] bg-primary/10 text-primary"
          >
            {userCounts[view.id]}
          </Badge>
        )}
      </Button>
    );

    if (isCompact) {
      return (
        <Tooltip key={view.id}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {view.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const renderOverflowItem = (view: ViewOption) => {
    const isActive = value === view.id;

    // Determine active style for overflow items
    let activeClasses: string;
    if (view.isUtility) {
      activeClasses = 'bg-gray-700 text-white hover:bg-gray-800 hover:text-white shadow-sm';
    } else {
      const color = COLOR_MAP[view.id];
      activeClasses = COLOR_CLASSES[color].active;
    }

    return (
      <button
        key={view.id}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors",
          isActive
            ? `${activeClasses} rounded-md`
            : "hover:bg-gray-100 text-gray-700"
        )}
        onClick={() => {
          onChange(view.id);
          setOverflowOpen(false);
        }}
      >
        {view.icon}
        <span>{view.label}</span>
        {userCounts[view.id] > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              "ml-auto px-1.5 py-0 h-5 min-w-[1.25rem] flex items-center justify-center text-[10px]",
              isActive ? "bg-white/25 text-white" : "bg-primary/10 text-primary"
            )}
          >
            {userCounts[view.id]}
          </Badge>
        )}
      </button>
    );
  };




  // Split visible views into main and utility for rendering with a divider
  const visibleMainViews = visibleViews.filter(v => !v.isUtility);
  const visibleUtilViews = visibleViews.filter(v => v.isUtility);

  // Show utilityItems (NotificationCenter, UserSection) inline when no overflow
  const showUtilityItemsInline = displayMode !== 'overflow';

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-4 w-full">
      {/* Logo */}
      <div ref={logoRef} className="flex items-center shrink-0">
        <img
          src={`${import.meta.env.BASE_URL}P3Fo_Logo.png`}
          alt="P3Fo Logo"
          className="h-10 w-auto"
        />
      </div>

      {/* Pill bar: view buttons only */}
      <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg items-center">
        {visibleMainViews.map(view => renderPillButton(view))}

        {/* Divider between main and utility views */}
        {visibleUtilViews.length > 0 && visibleMainViews.length > 0 && (
          <div className="w-px h-5 bg-gray-300 mx-0.5" />
        )}

        {/* Utility views (always icon-only, inside the pill bar) */}
        {visibleUtilViews.map(view => renderPillButton(view, true))}

        {/* Overflow ⋯ button inside the pill bar */}
        {overflowViews.length > 0 && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:bg-gray-200"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-52 p-1"
            >
              <div className="flex flex-col gap-0.5">
                {overflowViews.map(view => renderOverflowItem(view))}
                {/* Utility items in overflow dropdown */}
                {utilityItems && (
                  <>
                    <div className="h-px bg-gray-200 my-1" />
                    <div className="flex items-center gap-2 px-3 py-2">
                      {utilityItems}
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Utility items on white background — NotificationCenter, UserSection */}
      {showUtilityItemsInline && utilityItems && (
        <div className="flex items-center gap-1 shrink min-w-0">
          {utilityItems}
        </div>
      )}

      {/* Right section: always visible (e.g. CompactnessSelector) */}
      <div ref={rightRef} className="flex items-center gap-2 ml-auto">
        {rightItems}
      </div>
    </div>
  );
}

// Backward-compatible stub (no longer used)
export function ViewSwitcherUtilities() {
  return null;
}