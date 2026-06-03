import * as React from "react";
import { useParams } from "react-router-dom";
import { useModeratorToken } from "@/hooks/useVoteModerators";
import { useVoteLoops } from "@/hooks/useVoteLoops";
import { useVoteResults } from "@/hooks/useVotes";
import { VoteEntity, VoteLoop } from "@/lib/persistence-types";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { VOTING_MODES_LABELS, MJ_SCALE } from "@/components/planView/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VoteResults } from "@/components/voting/VoteResults";
import { LoopRoundControls } from "@/components/voting/LoopRoundControls";
import { LoopRoundEditor } from "@/components/voting/LoopRoundEditor";
import { LoopRoundTabs } from "@/components/voting/LoopRoundTabs";
import { LoopRoundDiffDialog } from "@/components/voting/LoopRoundDiffDialog";
import { BlockNoteProposalEditor } from "@/components/voting/BlockNoteProposalEditor";
import {
  Vote,
  Shield,
  AlertTriangle,
  Eye,
  PenLine,
  GitCompare,
} from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";



const LoopPanel: React.FC<{
  vote: VoteEntity;
  moderatorDisplayName: string;
}> = ({ vote, moderatorDisplayName }) => {
  const t = getVotingStrings();
  const { loops, openRound, closeRound, updateRoundContent } = useVoteLoops(vote.id);
  const { responses: voteResponses } = useVoteResults(vote.id);
  const activeProposals = vote.proposals.filter((p) => p.active);
  const isOpen = vote.config.phase === "OPEN";
  const [expandedProposalId, setExpandedProposalId] = React.useState<string>(activeProposals[0]?.id || "");
  const [diffOpen, setDiffOpen] = React.useState(false);
  const [diffProposalId, setDiffProposalId] = React.useState<string>("");
  const proposalUpdateTimerRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleOpenRound = async (proposalId: string, content?: string) => {
    const proposal = vote.proposals.find((p) => p.id === proposalId);
    const inheritContent = content || proposal?.content || "";
    await openRound(proposalId, moderatorDisplayName, inheritContent);
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
    }
  };

  const handleUpdateProposal = React.useCallback(async (proposalId: string, content: string) => {
    if (proposalUpdateTimerRef.current[proposalId]) {
      clearTimeout(proposalUpdateTimerRef.current[proposalId]);
    }
    proposalUpdateTimerRef.current[proposalId] = setTimeout(async () => {
      const adapter = await getPersistenceAdapter();
      const updatedProposals = vote.proposals.map((p) =>
        p.id === proposalId ? { ...p, content } : p
      );
      await adapter.updateVote(vote.id, { proposals: updatedProposals });
    }, 500);
  }, [vote.id, vote.proposals]);

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
                {p.description || `Proposal ${(activeProposals.indexOf(p) + 1)}`}
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
        const currentDraft = proposal.content || "";

        if (activeProposals.length > 1 && proposal.id !== expandedProposalId) {
          return null;
        }

        return (
          <div key={proposal.id} className="space-y-4 border rounded-lg p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <LoopRoundControls
                vote={vote}
                loops={loops}
                proposalId={proposal.id}
                onOpenRound={() => handleOpenRound(proposal.id, proposal.content || "")}
                onCloseRound={handleCloseRound}
                isModerator={true}
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
                  updateRoundContent(currentOpenLoop.id, content);
                }}
                readOnly={false}
              />
            ) : canOpenNewRound ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t.labels.currentRoundProposal} — {t.labels.round} {proposalLoops.length + 1}
                  </Label>
                  <span className="text-xs text-blue-500 font-medium">
                    Editable before starting round
                  </span>
                </div>
                <BlockNoteProposalEditor
                  value={currentDraft}
                  onChange={(json) => handleUpdateProposal(proposal.id, json)}
                  placeholder="Modify the proposal text for the next round..."
                />
              </div>
            ) : proposalLoops.length === 0 ? (
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

const ProposalEditorPanel: React.FC<{
  vote: VoteEntity;
  moderatorDisplayName: string;
}> = ({ vote, moderatorDisplayName: _moderatorDisplayName }) => {
  const t = getVotingStrings();
  const [proposals, setProposals] = React.useState(vote.proposals);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleProposalChange = (proposalId: string, content: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, content } : p))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const adapter = await getPersistenceAdapter();
      await adapter.updateVote(vote.id, { proposals });
    } finally {
      setIsSaving(false);
    }
  };

  if (vote.config.mode === "CONSENT_LOOP") {
    return (
      <LoopPanel vote={vote} moderatorDisplayName={_moderatorDisplayName} />
    );
  }

  return (
    <div className="space-y-4">
      {proposals.map((proposal, index) => (
        <div key={proposal.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Proposal {index + 1}
            </Badge>
            {proposal.infoUrl && (
              <a
                href={proposal.infoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                {t.buttons.moreInfo}
              </a>
            )}
          </div>
          <BlockNoteProposalEditor
            value={proposal.content || ""}
            onChange={(json) => handleProposalChange(proposal.id, json)}
            placeholder={`Proposal ${index + 1} content...`}
          />
        </div>
      ))}

      <Button onClick={handleSave} disabled={isSaving} size="sm">
        <PenLine className="w-4 h-4 mr-1" />
        {isSaving ? t.buttons.saving : "Save proposals"}
      </Button>
    </div>
  );
};

export const ModerationPopout: React.FC = () => {
  const t = getVotingStrings();
  const { token } = useParams<{ token: string }>();
  const { vote, moderator, isLoading, error } = useModeratorToken(token || null);
  const [activeTab, setActiveTab] = React.useState<"edit" | "results">("edit");
  const isConsentLoop = vote?.config.mode === "CONSENT_LOOP";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center text-gray-400">
          <Vote className="w-12 h-12 mx-auto mb-3 animate-pulse" />
          <p>{t.messages.loadingModeration}</p>
        </div>
      </div>
    );
  }

  if (error || !vote || !moderator) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center text-red-500 max-w-md">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
          <p className="text-lg font-medium">{t.messages.accessDenied}</p>
          <p className="text-sm mt-1">
            {error || t.messages.invalidModLink}
          </p>
        </div>
      </div>
    );
  }

  const phaseLabel = t.phases[vote.config.phase] || vote.config.phase;
  const modeLabel = VOTING_MODES_LABELS[vote.config.mode] || vote.config.mode;
  const publicUrl = `${window.location.origin}/v/${vote.slug}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Vote className="w-5 h-5 text-red-500 shrink-0" />
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {vote.title}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="bg-purple-50 text-purple-700 border-purple-200"
            >
              <Shield className="w-3 h-3 mr-1" />
              {moderator.displayName}
            </Badge>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
              title="Open public page"
            >
              <Eye className="w-4 h-4" />
            </a>
          </div>
        </div>
        <div className="max-w-4xl mx-auto flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-xs">
            {modeLabel}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {phaseLabel}
          </Badge>
            {vote.config.kind === "decision" && (
              <Badge className="text-xs bg-orange-100 text-orange-700">
                {t.kinds.decision}
              </Badge>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <div className="mb-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "results")}>
            <TabsList>
              <TabsTrigger value="edit">
            {isConsentLoop ? t.labels.rounds : t.labels.proposals}
              </TabsTrigger>
              <TabsTrigger value="results">{t.labels.results}</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <ProposalEditorPanel
                vote={vote}
                moderatorDisplayName={moderator.displayName}
              />
            </TabsContent>
            <TabsContent value="results">
              <VoteResults vote={vote} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ModerationPopout;