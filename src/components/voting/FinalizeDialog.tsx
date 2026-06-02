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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Trophy, X } from "lucide-react";
import { VoteEntity } from "@/lib/persistence-types";

interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vote: VoteEntity;
  onFinalize: (outcome: VoteEntity["outcome"]) => Promise<void>;
  isModerator?: boolean;
}

export const FinalizeDialog: React.FC<FinalizeDialogProps> = ({
  open,
  onOpenChange,
  vote,
  onFinalize,
  isModerator = false,
}) => {
  const [winningProposalId, setWinningProposalId] = React.useState<string | null>(null);
  const [signature, setSignature] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [summary, setSummary] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setWinningProposalId(null);
      setSignature("");
      setSummary("");
    }
  }, [open]);

  const activeProposals = vote.proposals.filter((p) => p.active);

  const handleFinalize = async () => {
    setIsSaving(true);
    try {
      const finalSummary =
        summary.trim() ||
        (winningProposalId
          ? activeProposals.find((p) => p.id === winningProposalId)
            ? `Proposal ${activeProposals.find((p) => p.id === winningProposalId)!.position + 1} selected as the decision.`
            : "Proposal selected as the decision."
          : "Tie — no decision reached.");

      await onFinalize({
        winningProposalId,
        summary: finalSummary,
        finalizedAt: new Date().toISOString(),
        finalizedByUserId: vote.ownerId,
        signature: signature.trim() || undefined,
      });

      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            Finalize decision
          </DialogTitle>
          <DialogDescription>
            Select the winning proposal and optionally add a signature. This action is irreversible.
          </DialogDescription>
        </DialogHeader>

          <div className="space-y-4">
            {isModerator && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Moderators cannot finalize decisions. Request the owner to finalize.
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Finalizing locks this vote. No further responses or edits will be accepted.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Winning proposal</Label>
            <RadioGroup
              value={winningProposalId || "tie"}
              onValueChange={(v) => setWinningProposalId(v === "tie" ? null : v)}
            >
              {activeProposals.map((proposal, index) => (
                <div key={proposal.id} className="flex items-center gap-2">
                  <RadioGroupItem value={proposal.id} id={`proposal-${proposal.id}`} />
                  <Label htmlFor={`proposal-${proposal.id}`} className="text-sm">
                    Proposal {index + 1}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tie" id="proposal-tie" />
                <Label htmlFor="proposal-tie" className="text-sm text-gray-500 italic">
                  Tie — no decision reached
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Signature (optional)</Label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Add a formal decision text or note..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Summary (optional)</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Override the auto-generated summary..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={isSaving || isModerator}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-2" />
            {isSaving ? "Finalizing..." : "Finalize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};