import * as React from "react";
import { BadgeCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVotingStrings } from "@/lib/voting-i18n";

interface VoterIdentityBarProps {
  displayName: string;
  onEdit: () => void;
  editDisabled?: boolean;
}

export const VoterIdentityBar: React.FC<VoterIdentityBarProps> = ({
  displayName,
  onEdit,
  editDisabled = false,
}) => {
  const ts = getVotingStrings();
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm">
      <BadgeCheck className="w-4 h-4 text-green-600" />
      <span>
        {ts.attendance.votingAs}{" "}
        <strong className="font-medium text-gray-900">{displayName}</strong>
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        onClick={onEdit}
        disabled={editDisabled}
      >
        <Pencil className="w-3.5 h-3.5 mr-1" />
        {ts.attendance.changeName}
      </Button>
    </div>
  );
};
