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
} from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";



const LoopPanel: React.FC<{
  vote: VoteEntity;
  moderatorDisplayName: string;
}> = ({ vote, moderatorDisplayName }) => {
  const t = getVotingStrings();
  const { loops, openRound, closeRound, updateRoundContent } = useVoteLoops(vote.id);
  const { responses: voteResponses } = useVoteResults(vote.id);
  const [showDiffDialog, setShowDiffDialog] = React.useState(false);

  const sortedLoops = React.useMemo(
    () => [...loops].sort((a, b) => a.roundNumber - b.roundNumber),
    [loops]
  );
  const currentOpenLoop = sortedLoops.find((l) => !l.closedAt);
  const lastClosedLoop = [...sortedLoops].reverse().find((l) => l.closedAt);
  const firstProposalId = vote.proposals[0]?.id || "";

  const handleOpenRound = async () => {
    const lastLoop = sortedLoops[sortedLoops.length - 1];
    const inheritContent = lastLoop?.proposalContent || vote.proposals[0]?.content || "";
    await openRound(moderatorDisplayName, inheritContent);
  };

  const handleCloseRound = async (gatingValue: -1 | 0 | 1, gatingComment?: string) => {
    if (currentOpenLoop) {
      await closeRound(currentOpenLoop.id, gatingValue, gatingComment);
    }
  };

  const handleFinalize = async (
    verdict: "ADOPTED" | "WITHDRAWN" | "BLOCKED",
    finalLoopId?: string
  ) => {
    const effectiveLoopId = finalLoopId || lastClosedLoop?.id;
    const adapter = await getPersistenceAdapter();
    await adapter.finalizeVote(vote.id, {
      winningProposalId: verdict === "ADOPTED" ? (vote.proposals[0]?.id || null) : null,
      summary:
        verdict === "ADOPTED"
          ? t.messages.consentLoopAdopted
          : verdict === "WITHDRAWN"
          ? t.messages.consentLoopWithdrawn
          : t.messages.consentLoopBlocked,
      finalizedAt: new Date().toISOString(),
      finalizedByUserId: vote.ownerId,
      loopVerdict: verdict,
      finalLoopId: effectiveLoopId,
    });
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <LoopRoundControls
        vote={vote}
        loops={loops}
        onOpenRound={handleOpenRound}
        onCloseRound={handleCloseRound}
        onFinalize={handleFinalize}
        isModerator={true}
      />

      <Separator />

      <LoopRoundEditor
        loop={currentOpenLoop || null}
        onChange={(content) => {
          if (currentOpenLoop) {
            updateRoundContent(currentOpenLoop.id, content);
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

      {sortedLoops.filter((l) => l.closedAt).length >= 2 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowDiffDialog(true)}
        >
          {t.labels.roundComparison}
        </Button>
      )}

      <LoopRoundDiffDialog
        open={showDiffDialog}
        onOpenChange={setShowDiffDialog}
        loops={loops}
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