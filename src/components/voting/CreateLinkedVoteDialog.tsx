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
import { getVotingStrings } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";
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
  const { t: tt } = useTranslation();
  const [mode, setMode] = React.useState<VoteEntity["config"]["mode"]>("THUMBS_UP");
  const [isAnonymous, setIsAnonymous] = React.useState(true);
  const [allowFreeText, setAllowFreeText] = React.useState(false);
  const [proposals, setProposals] = React.useState<VoteProposal[]>([
    {
      id: crypto.randomUUID(),
      content: taskComment || taskTitle || tt("voting.createLinkedDefaultProposal"),
      position: 0,
      active: true,
    },
  ]);
  const [isSaving, setIsSaving] = React.useState(false);
  const t = getVotingStrings();

  const autoTitle = tt("voting.createLinkedAutoTitle", { title: taskTitle });

  const defaultProposalContent = tt("voting.createLinkedDefaultProposal");

  React.useEffect(() => {
    setProposals([
      {
        id: crypto.randomUUID(),
        content: taskComment || taskTitle || defaultProposalContent,
        position: 0,
        active: true,
      },
    ]);
  }, [taskComment, taskTitle, open, defaultProposalContent]);

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
        window.open(`${window.location.origin}/v/${result.slug}`, "_self");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.labels.newLinkedVote}</DialogTitle>
          <DialogDescription>
            {tt("voting.createLinkedDescription", { title: taskTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>{t.labels.title}</Label>
            <Input value={autoTitle} readOnly className="bg-gray-50" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t.labels.votingMode}</Label>
            <ModeSelector value={mode} onChange={setMode} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t.labels.proposals}</Label>
            <ProposalEditor
              proposals={proposals}
              onChange={setProposals}
              kind="consultation"
              readOnly={false}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="linked-anon">{t.labels.anonymousVoting}</Label>
            <Switch
              id="linked-anon"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="linked-freetext">{t.labels.allowFreeText}</Label>
            <Switch
              id="linked-freetext"
              checked={allowFreeText}
              onCheckedChange={setAllowFreeText}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.buttons.cancel}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(true)}
            disabled={isSaving}
          >
            {isSaving ? t.buttons.creating : t.buttons.createAndClose}
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={isSaving}
          >
            {isSaving ? t.buttons.creating : t.buttons.createAndOpen}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};