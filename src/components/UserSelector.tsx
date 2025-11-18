import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from './UserAvatar';
import { useUserSettings } from '@/hooks/useUserSettings';
import { cn } from '@/lib/utils';

interface UserSelectorProps {
  value?: string;
  onChange: (userId: string | undefined) => void;
  className?: string;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  value,
  onChange,
  className
}) => {
  const { userSettings } = useUserSettings();
  const isCurrentUser = value && value === userSettings.username;

  return (
    <Select value={value || 'unassigned'} onValueChange={(val) => onChange(val === 'unassigned' ? undefined : val)}>
      <SelectTrigger className={cn('w-auto justify-center px-0 mt-1 mb-2 h-6 rounded-full border-none bg-transparent hover:bg-accent [&_.lucide-chevron-down]:hidden [&>span:last-child]:hidden', className)}>
        <SelectValue placeholder="Unassigned">
          {isCurrentUser ? (
            <UserAvatar
              username={userSettings.username}
              logo={userSettings.logo}
              size="sm"
              showTooltip={false}
            />
          ) : value && value !== 'unassigned' ? (
            // Show the stored user ID as a simple avatar with initials
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                {value.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">-</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">-</span>
            </div>
            <span className="text-sm">Unassigned</span>
          </div>
        </SelectItem>
        <SelectItem value="current-user">
          <div className="flex items-center gap-2">
            <UserAvatar
              username={userSettings.username}
              logo={userSettings.logo}
              size="sm"
              showTooltip={false}
            />
            <span className="text-sm">Myself ({userSettings.username})</span>
          </div>
        </SelectItem>
        {value && value !== 'unassigned' && value !== 'current-user' && !isCurrentUser && (
          <SelectItem value={value}>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  {value.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2)}
                </span>
              </div>
              <span className="text-sm">{value}</span>
            </div>
          </SelectItem>
        )}
        {/* Future: Add support for other users from shared team data */}
      </SelectContent>
    </Select>
  );
};