import * as React from "react";
import { Vote, Plus, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandSeparator } from "@/components/ui/command";
import { VoteEntity } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";



const PHASE_COLORS: Record<string, string> = {
  IDLE: "bg-gray-100 text-gray-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-yellow-100 text-yellow-700",
  FINALIZED: "bg-blue-100 text-blue-700",
};

interface LinkedVoteButtonProps {
  taskId: string;
  taskTitle: string;
  linkedVoteIds?: string[];
  linkedVotes?: VoteEntity[];
  onNavigateToVote: (voteId: string) => void;
  onCreateLinkedVote: (taskId: string) => void;
}

export const LinkedVoteButton: React.FC<LinkedVoteButtonProps> = ({
  taskId,
  taskTitle,
  linkedVoteIds = [],
  linkedVotes = [],
  onNavigateToVote,
  onCreateLinkedVote,
}) => {
  const t = getVotingStrings();
  const [open, setOpen] = React.useState(false);
  const count = linkedVoteIds.length;

  const tooltipText = count === 0
    ? t.labels.newLinkedVote
    : count === 1
      ? linkedVotes[0]?.title || `1 ${t.labels.linkedVotes}`
      : `${count} ${t.labels.linkedVotes}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (count === 0) {
      onCreateLinkedVote(taskId);
    } else {
      setOpen(!open);
    }
  };

  const activeColor = count > 0 ? "text-violet-500" : "text-gray-400";

  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={handleClick}
              >
                <Vote className={`h-4 w-4 ${activeColor}`} />
              </Button>
            </PopoverTrigger>
            {count > 0 && (
              <PopoverContent
                align="start"
                className="w-72 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                {count >= 2 ? (
                  <Command>
                    <CommandInput placeholder={t.placeholders.searchVotes} />
                    <CommandList>
                      <CommandEmpty>{t.messages.noMatchingVotes}</CommandEmpty>
                      {linkedVotes.map((v) => (
                        <CommandItem
                          key={v.id}
                          onSelect={() => {
                            setOpen(false);
                            onNavigateToVote(v.id);
                          }}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-sm truncate">{v.title}</span>
                            <div className="flex items-center gap-1">
                              <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${PHASE_COLORS[v.config.phase] || ""}`}>
                                {t.phases[v.config.phase] || v.config.phase}
                              </span>
                              {v.config.kind === "decision" && (
                                <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                                  {t.kinds.decision}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                        </CommandItem>
                      ))}
                      <CommandSeparator />
                      <CommandItem
                        onSelect={() => {
                          setOpen(false);
                          onCreateLinkedVote(taskId);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-violet-600"
                      >
                        <Plus className="w-3 h-3" />
                        <span className="text-sm">{t.labels.newLinkedVote}</span>
                      </CommandItem>
                    </CommandList>
                  </Command>
                ) : (
                  <div className="p-2">
                    {linkedVotes[0] && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          onNavigateToVote(linkedVotes[0].id);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-accent text-left"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm truncate">{linkedVotes[0].title}</span>
                          <div className="flex items-center gap-1">
                            <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${PHASE_COLORS[linkedVotes[0].config.phase] || ""}`}>
                              {t.phases[linkedVotes[0].config.phase] || linkedVotes[0].config.phase}
                            </span>
                            {linkedVotes[0].config.kind === "decision" && (
                              <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                                {t.kinds.decision}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                      </button>
                    )}
                    <div className="border-t mt-1 pt-1">
                      <button
                        onClick={() => {
                          setOpen(false);
                          onCreateLinkedVote(taskId);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent text-violet-600 text-left"
                      >
                        <Plus className="w-3 h-3" />
                        <span className="text-sm">{t.labels.newLinkedVote}</span>
                      </button>
                    </div>
                  </div>
                )}
              </PopoverContent>
            )}
          </Popover>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
};