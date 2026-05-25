import React, { useState, useRef, useContext } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shuffle, Edit2, User, Upload, Fingerprint, AlertTriangle } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useTasks } from "@/hooks/useTasks";
import { useUsersContext, UserWithTrigram } from "@/context/UsersContext";
import { UserContext } from "@/context/UserContextDefinition";
import { cn } from "@/lib/utils";
import { eventBus } from "@/lib/events";
import { generateTrigram } from "@/utils/userTrigrams";

export function UserSection() {
  const { userSettings, updateUsername, updateLogo, regenerateUsername, updateTrigram } = useUserSettings();
  const { users } = useUsersContext();
  const userContext = useContext(UserContext);
  const { tasks } = useTasks();
  const currentUserTaskCount = tasks.filter(t => t.userId === userContext?.userId).length;

  const [isEditing, setIsEditing] = useState(false);
  const [isChangingUuid, setIsChangingUuid] = useState(false);
  const [tempUsername, setTempUsername] = useState(userSettings?.username || "");
  const [tempTrigram, setTempTrigram] = useState(userSettings?.trigram || "");
  const [editStartTrigram, setEditStartTrigram] = useState("");
  const [trigramManuallyEdited, setTrigramManuallyEdited] = useState(false);
  const [tempUuid, setTempUuid] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync tempUsername when userSettings changes
  React.useEffect(() => {
    if (userSettings?.username) {
      setTempUsername(userSettings.username);
    }
  }, [userSettings?.username]);

  // Initialize tempUuid when entering change mode
  React.useEffect(() => {
    if (isChangingUuid && userContext?.userId) {
      setTempUuid(userContext.userId);
    }
  }, [isChangingUuid, userContext?.userId]);

  // No auto-persist effect: trigrams are calculated on-the-fly in UsersContext.
  // We only persist when the user explicitly sets a custom one.

  if (!userSettings) return null;

  const computeAutoTrigram = (username: string) =>
    generateTrigram(username.split(' ')[0], username.split(' ').slice(1).join(' ') || '');

  const handleEditToggle = async () => {
    if (!isEditing) {
      // Start editing
      const foundUser = users.find(u => u.userId === userContext?.userId);
      const currentTrigram = userSettings.trigram || (foundUser as UserWithTrigram | undefined)?.trigram || computeAutoTrigram(userSettings.username);
      setTempUsername(userSettings.username);
      setTempTrigram(currentTrigram);
      setEditStartTrigram(currentTrigram);
      setTrigramManuallyEdited(false);
      setIsEditing(true);
      setIsChangingUuid(false);
      return;
    }

    const autoTrigram = computeAutoTrigram(tempUsername.trim() || userSettings.username);
    const needsRecompute = tempUsername.trim() !== userSettings.username && !trigramManuallyEdited;

    if (needsRecompute) {
      // Recompute the trigram for preview, stay in edit mode
      setTempTrigram(autoTrigram);
      setTrigramManuallyEdited(true);
      return;
    }

    // Save changes
    const newUsername = tempUsername.trim() || userSettings.username;
    const newTrigram = tempTrigram.trim().toUpperCase();
    const usernameChanged = newUsername !== userSettings.username;
    const trigramChanged = newTrigram !== editStartTrigram;
    console.log('UserSection: Saving profile change', { old: userSettings.username, new: newUsername, usernameChanged, trigramChanged });
    try {
      await updateUsername(newUsername);
      if (trigramChanged) {
        // User manually edited trigram, save it (even empty to revert to auto)
        await updateTrigram(newTrigram);
      } else if (usernameChanged) {
        // Username changed but trigram not manually edited, clear persisted trigram to recompute
        console.log('UserSection: Clearing persisted trigram to recompute');
        await updateTrigram('');
      }
      console.log('UserSection: Profile saved successfully');
    } catch (error) {
      console.error('UserSection: Failed to save profile', error);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setTempUsername(userSettings.username);
    setTempTrigram(editStartTrigram);
    setIsEditing(false);
  };

  const handleChangeUuidToggle = () => {
    if (isChangingUuid) {
      // We are submitting the change
      handleMigrateUuid();
    } else {
      // Start changing UUID
      setIsChangingUuid(true);
      // Reset editing state if active
      setIsEditing(false);
    }
  };

  const handleCancelUuidChange = () => {
    setIsChangingUuid(false);
    setTempUuid("");
  };

  const handleMigrateUuid = async () => {
    if (!tempUuid.trim() || tempUuid === userContext?.userId) {
      setIsChangingUuid(false);
      return;
    }

    try {
      console.log(`Migrating from ${userContext?.userId} to ${tempUuid}`);
      await userContext?.changeUserId(tempUuid);
      setIsChangingUuid(false);
      // Close popover or show success message?
    } catch (error) {
      console.error("Failed to migrate UUID:", error);
      // Ideally show an error toast here
    }
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
  };

  // Use persisted or calculated trigram (or temp trigram while editing)
  const currentUser = users.find(u => u.userId === userContext?.userId);
  const displayInitial = isEditing
    ? (tempTrigram || '???')
    : (userSettings.trigram || (currentUser as UserWithTrigram | undefined)?.trigram || generateTrigram(userSettings.username.split(' ')[0], userSettings.username.split(' ').slice(1).join(' ') || ''));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage
              src={userSettings.logo}
              alt={userSettings.username}
              className="object-cover"
            />
            <AvatarFallback className="text-xs font-medium">
              {displayInitial}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm font-medium truncate">
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
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {userSettings.username}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trigram: <span className="font-mono font-semibold">{displayInitial}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Switch UUID
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Enter another UUID to adopt its workspace
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={tempUsername}
                    onChange={(e) => { setTempUsername(e.target.value); setTrigramManuallyEdited(false); }}
                    placeholder="Enter your name"
                    className="text-sm"
                    autoFocus
                  />
                  <Input
                    value={tempTrigram}
                    onChange={(e) => { setTempTrigram(e.target.value.toUpperCase()); setTrigramManuallyEdited(true); }}
                    placeholder="TRG"
                    className="text-sm w-20 text-center font-mono"
                    maxLength={3}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {tempUsername.trim() !== userSettings.username && !trigramManuallyEdited
                    ? 'Recompute the trigram, or edit it directly, then save'
                    : 'Press Enter to save or Esc to cancel'}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={handleEditToggle}
                    disabled={!tempUsername.trim()}
                  >
                    {tempUsername.trim() !== userSettings.username && !trigramManuallyEdited ? 'Recompute Trigram' : 'Save'}
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
                {currentUserTaskCount > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      You have <strong>{currentUserTaskCount}</strong> task{currentUserTaskCount !== 1 ? 's' : ''}. Switching UUID will <strong>discard</strong> your current workspace in favor of the target UUID.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={handleMigrateUuid}
                    disabled={!tempUuid.trim() || tempUuid === userContext?.userId}
                  >
                    Switch
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
            {userSettings.logo && !isEditing && !isChangingUuid && (
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
