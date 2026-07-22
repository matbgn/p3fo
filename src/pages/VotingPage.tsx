import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Vote, Plus, BarChart3, Clock, Trash2, ExternalLink, Eye, Trophy, Edit, ToggleLeft, Shield, Share2, RotateCcw, GitCompare, Save } from "lucide-react";
import { useVotes, useVoteResults, syncVoteToYjs } from "@/hooks/useVotes";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { eventBus } from "@/lib/events";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoteEntity, VoteKind } from "@/lib/persistence-types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { VoteEditor } from "@/components/voting/VoteEditor";
import { VoteResults } from "@/components/voting/VoteResults";
import { FinalizeDialog } from "@/components/voting/FinalizeDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoopRoundTabs } from "@/components/voting/LoopRoundTabs";
import { LoopRoundEditor } from "@/components/voting/LoopRoundEditor";
import { LoopRoundControls } from "@/components/voting/LoopRoundControls";
import { LoopRoundDiffDialog } from "@/components/voting/LoopRoundDiffDialog";
import { BlockNoteProposalEditor } from "@/components/voting/BlockNoteProposalEditor";
import { ModerationPanel } from "@/components/voting/ModerationPanel";
import QRCodeBlock from "@/components/voting/QRCodeBlock";
import { deserializeBlocks } from "@/components/voting/BlockNoteProposalEditor";

type VotingTab = "consultations" | "decisions";

const PHASE_COLORS: Record<string, string> = {
  IDLE: "bg-gray-100 text-gray-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-yellow-100 text-yellow-700",
  FINALIZED: "bg-blue-100 text-blue-700",
};

const VoteCard: React.FC<{
  vote: VoteEntity;
  onSelect: (vote: VoteEntity) => void;
  onDelete: (id: string) => void;
  onOpenPublic: (slug: string) => void;
}> = ({ vote, onSelect, onDelete, onOpenPublic }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const phaseLabel = t.phases[vote.config.phase] || vote.config.phase;
  const phaseColor = PHASE_COLORS[vote.config.phase] || "bg-gray-100 text-gray-700";
  const modeLabel = tt(`voting.mode.${vote.config.mode === "THUMBS_UP" ? "thumbsUp" : vote.config.mode === "THUMBS_UD_NEUTRAL" ? "thumbsUdNeutral" : vote.config.mode === "POINTS" ? "points" : vote.config.mode === "MAJORITY_JUDGMENT" ? "majorityJudgment" : "consentLoop"}`);

  return (
    <div
      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect(vote)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{vote.title}</h3>
          {vote.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{vote.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenPublic(vote.slug);
            }}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
            title={tt("voting.openPublicPage")}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(vote.id);
            }}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title={tt("voting.delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${phaseColor}`}>
          {phaseLabel}
        </span>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          {modeLabel}
        </span>
        {vote.config.kind === "decision" && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            {t.kinds.decision}
          </span>
        )}
        {vote.config.kind === "consultation" && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
            {t.kinds.consultation}
          </span>
        )}
        {vote.linkedTaskId && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            {t.labels.linkedTask}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(vote.createdAt).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          /v/{vote.slug}
        </span>
      </div>
    </div>
  );
};

