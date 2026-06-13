import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimpleDropdownOption {
  value: string;
  label: string;
  dotColor?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface SimpleDropdownProps {
  value: string;
  onValueChange: (v: string) => void;
  options: SimpleDropdownOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  showIconOnly?: boolean;
}

/**
 * Lightweight dropdown that renders entirely in-place (no portal).
 * Use this inside a Document PiP window, where Radix Select portals
 * would render to the wrong document.
 */
export const SimpleDropdown: React.FC<SimpleDropdownProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  triggerClassName,
  contentClassName,
  showIconOnly,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center justify-between w-full rounded-md border border-input bg-background px-2 h-7 sm:h-8 text-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring',
          triggerClassName,
        )}
      >
        <span className="truncate">
          {selected ? (
            <span className="flex items-center gap-1.5">
              {selected.icon ?? (selected.dotColor && (
                <span className={`inline-block w-2 h-2 rounded-full ${selected.dotColor}`} />
              ))}
              {!showIconOnly && selected.label}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 opacity-50 ml-1 shrink-0" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-full max-h-60 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md',
            contentClassName,
          )}
        >
          <div className="p-1">
            {options.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No options</div>
            )}
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (!opt.disabled) {
                    onValueChange(opt.value);
                    setOpen(false);
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded-sm text-left',
                  opt.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  opt.value === value && 'bg-accent/50',
                )}
              >
                {opt.icon ?? (opt.dotColor && (
                  <span className={`inline-block w-2 h-2 rounded-full ${opt.dotColor}`} />
                ))}
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.value === value && <Check className="h-3 w-3 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleDropdown;