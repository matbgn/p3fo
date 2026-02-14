import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserAvatarProps {
  username: string;
  logo?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
  trigram?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  username,
  logo,
  size = 'sm',
  className,
  showTooltip = true,
  trigram
}) => {
  // Use provided trigram OR fallback to ad-hoc initials (2 letters)
  const displayInitial = trigram || username.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2);

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10'
  };

  const fallbackSize = {
    sm: 'text-[10px]', // Adjusted for 3 letters
    md: 'text-xs',
    lg: 'text-sm'
  };

  const avatar = (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage
        src={logo}
        alt={username}
        className="object-cover"
      />
      <AvatarFallback className={cn('font-medium', fallbackSize[size])}>
        {displayInitial}
      </AvatarFallback>
    </Avatar>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {avatar}
          </TooltipTrigger>
          <TooltipContent>
            <p>{username}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return avatar;
};