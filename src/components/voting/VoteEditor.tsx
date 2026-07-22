import * as React from "react";
import { Temporal } from "@js-temporal/polyfill";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { Save, X, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { VoteEntity, VoteMode, VoteKind, VoteConfig, VoteProposal } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";
import { KindSelector } from "./KindSelector";
import { ModeSelector } from "./ModeSelector";
import { ProposalEditor, ProposalEditorHandle } from "./ProposalEditor";
import { useSettingsContext } from "@/context/SettingsContext";
import { instantToPlainDateTime, plainDateTimeToTimestamp } from "@/lib/format-utils";

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
  const hasStarted = isEditing && vote?.config.phase !== "IDLE";
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const proposalEditorRef = React.useRef<ProposalEditorHandle>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState<VoteKind>("consultation");
  const [mode, setMode] = React.useState<VoteMode>("THUMBS_UP");
  const [proposals, setProposals] = React.useState<VoteProposal[]>(DEFAULT_PROPOSALS);
  const [isAnonymous, setIsAnonymous] = React.useState(true);
  const [allowFreeText, setAllowFreeText] = React.useState(false);
  const [requireObjectionComment, setRequireObjectionComment] = React.useState(false);
  const [allowAudienceProposals, setAllowAudienceProposals] = React.useState(false);
  const [showResultsBeforeClose, setShowResultsBeforeClose] = React.useState(false);
  const [allowVoteChangeUntilClose, setAllowVoteChangeUntilClose] = React.useState(true);
  const [multipleChoiceVote, setMultipleChoiceVote] = React.useState(true);
  const [maxPointsPerUser, setMaxPointsPerUser] = React.useState(10);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [openAt, setOpenAt] = React.useState<number | null>(null);
  const [closeAt, setCloseAt] = React.useState<number | null>(null);
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const [timePickerConfig, setTimePickerConfig] = React.useState<{
    type: "openAt" | "closeAt";
    initialTime: number;
  } | null>(null);
  const { settings } = useSettingsContext();
  const timezone = settings.timezone || "Europe/Zurich";
  const weekStartsOn = settings.weekStartDay as 0 | 1;

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
      setShowResultsBeforeClose(vote.config.showResultsBeforeClose ?? false);
      setAllowVoteChangeUntilClose(vote.config.allowVoteChangeUntilClose ?? true);
      setMultipleChoiceVote(vote.config.multipleChoiceVote ?? true);
      setMaxPointsPerUser(vote.config.maxPointsPerUser ?? 10);
      setAllowMultiple(vote.config.allowMultiple ?? false);
      setOpenAt(vote.config.openAt ? new Date(vote.config.openAt).getTime() : null);
      setCloseAt(vote.config.closeAt ? new Date(vote.config.closeAt).getTime() : null);
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
      setShowResultsBeforeClose(false);
      setAllowVoteChangeUntilClose(true);
      setMultipleChoiceVote(true);
      setMaxPointsPerUser(10);
      setAllowMultiple(false);
      setOpenAt(null);
      setCloseAt(null);
    }
  }, [vote, open]);

  const showObjectionComment =
    mode === "THUMBS_UD_NEUTRAL" || mode === "MAJORITY_JUDGMENT" || mode === "CONSENT_LOOP";

  const handleSave = async () => {
    if (!title.trim()) return;

    // Flush any pending BlockNote editor content into the proposals state
    // before reading it for the save payload.
    const flushedProposals = proposalEditorRef.current?.flush() ?? proposals;

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
        showResultsBeforeClose,
        allowVoteChangeUntilClose,
        multipleChoiceVote: mode !== "POINTS" && mode !== "CONSENT_LOOP" ? multipleChoiceVote : undefined,
        maxPointsPerUser: mode === "POINTS" ? maxPointsPerUser : undefined,
        allowMultiple: mode === "POINTS" ? allowMultiple : undefined,
        openAt: openAt ? new Date(openAt).toISOString() : undefined,
        closeAt: closeAt ? new Date(closeAt).toISOString() : undefined,
      };

      await onSave({
        id: vote?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId: vote?.ownerId || "me",
        proposals: flushedProposals.filter((p) => p.active),
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
              disabled={hasStarted || isFinalized}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.labels.mode}</Label>
            <ModeSelector
              value={mode}
              onChange={setMode}
              disabled={hasStarted || isFinalized}
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
            <div className="border rounded-md p-3 bg-gray-50">
              <p className="text-xs text-gray-500">
                {t.messages.consentLoopProcess}
              </p>
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

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.showResultsBeforeClose}</Label>
              <Switch
                checked={showResultsBeforeClose}
                onCheckedChange={setShowResultsBeforeClose}
                disabled={isFinalized}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.allowVoteChangeUntilClose}</Label>
              <Switch
                checked={allowVoteChangeUntilClose}
                onCheckedChange={setAllowVoteChangeUntilClose}
                disabled={isFinalized}
              />
            </div>

            {mode !== "POINTS" && mode !== "CONSENT_LOOP" && (
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.multipleChoiceVote}</Label>
                <Switch
                  checked={multipleChoiceVote}
                  onCheckedChange={setMultipleChoiceVote}
                  disabled={isFinalized}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.openAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !openAt && "text-muted-foreground"
                      )}
                      disabled={isFinalized}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {openAt ? format(new Date(openAt), "PPP p") : <span>{tt("task.pickDate")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={openAt ? new Date(openAt) : undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        const currentPdt = openAt
                          ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(openAt), timezone)
                          : instantToPlainDateTime(Temporal.Now.instant(), timezone);
                        const newPdt = Temporal.PlainDateTime.from({
                          year: date.getFullYear(),
                          month: date.getMonth() + 1,
                          day: date.getDate(),
                          hour: currentPdt.hour,
                          minute: currentPdt.minute,
                          second: currentPdt.second,
                        });
                        setOpenAt(plainDateTimeToTimestamp(newPdt, timezone));
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setTimePickerConfig({ type: "openAt", initialTime: openAt || Date.now() });
                          setTimePickerOpen(true);
                        }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {openAt ? format(new Date(openAt), "HH:mm") : <span className="text-muted-foreground">{tt("task.setTime")}</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {openAt && !isFinalized && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOpenAt(null)}>
                    {tt("voting.clear")}
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.closeAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !closeAt && "text-muted-foreground"
                      )}
                      disabled={isFinalized}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {closeAt ? format(new Date(closeAt), "PPP p") : <span>{tt("task.pickDate")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={closeAt ? new Date(closeAt) : undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        const currentPdt = closeAt
                          ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(closeAt), timezone)
                          : openAt
                            ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(openAt), timezone)
                            : instantToPlainDateTime(Temporal.Now.instant(), timezone);
                        const newPdt = Temporal.PlainDateTime.from({
                          year: date.getFullYear(),
                          month: date.getMonth() + 1,
                          day: date.getDate(),
                          hour: currentPdt.hour,
                          minute: currentPdt.minute,
                          second: currentPdt.second,
                        });
                        setCloseAt(plainDateTimeToTimestamp(newPdt, timezone));
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setTimePickerConfig({ type: "closeAt", initialTime: closeAt || openAt || Date.now() });
                          setTimePickerOpen(true);
                        }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {closeAt ? format(new Date(closeAt), "HH:mm") : <span className="text-muted-foreground">{tt("task.setTime")}</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {closeAt && !isFinalized && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCloseAt(null)}>
                    {tt("voting.clear")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-base font-medium">{t.labels.proposals}</Label>
            <ProposalEditor
              ref={proposalEditorRef}
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
        {timePickerConfig && (
          <TimePickerDialog
            isOpen={timePickerOpen}
            onClose={() => setTimePickerOpen(false)}
            initialTime={timePickerConfig.initialTime}
            onTimeChange={(timestamp) => {
              const instant = Temporal.Instant.fromEpochMilliseconds(timestamp);
              const pdt = instant.toZonedDateTimeISO(timezone).toPlainDateTime();
              const currentDate = timePickerConfig.type === "openAt" ? openAt : closeAt;
              let finalPdt: Temporal.PlainDateTime;
              if (currentDate) {
                const currentPdt = instantToPlainDateTime(
                  Temporal.Instant.fromEpochMilliseconds(currentDate),
                  timezone
                );
                finalPdt = currentPdt.with({ hour: pdt.hour, minute: pdt.minute, second: 0 });
              } else {
                finalPdt = pdt.with({ second: 0 });
              }
              const epochMs = plainDateTimeToTimestamp(finalPdt, timezone);
              if (timePickerConfig.type === "openAt") {
                setOpenAt(epochMs);
              } else {
                setCloseAt(epochMs);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};