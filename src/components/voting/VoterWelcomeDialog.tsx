import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVotingStrings } from "@/lib/voting-i18n";
import { getRandomUsername } from "@/lib/username-generator";

interface VoterWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
}

export const VoterWelcomeDialog: React.FC<VoterWelcomeDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  name,
  onNameChange,
  onSave,
}) => {
  const ts = getVotingStrings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <p className="text-xs text-gray-500">
            {ts.attendance.nameAttachedNote}
          </p>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="welcome-display-name">
            {ts.attendance.displayName}
          </Label>
          <Input
            id="welcome-display-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSave();
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700"
            onClick={() => onNameChange(getRandomUsername())}
          >
            {ts.attendance.useRandomName}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onSave} disabled={!name.trim()}>
            {ts.attendance.saveName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
