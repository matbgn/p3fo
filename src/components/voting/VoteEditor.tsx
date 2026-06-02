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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Save, X } from "lucide-react";
import { VoteEntity, VoteMode, VoteKind, VoteConfig, VoteProposal } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { KindSelector } from "./KindSelector";
import { ModeSelector } from "./ModeSelector";
import { ProposalEditor } from "./ProposalEditor";

interface VoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vote?: VoteEntity | null;
  onSave: (input: Partial<VoteEntity>) => Promise<void>;
}

const DEFAULT_CONFIG: VoteConfig = {
  mode: "THUMBS_UP",
  kind: "consultation",
  phase: "IDLE",
};

const DEFAULT_PROPOSALS: VoteProposal[] = [
  { id: crypto.randomUUID(), content: "", position: 0, active: true },
];

export const VoteEditor: React.FC<VoteEditorProps> = ({
  open,
  onOpenChange,
  vote,
  onSave,
}) => {
  const isEditing = !!vote;
  const isFinalized = vote?.config.phase === "FINALIZED";
  const t = getVotingStrings();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState<VoteKind>("consultation");
  const [mode, setMode] = React.useState<VoteMode>("THUMBS_UP");
  const [proposals, setProposals] = React.useState<VoteProposal[]>(DEFAULT_PROPOSALS);
  const [isAnonymous, setIsAnonymous] = React.useState(true);
  const [allowFreeText, setAllowFreeText] = React.useState(false);
  const [requireObjectionComment, setRequireObjectionComment] = React.useState(false);
  const [allowAudienceProposals, setAllowAudienceProposals] = React.useState(false);
  const [maxPointsPerUser, setMaxPointsPerUser] = React.useState(10);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [consentLoopMaxRounds, setConsentLoopMaxRounds] = React.useState(10);
  const [consentLoopGatingMode, setConsentLoopGatingMode] = React.useState<"UD_NEUTRAL" | "NONE">("UD_NEUTRAL");
  const [isSaving, setIsSaving] = React.useState(false);
  const [openAt, setOpenAt] = React.useState("");
  const [closeAt, setCloseAt] = React.useState("");

  React.useEffect(() => {
    if (vote) {
      setTitle(vote.title);
      setDescription(vote.description || "");
      setKind(vote.config.kind);
      setMode(vote.config.mode);
      setProposals(vote.proposals.length > 0 ? vote.proposals : DEFAULT_PROPOSALS);
      setIsAnonymous(vote.config.isAnonymous ?? true);
      setAllowFreeText(vote.config.allowFreeText ?? false);
      setRequireObjectionComment(vote.config.requireObjectionComment ?? false);
      setAllowAudienceProposals(vote.config.allowAudienceProposals ?? false);
      setMaxPointsPerUser(vote.config.maxPointsPerUser ?? 10);
      setAllowMultiple(vote.config.allowMultiple ?? false);
      setConsentLoopMaxRounds(vote.config.consentLoopMaxRounds ?? 10);
      setConsentLoopGatingMode(vote.config.consentLoopGatingMode ?? "UD_NEUTRAL");
      setOpenAt(vote.config.openAt || "");
      setCloseAt(vote.config.closeAt || "");
    } else {
      setTitle("");
      setDescription("");
      setKind("consultation");
      setMode("THUMBS_UP");
      setProposals([{ id: crypto.randomUUID(), content: "", position: 0, active: true }]);
      setIsAnonymous(true);
      setAllowFreeText(false);
      setRequireObjectionComment(false);
      setAllowAudienceProposals(false);
      setMaxPointsPerUser(10);
      setAllowMultiple(false);
      setConsentLoopMaxRounds(10);
      setConsentLoopGatingMode("UD_NEUTRAL");
      setOpenAt("");
      setCloseAt("");
    }
  }, [vote, open]);

  const showObjectionComment =
    mode === "THUMBS_UD_NEUTRAL" || mode === "MAJORITY_JUDGMENT" || mode === "CONSENT_LOOP";

  const handleSave = async () => {
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const config: VoteConfig = {
        mode,
        kind,
        phase: vote?.config.phase || "IDLE",
        isAnonymous,
        allowFreeText,
        requireObjectionComment: showObjectionComment ? requireObjectionComment : undefined,
        allowAudienceProposals: kind === "consultation" ? allowAudienceProposals : undefined,
        maxPointsPerUser: mode === "POINTS" ? maxPointsPerUser : undefined,
        allowMultiple: mode === "POINTS" ? allowMultiple : undefined,
        consentLoopMaxRounds: mode === "CONSENT_LOOP" ? consentLoopMaxRounds : undefined,
        consentLoopGatingMode: mode === "CONSENT_LOOP" ? consentLoopGatingMode : undefined,
        openAt: openAt || undefined,
        closeAt: closeAt || undefined,
      };

      await onSave({
        id: vote?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId: vote?.ownerId || "me",
        proposals: proposals.filter((p) => p.active),
        config,
      });

      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t.pages.editVote : t.pages.createNewVote}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? isFinalized
                ? t.pages.closed
                : t.buttons.saveChanges
              : t.buttons.createVote}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="vote-title">{t.labels.title}</Label>
            <Input
              id="vote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.placeholders.title}
              disabled={isFinalized}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vote-description">{t.labels.description}</Label>
            <Textarea
              id="vote-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.placeholders.description}
              rows={2}
              disabled={isFinalized}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t.labels.kind}</Label>
            <KindSelector
              value={kind}
              onChange={setKind}
              disabled={isEditing || isFinalized}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.labels.mode}</Label>
            <ModeSelector
              value={mode}
              onChange={setMode}
              disabled={isEditing || isFinalized}
            />
          </div>

          {mode === "POINTS" && (
            <div className="space-y-3 border rounded-md p-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.allowMultiple}</Label>
                <Switch
                  checked={allowMultiple}
                  onCheckedChange={setAllowMultiple}
                  disabled={isFinalized}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.maxPointsPerUser}</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxPointsPerUser}
                  onChange={(e) => setMaxPointsPerUser(parseInt(e.target.value, 10) || 10)}
                  disabled={isFinalized}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {mode === "CONSENT_LOOP" && (
            <div className="space-y-3 border rounded-md p-3 bg-gray-50">
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.maxRounds}</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={consentLoopMaxRounds}
                  onChange={(e) => setConsentLoopMaxRounds(parseInt(e.target.value, 10) || 10)}
                  disabled={isFinalized}
                  className="w-24"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.gatingVote}</Label>
                <Switch
                  checked={consentLoopGatingMode === "UD_NEUTRAL"}
                  onCheckedChange={(checked) =>
                    setConsentLoopGatingMode(checked ? "UD_NEUTRAL" : "NONE")
                  }
                  disabled={isFinalized}
                />
              </div>
              {consentLoopGatingMode === "UD_NEUTRAL" && (
                <p className="text-xs text-gray-400">
                  {t.messages.gatingDescription}
                </p>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-medium">{t.labels.settings}</Label>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.anonymousVoting}</Label>
              <Switch
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                disabled={isFinalized}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.allowFreeText}</Label>
              <Switch
                checked={allowFreeText}
                onCheckedChange={setAllowFreeText}
                disabled={isFinalized}
              />
            </div>

            {showObjectionComment && (
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.encourageNegativeComments}</Label>
                <Switch
                  checked={requireObjectionComment}
                  onCheckedChange={setRequireObjectionComment}
                  disabled={isFinalized}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.openAt}</Label>
                <Input
                  type="datetime-local"
                  value={openAt}
                  onChange={(e) => setOpenAt(e.target.value)}
                  disabled={isFinalized}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.closeAt}</Label>
                <Input
                  type="datetime-local"
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
                  disabled={isFinalized}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-base font-medium">{t.labels.proposals}</Label>
            <ProposalEditor
              proposals={proposals}
              onChange={setProposals}
              kind={kind}
              allowAudienceProposals={allowAudienceProposals}
              onAllowAudienceProposalsChange={setAllowAudienceProposals}
              readOnly={isFinalized}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4 mr-2" />
            {t.buttons.cancel}
          </Button>
          {!isFinalized && (
            <Button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? t.buttons.saving : isEditing ? t.buttons.saveChanges : t.buttons.createVote}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};