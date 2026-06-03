import * as React from "react";
import { Vote, X, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VoteEntity } from "@/lib/persistence-types";
import { useVotes } from "@/hooks/useVotes";

interface LinkedVotePickerProps {
  linkedVoteIds: string[];
  onChange: (ids: string[]) => void;
}

export const LinkedVotePicker: React.FC<LinkedVotePickerProps> = ({
  linkedVoteIds,
  onChange,
}) => {
  const { votes, loadVotes } = useVotes();
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    loadVotes();
  }, [loadVotes]);

  const linkedVotes = votes.filter((v) => linkedVoteIds.includes(v.id));
  const availableVotes = votes.filter(
    (v) => !linkedVoteIds.includes(v.id) &&
      v.title.toLowerCase().includes(search.toLowerCase())
  );

  const addVote = (voteId: string) => {
    if (!linkedVoteIds.includes(voteId)) {
      onChange([...linkedVoteIds, voteId]);
    }
  };

  const removeVote = (voteId: string) => {
    onChange(linkedVoteIds.filter((id) => id !== voteId));
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Linked Votes</Label>
      {linkedVotes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {linkedVotes.map((v) => (
            <Badge key={v.id} variant="secondary" className="flex items-center gap-1 pr-1">
              <Vote className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{v.title}</span>
              <button
                onClick={() => removeVote(v.id)}
                className="ml-1 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {availableVotes.length > 0 && (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border rounded p-1">
          {availableVotes.slice(0, 10).map((v) => (
            <button
              key={v.id}
              onClick={() => addVote(v.id)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent text-left text-sm w-full"
            >
              <Plus className="w-3 h-3 text-gray-400" />
              <span className="truncate">{v.title}</span>
            </button>
          ))}
        </div>
      )}
      {linkedVotes.length === 0 && availableVotes.length === 0 && (
        <p className="text-xs text-gray-400">No votes available</p>
      )}
    </div>
  );
};