const ConsentLoopPanel: React.FC<{
  vote: VoteEntity;
  loops: ReturnType<typeof useVoteLoops>["loops"];
  responses: ReturnType<typeof useVotes>["votes"] extends (infer T)[] ? T[] : never;
  onOpenRound: (proposalId: string) => void;
  onCloseRound: (loopId: string) => void;
  onUpdateRoundContent: (loopId: string, content: string) => void;
  isModerator?: boolean;
}> = ({ vote, loops, responses, onOpenRound, onCloseRound, onUpdateRoundContent, isModerator }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const { responses: voteResponses } = useVoteResults(vote.id);
  const activeProposals = vote.proposals.filter((p) => p.active);
  const isOpen = vote.config.phase === "OPEN";

  const [expandedProposalId, setExpandedProposalId] = React.useState<string>(activeProposals[0]?.id || "");
  const [diffOpen, setDiffOpen] = React.useState(false);
  const [diffProposalId, setDiffProposalId] = React.useState<string>("");
  const [draftChanges, setDraftChanges] = React.useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = React.useState<Record<string, boolean>>({});
  const [savedDrafts, setSavedDrafts] = React.useState<Record<string, string>>({});

  const handleDraftChange = React.useCallback((proposalId: string, content: string) => {
    setDraftChanges((prev) => ({ ...prev, [proposalId]: content }));
  }, []);

  const handleSaveDraft = React.useCallback(async (proposalId: string): Promise<string | null> => {
    const content = draftChanges[proposalId];
    if (content === undefined) return null;
    setSavingDraft((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const adapter = await getPersistenceAdapter();
      const freshVote = await adapter.getVoteById(vote.id);
      const sourceVote = freshVote || vote;
      const updatedProposals = sourceVote.proposals.map((p) =>
        p.id === proposalId ? { ...p, content } : p
      );
      await adapter.updateVote(vote.id, { proposals: updatedProposals });
      const updatedVote = { ...sourceVote, proposals: updatedProposals };
      syncVoteToYjs(vote.id, updatedVote);
      eventBus.publish("votesChanged");
      setSavedDrafts((prev) => ({ ...prev, [proposalId]: content }));
      setDraftChanges((prev) => {
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
      return content;
    } catch (error) {
      console.error("Error saving draft:", error);
      return null;
    } finally {
      setSavingDraft((prev) => ({ ...prev, [proposalId]: false }));
    }
  }, [draftChanges, vote]);

  React.useEffect(() => {
    const keys = Object.keys(savedDrafts);
    if (keys.length === 0) return;
    const stale: string[] = [];
    for (const proposalId of keys) {
      const proposal = vote.proposals.find((p) => p.id === proposalId);
      if (proposal && proposal.content === savedDrafts[proposalId]) {
        stale.push(proposalId);
      }
    }
    if (stale.length > 0) {
      setSavedDrafts((prev) => {
        const next = { ...prev };
        for (const id of stale) delete next[id];
        return next;
      });
    }
  }, [vote.proposals, savedDrafts]);

  const handleOpenRound = React.useCallback(async (proposalId: string) => {
    await handleSaveDraft(proposalId);
    onOpenRound(proposalId);
  }, [handleSaveDraft, onOpenRound]);

  return (
    <div className="space-y-4">
      {activeProposals.length > 1 && (
        <div className="flex gap-2 mb-2">
          {activeProposals.map((p) => {
            const proposalLoops = loops.filter((l) => l.proposalId === p.id);
            const currentOpenLoop = proposalLoops.find((l) => !l.closedAt);
            const isExpanded = expandedProposalId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setExpandedProposalId(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isExpanded
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.description || tt("voting.proposalN", { n: activeProposals.indexOf(p) + 1 })}
                {currentOpenLoop && (
                  <span className="ml-1 inline-block w-2 h-2 rounded-full bg-green-400" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {activeProposals.map((proposal) => {
        const proposalLoops = loops
          .filter((l) => l.proposalId === proposal.id)
          .sort((a, b) => a.roundNumber - b.roundNumber);
        const currentOpenLoop = proposalLoops.find((l) => !l.closedAt);
        const canOpenNewRound = isOpen && !currentOpenLoop;
        const showPreRoundEditor = canOpenNewRound && (isModerator || vote.ownerId === "me");
        const hasDraftChange = draftChanges[proposal.id] !== undefined;
        const isSavingThis = !!savingDraft[proposal.id];
        const currentDraft = hasDraftChange ? draftChanges[proposal.id]! : (savedDrafts[proposal.id] || proposal.content || "");

        if (activeProposals.length > 1 && proposal.id !== expandedProposalId) {
          return null;
        }

        return (
          <div key={proposal.id} className="space-y-4 border rounded-lg p-4">
            {activeProposals.length > 1 && (
              <h4 className="text-sm font-medium text-gray-800 mb-2">
                {proposal.description || tt("voting.proposalN", { n: activeProposals.indexOf(proposal) + 1 })}
              </h4>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <LoopRoundControls
                vote={vote}
                loops={loops}
                proposalId={proposal.id}
                onOpenRound={() => handleOpenRound(proposal.id)}
                onCloseRound={onCloseRound}
                isModerator={isModerator}
              />
              {proposalLoops.filter((l) => l.closedAt).length >= 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDiffProposalId(proposal.id);
                    setDiffOpen(true);
                  }}
                >
                  <GitCompare className="w-4 h-4 mr-1" />
                  {t.labels.roundComparison}
                </Button>
              )}
            </div>

            <Separator />

            {currentOpenLoop ? (
              <LoopRoundEditor
                loop={currentOpenLoop}
                vote={vote}
                onChange={(content) => {
                  onUpdateRoundContent(currentOpenLoop.id, content);
                }}
                readOnly={!(isModerator || vote.ownerId === "me")}
              />
            ) : showPreRoundEditor ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t.labels.currentRoundProposal} — {t.labels.round} {proposalLoops.length + 1}
                  </Label>
                  <span className={`text-xs font-medium ${hasDraftChange ? "text-amber-600" : "text-blue-500"}`}>
                    {hasDraftChange ? t.labels.draftUnsaved : tt("voting.editableBeforeRound")}
                  </span>
                </div>
                <BlockNoteProposalEditor
                  value={currentDraft}
                  onChange={(json) => handleDraftChange(proposal.id, json)}
                  placeholder={tt("voting.placeholders.refineNextRound")}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSaveDraft(proposal.id)}
                    disabled={!hasDraftChange || isSavingThis}
                    variant={hasDraftChange ? "default" : "outline"}
                    className={hasDraftChange ? "bg-blue-600 hover:bg-blue-700" : ""}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    {isSavingThis ? t.buttons.saving : t.buttons.saveDraft}
                  </Button>
                  {!hasDraftChange && (
                    <span className="text-xs text-green-600 font-medium">
                      {t.labels.draftSaved}
                    </span>
                  )}
                </div>
              </div>
            ) : currentOpenLoop === undefined && proposalLoops.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {t.messages.noRoundsYet}
              </p>
            ) : null}

            <Separator />

            <h3 className="text-sm font-medium text-gray-700">{t.labels.perRoundResults}</h3>
            <LoopRoundTabs
              loops={loops}
              responses={voteResponses}
              proposalId={proposal.id}
            />
          </div>
        );
      })}

      <LoopRoundDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        loops={loops}
        proposalId={diffProposalId}
        proposalLabel={activeProposals.find((p) => p.id === diffProposalId)?.description}
      />
    </div>
  );
};

const VoteDetailPanel: React.FC<{
  vote: VoteEntity;
  onBack: () => void;
  onEdit: () => void;
  onFinalize: (outcome: VoteEntity["outcome"]) => Promise<void>;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
  onOpenPublic: (slug: string) => void;
  onPhaseChange: (id: string, phase: VoteEntity["config"]["phase"]) => Promise<void>;
}> = ({ vote, onBack, onEdit, onFinalize, onDelete, onReset, onOpenPublic, onPhaseChange }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false);
  const [showResetDialog, setShowResetDialog] = React.useState(false);
  const [activeDetailTab, setActiveDetailTab] = React.useState<"results" | "rounds" | "moderation">("results");
  const isDecision = vote.config.kind === "decision";
  const isFinalized = vote.config.phase === "FINALIZED";
  const canFinalize = isDecision && (vote.config.phase === "CLOSED" || vote.config.phase === "OPEN");
  const canOpen = vote.config.phase === "IDLE";
  const canClose = vote.config.phase === "OPEN";
  const canReset = !isFinalized && !canOpen;
  const isConsentLoop = vote.config.mode === "CONSENT_LOOP";

  const { loops, openRound, closeRound, updateRoundContent, loadLoops } = useVoteLoops(vote.id);

  const handleOpenRound = async (proposalId: string) => {
    const adapter = await getPersistenceAdapter();
    const freshVote = await adapter.getVoteById(vote.id);
    const sourceVote = freshVote || vote;
    const proposal = sourceVote.proposals.find((p) => p.id === proposalId);
    const inheritContent = proposal?.content || "";
    await openRound(proposalId, "me", inheritContent);
  };

  const handleCloseRound = async (loopId: string) => {
    const loop = loops.find((l) => l.id === loopId);
    const updated = await closeRound(loopId);
    if (updated && loop) {
      const adapter = await getPersistenceAdapter();
      const updatedProposals = vote.proposals.map((p) =>
        p.id === loop.proposalId ? { ...p, content: updated.proposalContent || p.content } : p
      );
      await adapter.updateVote(vote.id, { proposals: updatedProposals });
      const updatedVote = { ...vote, proposals: updatedProposals };
      syncVoteToYjs(vote.id, updatedVote);
      eventBus.publish("votesChanged");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {tt("voting.back")}
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{vote.title}</h2>
          <p className="text-xs text-gray-400">/v/{vote.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenPublic(vote.slug)}
            title={tt("voting.openPublicPage")}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" title={tt("voting.share")}>
                <Share2 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <QRCodeBlock slug={vote.slug} />
            </PopoverContent>
          </Popover>
        {canReset && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowResetDialog(true)}
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {t.buttons.reset}
          </Button>
        )}
        {!isFinalized && (
            <Button variant="ghost" size="sm" onClick={onEdit} title={tt("voting.edit")}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {canOpen && (
          <Button
            size="sm"
          onClick={() => {
            void onPhaseChange(vote.id, "OPEN").then(() => loadLoops());
          }}
          className="bg-green-600 hover:bg-green-700"
          >
            <ToggleLeft className="w-4 h-4 mr-1" />
            {t.buttons.openVote}
          </Button>
        )}
        {canClose && !isConsentLoop && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPhaseChange(vote.id, "CLOSED")}
          >
            {t.buttons.closeVote}
          </Button>
        )}
        {canClose && isConsentLoop && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPhaseChange(vote.id, "CLOSED")}
          >
            {t.buttons.closeVote}
          </Button>
        )}
        {canFinalize && !isConsentLoop && (
          <Button
            size="sm"
            onClick={() => setShowFinalizeDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-1" />
            {t.buttons.finalize}
          </Button>
        )}
        {!isFinalized && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(vote.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {t.buttons.delete}
          </Button>
        )}
      </div>

      {isConsentLoop && (
        <div className="mb-4">
          <Tabs value={activeDetailTab} onValueChange={(v) => setActiveDetailTab(v as "results" | "rounds" | "moderation")}>
            <TabsList>
              <TabsTrigger value="rounds">{t.labels.rounds}</TabsTrigger>
              <TabsTrigger value="results">{t.labels.results}</TabsTrigger>
              <TabsTrigger value="moderation">
                <Shield className="w-3 h-3 mr-1" />
                {t.labels.moderation}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="rounds">
              <ConsentLoopPanel
                vote={vote}
                loops={loops}
                responses={[]}
                onOpenRound={handleOpenRound}
                onCloseRound={handleCloseRound}
                onUpdateRoundContent={updateRoundContent}
              />
            </TabsContent>
            <TabsContent value="results">
              <VoteResults vote={vote} />
            </TabsContent>
            <TabsContent value="moderation">
              <ModerationPanel
                vote={vote}
                currentUserId={vote.ownerId}
                onOpenModerationPopout={(token) => {
                  window.open(`${window.location.origin}/v/${vote.slug}/m/${token}`, "_blank");
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {!isConsentLoop && (
        <div className="mb-4">
          <Tabs value={activeDetailTab} onValueChange={(v) => setActiveDetailTab(v as "results" | "rounds" | "moderation")}>
            <TabsList>
              <TabsTrigger value="results">{t.labels.results}</TabsTrigger>
              <TabsTrigger value="moderation">
                <Shield className="w-3 h-3 mr-1" />
                {t.labels.moderation}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="results">
              <div className="flex-1 overflow-auto">
                <VoteResults vote={vote} />
              </div>
            </TabsContent>
            <TabsContent value="moderation">
              <ModerationPanel
                vote={vote}
                currentUserId={vote.ownerId}
                onOpenModerationPopout={(token) => {
                  window.open(`${window.location.origin}/v/${vote.slug}/m/${token}`, "_blank");
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      <FinalizeDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        vote={vote}
        onFinalize={onFinalize}
      />

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>{t.buttons.reset}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.messages.resetConfirm}
            <span className="block mt-2 text-orange-600 font-medium">{t.messages.resetWarning}</span>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.buttons.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onReset(vote.id);
                setShowResetDialog(false);
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {t.buttons.reset}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const VotingPage: React.FC = () => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const [activeTab, setActiveTab] = React.useState<VotingTab>("consultations");
  const kind: VoteKind = activeTab === "consultations" ? "consultation" : "decision";
  const { votes, isLoading, createVote, updateVote, deleteVote, finalizeVote, resetVote } = useVotes({ kind });

  const [selectedVote, setSelectedVote] = React.useState<VoteEntity | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorVote, setEditorVote] = React.useState<VoteEntity | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  React.useEffect(() => {
    const openVoteId = searchParams.get("openVoteId");
    if (openVoteId && !selectedVote) {
      const vote = votes.find((v) => v.id === openVoteId);
      if (vote) {
        setSelectedVote(vote);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, votes, selectedVote, setSearchParams]);

  const handleCreate = () => {
    setEditorVote(null);
    setEditorOpen(true);
  };

  const handleSelectVote = (vote: VoteEntity) => {
    setSelectedVote(vote);
  };

  const handleEditVote = () => {
    if (selectedVote) {
      const freshVote = votes.find((v) => v.id === selectedVote.id) || selectedVote;
      setEditorVote({ ...freshVote });
      setEditorOpen(true);
    }
  };

  const handleSaveVote = async (input: Partial<VoteEntity>) => {
    if (input.id) {
      await updateVote(input.id, input);
    } else {
      await createVote({
        ...input,
        ownerId: "me",
        config: {
          ...input.config!,
          kind,
          phase: "IDLE",
        },
        proposals: input.proposals || [{ id: crypto.randomUUID(), content: "", position: 0, active: true }],
      });
    }
  };

  const handlePhaseChange = async (id: string, phase: VoteEntity["config"]["phase"]) => {
    const vote = votes.find((v) => v.id === id);
    if (!vote) return;
    await updateVote(id, {
      config: { ...vote.config, phase },
    });
    if (selectedVote?.id === id) {
      setSelectedVote({ ...selectedVote, config: { ...selectedVote.config, phase } });
    }

    // For CONSENT_LOOP mode, automatically open the first round for each
    // active proposal when the vote transitions to OPEN.
    if (
      phase === "OPEN" &&
      vote.config.mode === "CONSENT_LOOP" &&
      vote.config.phase !== "OPEN"
    ) {
      try {
        const adapter = await getPersistenceAdapter();
        const freshVote = await adapter.getVoteById(id);
        const sourceVote = freshVote || vote;
        const existingLoops = await adapter.listVoteLoops(id);
        const activeProposals = sourceVote.proposals.filter((p) => p.active);

        for (const proposal of activeProposals) {
          const hasOpenRound = existingLoops.some(
            (l) => l.proposalId === proposal.id && !l.closedAt
          );
          if (!hasOpenRound) {
            const proposalLoops = existingLoops.filter((l) => l.proposalId === proposal.id);
            await adapter.createVoteLoop(id, {
              proposalId: proposal.id,
              proposalContent: proposal.content || "",
              openedByUserId: "me",
              openedAt: new Date().toISOString(),
              roundNumber: proposalLoops.length + 1,
            });
          }
        }
        eventBus.publish("voteLoopsChanged");
      } catch (error) {
        console.error("Error auto-opening first round:", error);
      }
    }
  };

  const handleFinalize = async (outcome: VoteEntity["outcome"]) => {
    if (!selectedVote) return;
    await finalizeVote(selectedVote.id, outcome);
  };

  const handleDelete = async (id: string) => {
    await deleteVote(id);
    if (selectedVote?.id === id) {
      setSelectedVote(null);
    }
  };

  const handleReset = async (id: string) => {
    const updated = await resetVote(id);
    if (updated && selectedVote?.id === id) {
      setSelectedVote(updated);
    }
  };

  const handleOpenPublic = (slug: string) => {
    window.open(`${window.location.origin}/v/${slug}`, "_blank");
  };

  if (selectedVote) {
    const currentVote = votes.find((v) => v.id === selectedVote.id) || selectedVote;
    return (
      <div className="flex flex-col h-full p-6">
        <VoteDetailPanel
          vote={currentVote}
          onBack={() => setSelectedVote(null)}
          onEdit={handleEditVote}
          onFinalize={handleFinalize}
          onDelete={handleDelete}
          onReset={handleReset}
          onOpenPublic={handleOpenPublic}
          onPhaseChange={handlePhaseChange}
        />
        <VoteEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          vote={editorVote}
          onSave={handleSaveVote}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Vote className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-semibold">{t.labels.voting}</h1>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-red-600 hover:bg-red-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          {tt("voting.newPrefix")} {activeTab === "consultations" ? t.pages.newConsultation : t.pages.newDecision}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VotingTab)}>
        <TabsList>
          <TabsTrigger value="consultations">{t.pages.consultations}</TabsTrigger>
          <TabsTrigger value="decisions">{t.pages.decisions}</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="flex-1 overflow-auto mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">{t.messages.loading}</p>
              </div>
            ) : votes.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <Vote className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">{activeTab === "consultations" ? t.pages.noConsultationsYet : t.pages.noDecisionsYet}</p>
                  <p className="text-sm mt-1">
                    {activeTab === "consultations"
                      ? t.pages.createConsultationDescription
                      : t.pages.createDecisionDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {votes.map((vote) => (
                  <VoteCard
                    key={vote.id}
                    vote={vote}
                    onSelect={handleSelectVote}
                    onDelete={handleDelete}
                    onOpenPublic={handleOpenPublic}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <VoteEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        vote={editorVote}
        onSave={handleSaveVote}
      />
    </div>
  );
};

export default VotingPage;