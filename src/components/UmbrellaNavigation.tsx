import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewNavigation } from '@/hooks/useView';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useTasks } from '@/hooks/useTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { aStarTextSearch } from '@/lib/a-star-search';
import { cn } from '@/lib/utils';
import type { ViewType } from '@/context/ViewContextDefinition';
import type { ModuleId } from '@/lib/persistence-types';
import {
  X,
  PartyPopper,
  Sparkles,
  CircleDot,
  LayoutDashboard,
  ListChecks,
  Clock,
  BarChart3,
  Settings,
  Calendar,
  Users,
  ShieldCheck,
  Target,
  Vote,
  Wallet,
  Search,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface UmbrellaNavigationProps {
  open: boolean;
  onClose: () => void;
  onFocusOnTask?: (taskId: string) => void;
}

interface SubView {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  view: string;
  subView?: string;
}

interface Section {
  id: string;
  labelKey: string;
  colorClass: string;
  hoverClass: string;
  textClass: string;
  icon: React.ReactNode;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  views: SubView[];
}

const SECTIONS: Section[] = [
  {
    id: 'celebration',
    labelKey: 'nav.celebration',
    colorClass: 'bg-green-500/90',
    hoverClass: 'hover:bg-green-400',
    textClass: 'text-white',
    icon: <PartyPopper className="w-5 h-5" />,
    position: 'top-left',
    views: [
      { id: 'fertilization', labelKey: 'nav.fertilizationBoard', icon: <PartyPopper className="w-3 h-3" />, view: 'celebration' },
    ],
  },
  {
    id: 'dream',
    labelKey: 'nav.dream',
    colorClass: 'bg-blue-500/90',
    hoverClass: 'hover:bg-blue-400',
    textClass: 'text-white',
    icon: <Sparkles className="w-5 h-5" />,
    position: 'bottom-left',
    views: [
      { id: 'intentional-framework', labelKey: 'nav.intention', icon: <Target className="w-3 h-3" />, view: 'dream', subView: 'intentionalFramework' },
      { id: 'collaborative-framework', labelKey: 'nav.collaboration', icon: <Users className="w-3 h-3" />, view: 'dream', subView: 'collaborativeFramework' },
      { id: 'dream-board', labelKey: 'nav.dreamBoard', icon: <Sparkles className="w-3 h-3" />, view: 'dream', subView: 'dream' },
      { id: 'storyboard', labelKey: 'nav.storyboard', icon: <LayoutDashboard className="w-3 h-3" />, view: 'dream', subView: 'storyboard' },
      { id: 'prioritization', labelKey: 'nav.prioritization', icon: <ListChecks className="w-3 h-3" />, view: 'dream', subView: 'prioritization' },
    ],
  },
  {
    id: 'plan',
    labelKey: 'nav.plan',
    colorClass: 'bg-orange-500/90',
    hoverClass: 'hover:bg-orange-400',
    textClass: 'text-white',
    icon: <CircleDot className="w-5 h-5" />,
    position: 'bottom-right',
    views: [
      { id: 'program', labelKey: 'nav.program', icon: <Calendar className="w-3 h-3" />, view: 'program', subView: 'calendar' },
      { id: 'resources', labelKey: 'nav.resources', icon: <Users className="w-3 h-3" />, view: 'program', subView: 'resources' },
      { id: 'circles', labelKey: 'nav.circles', icon: <Users className="w-3 h-3" />, view: 'plan', subView: 'circles' },
      { id: 'roles', labelKey: 'nav.roles', icon: <ShieldCheck className="w-3 h-3" />, view: 'plan', subView: 'roles' },
      { id: 'salary', labelKey: 'nav.salarySystem', icon: <Wallet className="w-3 h-3" />, view: 'plan', subView: 'salary' },
    ],
  },
  {
    id: 'action',
    labelKey: 'nav.action',
    colorClass: 'bg-red-500/90',
    hoverClass: 'hover:bg-red-400',
    textClass: 'text-white',
    icon: <ListChecks className="w-5 h-5" />,
    position: 'top-right',
    views: [
      { id: 'kanban', labelKey: 'nav.project', icon: <LayoutDashboard className="w-3 h-3" />, view: 'kanban' },
      { id: 'focus', labelKey: 'nav.focus', icon: <ListChecks className="w-3 h-3" />, view: 'focus' },
    ],
  },
];

const CENTER_VIEWS: SubView[] = [
  { id: 'timetable', labelKey: 'nav.timetable', icon: <Clock className="w-3 h-3" />, view: 'timetable' },
  { id: 'voting', labelKey: 'nav.voting', icon: <Vote className="w-3 h-3" />, view: 'voting' },
  { id: 'metrics', labelKey: 'nav.metrics', icon: <BarChart3 className="w-3 h-3" />, view: 'metrics' },
  { id: 'settings', labelKey: 'nav.settings', icon: <Settings className="w-3 h-3" />, view: 'settings' },
];

const CENTER_SECTION: Section = {
  id: 'tools',
  labelKey: 'nav.tools',
  colorClass: 'bg-gray-600/90',
  hoverClass: 'hover:bg-gray-500',
  textClass: 'text-white',
  icon: <Settings className="w-5 h-5" />,
  position: 'center',
  views: CENTER_VIEWS,
};

type QuarterKey = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface QuarterConfig {
  /** Tailwind positional classes (left/right/top/bottom) */
  posClasses: string;
  /** Clip-path origin as % inside the quarter square */
  clip: { x: number; y: number };
  /** Flexbox alignment when hovered (nearest corner to circle center) */
  align: string;
  /** Tailwind padding when hovered (inset from outer edges) */
  pad: string;
  /** Static margin that nudges the expanded block outward from the inner corner */
  margin: string;
}

const QUARTER_CONFIG: Record<QuarterKey, QuarterConfig> = {
  'top-left': {
    posClasses: 'left-0 top-0',
    clip: { x: 100, y: 100 },
    align: 'items-end justify-end',
    pad: 'pt-4 pl-4',
    margin: 'mb-5 mr-5',
  },
  'top-right': {
    posClasses: 'right-0 top-0',
    clip: { x: 0, y: 100 },
    align: 'items-start justify-end',
    pad: 'pt-4 pr-4',
    margin: 'mb-5 ml-5',
  },
  'bottom-left': {
    posClasses: 'left-0 bottom-0',
    clip: { x: 100, y: 0 },
    align: 'items-end justify-start',
    pad: 'pb-4 pl-4',
    margin: 'mt-5 mr-5',
  },
  'bottom-right': {
    posClasses: 'right-0 bottom-0',
    clip: { x: 0, y: 0 },
    align: 'items-start justify-start',
    pad: 'pb-4 pr-4',
    margin: 'mt-5 ml-5',
  },
};

export const UmbrellaNavigation: React.FC<UmbrellaNavigationProps> = ({ open, onClose, onFocusOnTask }) => {
  const { t } = useTranslation();
  const { navigateTo, disabledModules } = useViewNavigation();
  const [hovered, setHovered] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Scratch search bar
  const { tasks } = useAllTasks();
  const { createTask } = useTasks();
  const { userId: currentUserId } = useUserSettings();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return aStarTextSearch(q, tasks.map(t => ({ id: t.id, title: t.title })))
      .slice(0, 6)
      .map(r => {
        const task = tasks.find(t => t.id === r.taskId);
        return task ? { task, score: r.score } : null;
      })
      .filter((r): r is { task: typeof tasks[number]; score: number } => r !== null);
  }, [query, tasks]);

  const canCreate = query.trim().length > 0 && searchResults.every(r => r.task.title.toLowerCase() !== query.trim().toLowerCase());

  const handleSearchSubmit = useCallback(async () => {
    if (searchResults.length > 0 && activeIndex >= 0 && activeIndex < searchResults.length) {
      const target = searchResults[activeIndex].task;
      if (onFocusOnTask) {
        onFocusOnTask(target.id);
      } else {
        navigateTo('focus' as ViewType);
      }
      onClose();
      setQuery('');
      setActiveIndex(0);
      return;
    }
    if (canCreate) {
      await createTask(query.trim(), null, currentUserId || undefined);
      onClose();
      setQuery('');
      setActiveIndex(0);
    }
  }, [searchResults, activeIndex, canCreate, query, createTask, currentUserId, onFocusOnTask, navigateTo, onClose]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = canCreate ? searchResults.length : searchResults.length - 1;
      setActiveIndex(i => Math.min(i + 1, max < 0 ? 0 : max));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setActiveIndex(0);
    }
  };

  const isModuleDisabled = useCallback((view: string, subView?: string): boolean => {
    if (subView) {
      const moduleId = `${view}.${subView}` as ModuleId;
      return disabledModules.includes(moduleId) || disabledModules.includes(view as ModuleId);
    }
    return disabledModules.includes(view as ModuleId);
  }, [disabledModules]);

  const filteredSections = useMemo(() =>
    SECTIONS.map(section => ({
      ...section,
      views: section.views.filter(v => !isModuleDisabled(v.view, v.subView)),
    })).filter(section => section.views.length > 0),
  [isModuleDisabled]);

  const filteredCenterViews = useMemo(() =>
    CENTER_VIEWS.filter(v => !isModuleDisabled(v.view)),
  [isModuleDisabled]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setHovered(null);
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleNavigate = (view: string, subView?: string) => {
    navigateTo(view as ViewType, subView);
    onClose();
  };

  const handleSectionEnter = (id: string) => setHovered(id);
  const handleMenuLeave = () => setHovered(null);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={t('nav.navigationMenu')}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 transition-opacity duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col items-center gap-6"
        onMouseLeave={handleMenuLeave}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-14 right-0 text-white/80 hover:text-white transition-colors"
          aria-label={t('nav.closeNavigation')}
        >
          <X className="w-8 h-8" />
        </button>

        {/* Scratch search bar */}
        <div className="w-80 max-w-[90vw]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('nav.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-background/95 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-lg"
              aria-label={t('nav.searchPlaceholder')}
            />
          </div>
          {query.trim() && (searchResults.length > 0 || canCreate) && (
            <div className="mt-1.5 w-full rounded-md border border-border bg-popover/95 shadow-lg overflow-hidden">
              {searchResults.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('nav.searchResults')}
                  </div>
                  {searchResults.map((r, i) => (
                    <button
                      key={r.task.id}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={handleSearchSubmit}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-sm transition-colors',
                        i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                      )}
                    >
                      <span className="flex-1 truncate">{r.task.title}</span>
                      <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              {canCreate && (
                <div className="p-1 border-t border-border">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('nav.scratchHint')}
                  </div>
                  <button
                    onMouseEnter={() => setActiveIndex(searchResults.length)}
                    onClick={handleSearchSubmit}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-sm transition-colors',
                      activeIndex === searchResults.length ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    )}
                  >
                    <Plus className="w-3 h-3 shrink-0 text-primary" />
                    <span className="flex-1 truncate font-medium">{t('nav.createTask')}: "{query.trim()}"</span>
                  </button>
                </div>
              )}
            </div>
          )}
          {query.trim() && searchResults.length === 0 && !canCreate && (
            <div className="mt-1.5 w-full rounded-md border border-border bg-popover/95 shadow-lg px-3 py-2 text-sm text-muted-foreground">
              {t('nav.searchEmpty')}
            </div>
          )}
        </div>

        {/* Circle Menu – no overflow-hidden so expanded clip-path can spill out */}
        <div className="relative w-80 h-80 rounded-full">
          {/* Decorative ring showing the conceptual circle boundary */}
          <div className="absolute inset-0 rounded-full border-4 border-white/10 pointer-events-none z-50" />

          {/* Quarters */}
          {filteredSections.map((section) => {
            const q = QUARTER_CONFIG[section.position as QuarterKey];
            const isHovered = hovered === section.id;
            const isDimmed = hovered && hovered !== section.id;
            const alignClasses = isHovered ? q.align : 'items-center justify-center';
            const padClasses = isHovered ? q.pad : '';

            return (
              <div
                key={section.id}
                className={cn(
                  'absolute w-1/2 h-1/2 flex flex-col cursor-pointer transition-all duration-300 ease-out select-none',
                  q.posClasses,
                  isHovered && 'z-40',
                  isDimmed && 'opacity-40',
                )}
                onMouseEnter={() => handleSectionEnter(section.id)}
                onClick={() => {
                  if (section.views.length === 1) {
                    const v = section.views[0];
                    handleNavigate(v.view, v.subView);
                  } else {
                    handleSectionEnter(section.id);
                  }
                }}
              >
                {/* Background layer – clipped to the quarter circle, always visible */}
                <div
                  className={cn(
                    'absolute inset-0 transition-all duration-300',
                    section.colorClass,
                    section.hoverClass,
                  )}
                  style={{
                    clipPath: `circle(100% at ${q.clip.x}% ${q.clip.y}%)`,
                    willChange: 'clip-path',
                  }}
                />

                {/* Content layer – unclipped, transparent */}
                <div
                  className={cn(
                    'relative z-10 w-full h-full flex flex-col transition-all duration-200',
                    alignClasses,
                    padClasses,
                  )}
                >
                  {/* Default compact label */}
                  <div
                    className={cn(
                      'flex flex-col items-center gap-1 w-full',
                      section.textClass,
                      isHovered ? 'opacity-0 absolute pointer-events-none' : 'opacity-100',
                    )}
                  >
                    {section.icon}
                    <span className="text-sm font-semibold">{t(section.labelKey)}</span>
                  </div>

                  {/* Expanded content – anchored at inner corner, nudged outward with margin */}
                  <div
                    className={cn(
                      'flex flex-col gap-2 w-full transition-all duration-200',
                      isHovered ? `opacity-100 relative ${q.margin}` : 'opacity-0 absolute pointer-events-none',
                    )}
                  >
                    <div className={cn('flex items-center gap-1.5', section.textClass)}>
                      {section.icon}
                      <span className="text-sm font-bold">{t(section.labelKey)}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      {section.views.map((v) => (
                        <button
                          key={v.id}
                          className="flex items-center justify-center gap-1.5 bg-white/90 text-gray-900 rounded-md px-2 py-1.5 text-[11px] font-medium shadow hover:bg-white transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigate(v.view, v.subView);
                          }}
                        >
                          {v.icon}
                          <span>{t(v.labelKey)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Inner circle (Tools) */}
          {filteredCenterViews.length > 0 && (
          <div
            className={cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300 z-30 border-4 border-white/20',
              CENTER_SECTION.colorClass,
              CENTER_SECTION.hoverClass,
              hovered === 'tools' && 'scale-[1.35] brightness-110 z-40',
              hovered && hovered !== 'tools' && 'opacity-40',
            )}
            onMouseEnter={() => handleSectionEnter('tools')}
            onClick={() => handleSectionEnter('tools')}
          >
            {/* Default label */}
            <div
              className={cn(
                'flex flex-col items-center gap-1 transition-all duration-200 w-full',
                CENTER_SECTION.textClass,
                hovered === 'tools' ? 'opacity-0 absolute pointer-events-none' : 'opacity-100 relative',
              )}
            >
              {CENTER_SECTION.icon}
              <span className="text-xs font-semibold">{t(CENTER_SECTION.labelKey)}</span>
            </div>

            {/* Expanded content */}
            <div
              className={cn(
                'flex flex-col items-center gap-2 w-full transition-all duration-200',
                hovered === 'tools' ? 'opacity-100 relative' : 'opacity-0 absolute pointer-events-none',
              )}
            >
              <div className={cn('flex items-center gap-1', CENTER_SECTION.textClass)}>
                {CENTER_SECTION.icon}
                <span className="text-xs font-bold">{t(CENTER_SECTION.labelKey)}</span>
              </div>
              <div className="flex flex-col gap-1.5 w-full">
                {filteredCenterViews.map((v) => (
                  <button
                    key={v.id}
                    className="flex items-center justify-center gap-1 bg-white/90 text-gray-900 rounded-md px-2 py-1.5 text-[8px] font-medium shadow hover:bg-white transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigate(v.view, v.subView);
                    }}
                  >
                    {v.icon}
                    <span>{t(v.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UmbrellaNavigation;
