/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DateCellWrapperProps, ShowMoreProps } from 'react-big-calendar';
import { AlertTriangle, CircleDot, Flame } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toDateKey } from '@/lib/planner/dates';
import type { Task } from '@/hooks/useTasks';

export type CalendarDisplayEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: Task;
};

type MonthCalendarContextValue = {
  view: string;
  eventsByDate: Map<string, CalendarDisplayEvent[]>;
  onSelectEvent?: (event: CalendarDisplayEvent) => void;
};

export const MonthCalendarContext = React.createContext<MonthCalendarContextValue>({
  view: 'month',
  eventsByDate: new Map(),
});

export function eventAccent(task: Task): string {
  if (task.urgent) return '#dc2626';
  if (task.impact) return '#ca8a04';
  if (task.majorIncident) return '#991b1b';
  return '#3b82f6';
}

function formatEventTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDayTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

type EventListProps = {
  date: Date;
  events: CalendarDisplayEvent[];
  onSelectEvent?: (event: CalendarDisplayEvent) => void;
};

const EventList: React.FC<EventListProps> = ({ date, events, onSelectEvent }) => {
  const { t } = useTranslation();

  return (
    <div className="w-72">
      <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
        {formatDayTitle(date)}
      </div>
      <div className="max-h-64 space-y-0.5 overflow-y-auto p-1">
        {events.map((event, index) => (
          <button
            key={`${event.title}-${event.start.toISOString()}-${index}`}
            type="button"
            className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
            onClick={() => onSelectEvent?.(event)}
          >
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: eventAccent(event.resource) }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{event.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {event.allDay ? t('program.allDay') : formatEventTime(event.start)}
              </p>
            </div>
            {event.resource.urgent && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
            {event.resource.impact && <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-yellow-500" />}
            {event.resource.majorIncident && <Flame className="mt-0.5 h-3 w-3 shrink-0 text-red-700" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export const MonthDayCell: React.FC<DateCellWrapperProps> = ({ children, value }) => {
  const { view, eventsByDate, onSelectEvent } = React.useContext(MonthCalendarContext);

  const dayEvents = React.useMemo(() => {
    if (view !== 'month') return [];
    return eventsByDate.get(toDateKey(value)) ?? [];
  }, [eventsByDate, value, view]);

  const cell = (
    <div
      className="relative flex h-full min-w-0 flex-1"
      data-date={value.toISOString()}
    >
      {children}
    </div>
  );

  if (view !== 'month' || dayEvents.length === 0) return cell;

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>{cell}</HoverCardTrigger>
      <HoverCardContent align="start" side="bottom" className="w-auto p-0">
        <EventList date={value} events={dayEvents} onSelectEvent={onSelectEvent} />
      </HoverCardContent>
    </HoverCard>
  );
};

export const MonthShowMore: React.FC<ShowMoreProps<CalendarDisplayEvent>> = ({
  count,
  slotDate,
  remainingEvents,
}) => {
  const { t } = useTranslation();
  const { onSelectEvent } = React.useContext(MonthCalendarContext);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rbc-show-more text-xs font-medium text-primary hover:underline">
          {t('program.moreEvents', { count })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <EventList date={slotDate} events={remainingEvents} onSelectEvent={onSelectEvent} />
      </PopoverContent>
    </Popover>
  );
};
