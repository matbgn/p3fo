import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useViewNavigation } from '@/hooks/useView';
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
} from 'lucide-react';

interface UmbrellaNavigationProps {
  open: boolean;
  onClose: () => void;
}

interface SubView {
  id: string;
  label: string;
  icon: React.ReactNode;
  view: string;
  subView?: string;
}

interface Section {
  id: string;
  label: string;
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
    label: 'Celebration',
    colorClass: 'bg-green-500/90',
    hoverClass: 'hover:bg-green-400',
    textClass: 'text-white',
    icon: <PartyPopper className="w-5 h-5" />,
    position: 'top-left',
    views: [
      { id: 'fertilization', label: 'Fertilization Board', icon: <PartyPopper className="w-3 h-3" />, view: 'celebration' },
    ],
  },
  {
    id: 'dream',
    label: 'Dream',
    colorClass: 'bg-blue-500/90',
    hoverClass: 'hover:bg-blue-400',
    textClass: 'text-white',
    icon: <Sparkles className="w-5 h-5" />,
    position: 'bottom-left',
    views: [
      { id: 'intentional-framework', label: 'Intention', icon: <Target className="w-3 h-3" />, view: 'dream', subView: 'intentionalFramework' },
      { id: 'collaborative-framework', label: 'Collaboration', icon: <Users className="w-3 h-3" />, view: 'dream', subView: 'collaborativeFramework' },
      { id: 'dream-board', label: 'Dream Board', icon: <Sparkles className="w-3 h-3" />, view: 'dream', subView: 'dream' },
      { id: 'storyboard', label: 'Storyboard', icon: <LayoutDashboard className="w-3 h-3" />, view: 'dream', subView: 'storyboard' },
      { id: 'prioritization', label: 'Prioritization', icon: <ListChecks className="w-3 h-3" />, view: 'dream', subView: 'prioritization' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    colorClass: 'bg-orange-500/90',
    hoverClass: 'hover:bg-orange-400',
    textClass: 'text-white',
    icon: <CircleDot className="w-5 h-5" />,
    position: 'bottom-right',
    views: [
      { id: 'program', label: 'Program', icon: <Calendar className="w-3 h-3" />, view: 'program', subView: 'calendar' },
      { id: 'resources', label: 'Resources', icon: <Users className="w-3 h-3" />, view: 'program', subView: 'resources' },
      { id: 'circles', label: 'Circles', icon: <Users className="w-3 h-3" />, view: 'plan', subView: 'circles' },
      { id: 'roles', label: 'Roles', icon: <ShieldCheck className="w-3 h-3" />, view: 'plan', subView: 'roles' },
      { id: 'salary', label: 'Salary System', icon: <Wallet className="w-3 h-3" />, view: 'plan', subView: 'salary' },
    ],
  },
  {
    id: 'action',
    label: 'Action',
    colorClass: 'bg-red-500/90',
    hoverClass: 'hover:bg-red-400',
    textClass: 'text-white',
    icon: <ListChecks className="w-5 h-5" />,
    position: 'top-right',
    views: [
      { id: 'kanban', label: 'Project', icon: <LayoutDashboard className="w-3 h-3" />, view: 'kanban' },
      { id: 'focus', label: 'Focus', icon: <ListChecks className="w-3 h-3" />, view: 'focus' },
    ],
  },
];

const CENTER_VIEWS: SubView[] = [
  { id: 'timetable', label: 'Timetable', icon: <Clock className="w-3 h-3" />, view: 'timetable' },
  { id: 'voting', label: 'Voting', icon: <Vote className="w-3 h-3" />, view: 'voting' },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 className="w-3 h-3" />, view: 'metrics' },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-3 h-3" />, view: 'settings' },
];

const CENTER_SECTION: Section = {
  id: 'tools',
  label: 'Tools',
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

export const UmbrellaNavigation: React.FC<UmbrellaNavigationProps> = ({ open, onClose }) => {
  const { navigateTo, disabledModules } = useViewNavigation();
  const [hovered, setHovered] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => overlayRef.current?.focus(), 0);
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
      aria-label="Navigation menu"
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
          aria-label="Close navigation"
        >
          <X className="w-8 h-8" />
        </button>

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
                    <span className="text-sm font-semibold">{section.label}</span>
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
                      <span className="text-sm font-bold">{section.label}</span>
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
                          <span>{v.label}</span>
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
              <span className="text-xs font-semibold">{CENTER_SECTION.label}</span>
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
                <span className="text-xs font-bold">{CENTER_SECTION.label}</span>
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
                    <span>{v.label}</span>
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
