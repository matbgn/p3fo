import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Vote, Plus, BarChart3, Clock, Trash2, ExternalLink, Eye, Trophy, Edit, ToggleLeft, GitCompare, Shield, Share2, RotateCcw } from "lucide-react";
import { useVotes, useVoteResults } from "@/hooks/useVotes";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { getVotingStrings } from "@/lib/voting-i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoteEntity, VoteKind } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS } from "@/components/planView/constants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { ModerationPanel } from "@/components/voting/ModerationPanel";
import QRCodeBlock from "@/components/voting/QRCodeBlock";
import { deserializeBlocks } from "@/components/voting/BlockNoteProposalEditor";

type VotingTab = "consultations" | "decisions";

function mergeProposalContents(contents: string[]): string {
  const allBlocks: unknown[] = [];
  for (const c of contents) {
    if (!c || c.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) {
        allBlocks.push(...parsed);
        continue;
      }
    } catch {
      // not JSON, treat as plain text paragraph
    }
    allBlocks.push({ type: "paragraph", content: [{ type: "text", text: c }] });
  }
  return JSON.stringify(
    allBlocks.length > 0
      ? allBlocks
      : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
  );
}

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
  const phaseLabel = t.phases[vote.config.phase] || vote.config.phase;
  const phaseColor = PHASE_COLORS[vote.config.phase] || "bg-gray-100 text-gray-700";
  const modeLabel = VOTING_MODES_LABELS[vote.config.mode] || vote.config.mode;

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
            title="Open public page"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(vote.id);
            }}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
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
  onOpenRound: () => void;
  onCloseRound: (gatingValue: -1 | 0 | 1, gatingComment?: string) => void;
  onFinalize: (verdict: "ADOPTED" | "WITHDRAWN" | "BLOCKED", finalLoopId?: string) => void;
  onUpdateRoundContent: (loopId: string, content: string) => void;
}> = ({ vote, loops, responses, onOpenRound, onCloseRound, onFinalize, onUpdateRoundContent }) => {
  const t = getVotingStrings();
  const [showDiffDialog, setShowDiffDialog] = React.useState(false);
  const { responses: voteResponses } = useVoteResults(vote.id);
  const firstProposalId = vote.proposals[0]?.id || "";

  const currentOpenLoop = [...loops]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .find((l) => !l.closedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">{t.labels.roundControls}</h3>
        {loops.filter((l) => l.closedAt).length >= 2 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDiffDialog(true)}
          >
            <GitCompare className="w-4 h-4 mr-1" />
            {t.labels.roundComparison}
          </Button>
        )}
      </div>

      <LoopRoundControls
        vote={vote}
        loops={loops}
        onOpenRound={onOpenRound}
        onCloseRound={onCloseRound}
        onFinalize={onFinalize}
      />

      <Separator />

      <LoopRoundEditor
        loop={currentOpenLoop || null}
        vote={vote}
        onChange={(content) => {
          if (currentOpenLoop) {
            onUpdateRoundContent(currentOpenLoop.id, content);
          }
        }}
        readOnly={vote.config.phase === "FINALIZED"}
      />

      <Separator />

      <h3 className="text-sm font-medium text-gray-700">{t.labels.perRoundResults}</h3>
      <LoopRoundTabs
        loops={loops}
        responses={voteResponses}
        proposalId={firstProposalId}
        maxRounds={vote.config.consentLoopMaxRounds}
      />

      <LoopRoundDiffDialog
        open={showDiffDialog}
        onOpenChange={setShowDiffDialog}
        loops={loops}
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
  onPhaseChange: (id: string, phase: VoteEntity["config"]["phase"]) => void;
}> = ({ vote, onBack, onEdit, onFinalize, onDelete, onReset, onOpenPublic, onPhaseChange }) => {
  const t = getVotingStrings();
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

  const { loops, openRound, closeRound, updateRoundContent } = useVoteLoops(vote.id);

  const handleOpenRound = async () => {
    const sortedLoops = [...loops].sort((a, b) => a.roundNumber - b.roundNumber);
    const lastLoop = sortedLoops[sortedLoops.length - 1];

    // Re-fetch the vote to get the latest proposals content (the prop may be stale).
    const adapter = await getPersistenceAdapter();
    const freshVote = await adapter.getVoteById(vote.id);
    const sourceVote = freshVote || vote;

    const fallbackProposalContents = sourceVote.proposals
      .filter((p) => p.active)
      .map((p) => p.content)
      .filter((c) => c && c.trim().length > 0);
    const inheritContent = lastLoop?.proposalContent
      || (fallbackProposalContents.length > 0 ? mergeProposalContents(fallbackProposalContents) : "")
      || "";
    await openRound("me", inheritContent);
  };

  const handleCloseRound = async (gatingValue: -1 | 0 | 1, gatingComment?: string) => {
    const currentOpenLoop = [...loops].sort((a, b) => a.roundNumber - b.roundNumber).find((l) => !l.closedAt);
    if (currentOpenLoop) {
      await closeRound(currentOpenLoop.id, gatingValue, gatingComment);
    }
  };

  const handleConsentFinalize = async (verdict: "ADOPTED" | "WITHDRAWN" | "BLOCKED", finalLoopId?: string) => {
    const sortedLoops = [...loops].sort((a, b) => a.roundNumber - b.roundNumber);
    const lastClosedLoop = [...sortedLoops].reverse().find((l) => l.closedAt);
    const effectiveLoopId = finalLoopId || lastClosedLoop?.id;

    const summaries: Record<string, string> = {
      ADOPTED: t.messages.consentLoopAdopted,
      WITHDRAWN: t.messages.consentLoopWithdrawn,
      BLOCKED: t.messages.consentLoopBlocked,
    };

    await onFinalize({
      winningProposalId: verdict === "ADOPTED" ? (vote.proposals[0]?.id || null) : null,
      summary: summaries[verdict],
      finalizedAt: new Date().toISOString(),
      finalizedByUserId: "me",
      loopVerdict: verdict,
      finalLoopId: effectiveLoopId,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          &larr; Back
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
            title="Open public page"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" title="Share">
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
            <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
              <Edit className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {canOpen && (
          <Button
            size="sm"
            onClick={() => onPhaseChange(vote.id, "OPEN")}
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
                onFinalize={handleConsentFinalize}
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
      setEditorVote(selectedVote);
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

    // For CONSENT_LOOP mode, automatically open the first round when the vote
    // transitions to OPEN so voters can immediately see and grade the proposal.
    if (
      phase === "OPEN" &&
      vote.config.mode === "CONSENT_LOOP" &&
      vote.config.phase !== "OPEN"
    ) {
      try {
        const adapter = await getPersistenceAdapter();
        // Re-fetch the vote to get the latest proposals content (the state
        // snapshot may be stale right after a save).
        const freshVote = await adapter.getVoteById(id);
        const sourceVote = freshVote || vote;
        const existingLoops = await adapter.listVoteLoops(id);
        const hasOpenRound = existingLoops.some((l) => !l.closedAt);
        if (!hasOpenRound) {
          const proposalContents = sourceVote.proposals
            .filter((p) => p.active)
            .map((p) => p.content)
            .filter((c) => c && c.trim().length > 0);
          const initialContent = mergeProposalContents(proposalContents);
          await adapter.createVoteLoop(id, {
            proposalContent: initialContent,
            openedByUserId: "me",
            openedAt: new Date().toISOString(),
            roundNumber: existingLoops.length + 1,
          });
        }
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
          New {activeTab === "consultations" ? t.pages.newConsultation : t.pages.newDecision}
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