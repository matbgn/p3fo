import React, { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shuffle, Edit2, User, Upload } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/lib/utils";

export function UserSection() {
  const { userSettings, updateUsername, updateLogo, regenerateUsername } = useUserSettings();
  const [isEditing, setIsEditing] = useState(false);
  const [tempUsername, setTempUsername] = useState(userSettings.username);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditToggle = () => {
    if (isEditing) {
      // Save changes
      updateUsername(tempUsername.trim() || userSettings.username);
      setIsEditing(false);
    } else {
      // Start editing
      setTempUsername(userSettings.username);
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setTempUsername(userSettings.username);
    setIsEditing(false);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          updateLogo(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegenerateUsername = () => {
    regenerateUsername();
    setTempUsername(userSettings.username);
  };

  const displayInitial = userSettings.username.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2">
          <Avatar className="h-8 w-8">
            <AvatarImage 
              src={userSettings.logo} 
              alt={userSettings.username}
              className="object-cover"
            />
            <AvatarFallback className="text-xs font-medium">
              {displayInitial}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm font-medium max-w-[120px] truncate">
            {userSettings.username}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-16 w-16">
              <AvatarImage 
                src={userSettings.logo} 
                alt={userSettings.username}
                className="object-cover"
              />
              <AvatarFallback className="text-lg font-medium">
                {displayInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {!isEditing ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {userSettings.username}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Click to edit your profile
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    placeholder="Enter your name"
                    className="text-sm"
                    autoFocus
                  />
                  <div className="text-xs text-muted-foreground">
                    Press Enter to save or Esc to cancel
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Logo Upload Section */}
            <div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload Logo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>

            {/* Username Actions */}
            {!isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleEditToggle}
                >
                  <Edit2 className="h-4 w-4" />
                  Edit Username
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleRegenerateUsername}
                >
                  <Shuffle className="h-4 w-4" />
                  Generate New Name
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={handleEditToggle}
                  disabled={!tempUsername.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Clear Logo */}
            {userSettings.logo && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => updateLogo('')}
              >
                <User className="h-4 w-4" />
                Remove Logo
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}