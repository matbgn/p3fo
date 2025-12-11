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
import { useUsers } from '@/hooks/useUsers';
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
  const { userSettings, userId: currentUserId } = useUserSettings();
  const { users, loading } = useUsers();

  const isCurrentUser = value && value === currentUserId;

  // Get username by userId from the users list
  const getUserById = (userId: string) => {
    return users.find(u => u.userId === userId);
  };

  const otherUser = value && !isCurrentUser ? getUserById(value) : null;

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
          ) : otherUser ? (
            <UserAvatar
              username={otherUser.username}
              logo={otherUser.logo}
              size="sm"
              showTooltip={false}
            />
          ) : value && value !== 'unassigned' ? (
            // Fallback if user not found in list (shouldn't happen normally)
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">?</span>
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
        {currentUserId && (
          <SelectItem value={currentUserId}>
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
        )}
        {/* Show other users from the users list */}
        {users.filter(u => u.userId !== currentUserId).map((user) => (
          <SelectItem key={user.userId} value={user.userId}>
            <div className="flex items-center gap-2">
              <UserAvatar
                username={user.username}
                logo={user.logo}
                size="sm"
                showTooltip={false}
              />
              <span className="text-sm">{user.username}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};