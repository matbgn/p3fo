import React, { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shuffle, Edit2, User, Upload, Fingerprint } from "lucide-react";
import { useCurrentUser } from "@/context/UserContext";
import { getRandomUsername } from "@/lib/username-generator";
import { cn } from "@/lib/utils";

export function UserSection() {
  const { userSettings, updateUserSettings, changeUserId } = useCurrentUser();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingUuid, setIsChangingUuid] = useState(false);
  const [tempUsername, setTempUsername] = useState(userSettings?.username || "");
  const [tempUuid, setTempUuid] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!userSettings) return null;

  const handleEditToggle = () => {
    if (isEditing) {
      // Save changes
      updateUserSettings({ username: tempUsername.trim() || userSettings.username });
      setIsEditing(false);
    } else {
      // Start editing
      setTempUsername(userSettings.username);
      setIsEditing(true);
      setIsChangingUuid(false);
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
          updateUserSettings({ logo: result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegenerateUsername = () => {
    const newName = getRandomUsername();
    updateUserSettings({ username: newName });
    setTempUsername(newName);
  };

  const handleChangeUuidToggle = () => {
    if (isChangingUuid) {
      // Save UUID change
      if (tempUuid.trim() && tempUuid !== userSettings.userId) {
        if (window.confirm("WARNING: Changing your UUID will migrate all your current data to the new UUID. If the new UUID already has data, it might be merged or overwritten. Are you sure you want to proceed?")) {
          changeUserId(tempUuid.trim());
          setIsChangingUuid(false);
          setTempUuid("");
        }
      }
    } else {
      // Start changing UUID
      setTempUuid(userSettings.userId);
      setIsChangingUuid(true);
      setIsEditing(false);
    }
  };

  const handleCancelUuidChange = () => {
    setTempUuid("");
    setIsChangingUuid(false);
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
              {!isEditing && !isChangingUuid ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {userSettings.username}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Click to edit your profile
                  </div>
                </div>
              ) : isEditing ? (
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
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Change UUID</div>
                  <div className="text-xs text-muted-foreground">
                    Enter new UUID to migrate data
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Logo Upload Section */}
            {!isChangingUuid && (
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
            )}

            {/* Username Actions */}
            {!isEditing && !isChangingUuid ? (
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
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleChangeUuidToggle}
                >
                  <Fingerprint className="h-4 w-4" />
                  Change UUID
                </Button>
              </>
            ) : isEditing ? (
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
            ) : (
              <div className="space-y-2">
                <Input
                  value={tempUuid}
                  onChange={(e) => setTempUuid(e.target.value)}
                  placeholder="Enter new UUID"
                  className="text-sm font-mono"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={handleChangeUuidToggle}
                    disabled={!tempUuid.trim() || tempUuid === userSettings.userId}
                  >
                    Migrate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCancelUuidChange}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Clear Logo */}
            {userSettings.logo && !isChangingUuid && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => updateUserSettings({ logo: '' })}
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