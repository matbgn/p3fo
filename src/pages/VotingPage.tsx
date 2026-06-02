import * as React from "react";
import { Vote, Plus, BarChart3, Clock, Trash2, ExternalLink, Eye, Trophy, Edit, ToggleLeft } from "lucide-react";
import { useVotes } from "@/hooks/useVotes";
import { VoteEntity, VoteKind } from "@/lib/persistence-types";
import { VOTING_MODES_LABELS } from "@/components/planView/constants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VoteEditor } from "@/components/voting/VoteEditor";
import { VoteResults } from "@/components/voting/VoteResults";
import { FinalizeDialog } from "@/components/voting/FinalizeDialog";

type VotingTab = "consultations" | "decisions";

const PHASE_LABELS: Record<string, string> = {
  IDLE: "Draft",
  OPEN: "Open",
  CLOSED: "Closed",
  FINALIZED: "Finalized",
};

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
  const phaseLabel = PHASE_LABELS[vote.config.phase] || vote.config.phase;
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
            Decision
          </span>
        )}
        {vote.config.kind === "consultation" && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
            Consultation
          </span>
        )}
        {vote.linkedTaskId && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Linked task
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

const VoteDetailPanel: React.FC<{
  vote: VoteEntity;
  onBack: () => void;
  onEdit: () => void;
  onFinalize: (outcome: VoteEntity["outcome"]) => Promise<void>;
  onDelete: (id: string) => void;
  onOpenPublic: (slug: string) => void;
  onPhaseChange: (id: string, phase: VoteEntity["config"]["phase"]) => void;
}> = ({ vote, onBack, onEdit, onFinalize, onDelete, onOpenPublic, onPhaseChange }) => {
  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false);
  const isDecision = vote.config.kind === "decision";
  const isFinalized = vote.config.phase === "FINALIZED";
  const canFinalize = isDecision && (vote.config.phase === "CLOSED" || vote.config.phase === "OPEN");
  const canOpen = vote.config.phase === "IDLE";
  const canClose = vote.config.phase === "OPEN";

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
            Open vote
          </Button>
        )}
        {canClose && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPhaseChange(vote.id, "CLOSED")}
          >
            Close vote
          </Button>
        )}
        {canFinalize && (
          <Button
            size="sm"
            onClick={() => setShowFinalizeDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Trophy className="w-4 h-4 mr-1" />
            Finalize
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
            Delete
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <VoteResults vote={vote} />
      </div>

      <FinalizeDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        vote={vote}
        onFinalize={onFinalize}
      />
    </div>
  );
};

const VotingPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<VotingTab>("consultations");
  const kind: VoteKind = activeTab === "consultations" ? "consultation" : "decision";
  const { votes, isLoading, createVote, updateVote, deleteVote, finalizeVote } = useVotes({ kind });

  const [selectedVote, setSelectedVote] = React.useState<VoteEntity | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorVote, setEditorVote] = React.useState<VoteEntity | null>(null);

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
          onOpenPublic={handleOpenPublic}
          onPhaseChange={handlePhaseChange}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Vote className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-semibold">Voting</h1>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-red-600 hover:bg-red-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New {activeTab === "consultations" ? "Consultation" : "Decision"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VotingTab)}>
        <TabsList>
          <TabsTrigger value="consultations">Consultations</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="flex-1 overflow-auto mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Loading...</p>
              </div>
            ) : votes.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <Vote className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">No {activeTab} yet</p>
                  <p className="text-sm mt-1">
                    {activeTab === "consultations"
                      ? "Create consultations to gather input from your audience"
                      : "Create decisions with formal binding outcomes"}
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