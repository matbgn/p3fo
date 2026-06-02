import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VoteEntity, VoteProposal } from "@/lib/persistence-types";
import { ModeSelector } from "./ModeSelector";
import { ProposalEditor } from "./ProposalEditor";

interface CreateLinkedVoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  taskComment?: string | null;
  onSave: (input: Partial<VoteEntity>) => Promise<VoteEntity | null>;
}

export const CreateLinkedVoteDialog: React.FC<CreateLinkedVoteDialogProps> = ({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  taskComment,
  onSave,
}) => {
  const [mode, setMode] = React.useState<VoteEntity["config"]["mode"]>("THUMBS_UP");
  const [isAnonymous, setIsAnonymous] = React.useState(true);
  const [allowFreeText, setAllowFreeText] = React.useState(false);
  const [proposals, setProposals] = React.useState<VoteProposal[]>([
    {
      id: crypto.randomUUID(),
      content: taskComment || taskTitle || "<p>Proposal 1</p>",
      position: 0,
      active: true,
    },
  ]);
  const [isSaving, setIsSaving] = React.useState(false);

  const autoTitle = `Task – ${taskTitle} – vote`;

  React.useEffect(() => {
    setProposals([
      {
        id: crypto.randomUUID(),
        content: taskComment || taskTitle || "<p>Proposal 1</p>",
        position: 0,
        active: true,
      },
    ]);
  }, [taskComment, taskTitle, open]);

  const handleSave = async (andClose: boolean = false) => {
    setIsSaving(true);
    try {
      const result = await onSave({
        title: autoTitle,
        config: {
          mode,
          kind: "consultation",
          phase: "IDLE",
          isAnonymous,
          allowFreeText,
        },
        proposals,
        linkedTaskId: taskId,
      });
      if (result && andClose) {
        onOpenChange(false);
      } else if (result) {
        window.open(`${window.location.origin}/voting?openVoteId=${result.id}`, "_self");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Linked Vote</DialogTitle>
          <DialogDescription>
            Create a consultation vote linked to &ldquo;{taskTitle}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Title</Label>
            <Input value={autoTitle} readOnly className="bg-gray-50" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Voting Mode</Label>
            <ModeSelector value={mode} onChange={setMode} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Proposals</Label>
            <ProposalEditor
              proposals={proposals}
              onChange={setProposals}
              kind="consultation"
              readOnly={false}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="linked-anon">Anonymous voting</Label>
            <Switch
              id="linked-anon"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="linked-freetext">Allow free-text comments</Label>
            <Switch
              id="linked-freetext"
              checked={allowFreeText}
              onCheckedChange={setAllowFreeText}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(true)}
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Create & Close"}
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Create & Open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};