import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  username: string;
  logo?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  username, 
  logo, 
  size = 'sm', 
  className,
  showTooltip = true 
}) => {
  const displayInitial = username.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2);
  
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8', 
    lg: 'h-10 w-10'
  };

  const fallbackSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
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
};