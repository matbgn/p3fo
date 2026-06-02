import React, { useState } from 'react';
import { Vote, Plus, BarChart3, Clock, Trash2, ExternalLink } from 'lucide-react';
import { useVotes } from '@/hooks/useVotes';
import { VoteEntity, VoteKind } from '@/lib/persistence-types';
import { VOTING_MODES_LABELS } from '@/components/planView/constants';

type VotingTab = 'consultations' | 'decisions';

const PHASE_LABELS: Record<string, string> = {
  IDLE: 'Draft',
  OPEN: 'Open',
  CLOSED: 'Closed',
  FINALIZED: 'Finalized',
};

const PHASE_COLORS: Record<string, string> = {
  IDLE: 'bg-gray-100 text-gray-700',
  OPEN: 'bg-green-100 text-green-700',
  CLOSED: 'bg-yellow-100 text-yellow-700',
  FINALIZED: 'bg-blue-100 text-blue-700',
};

const VoteCard: React.FC<{ vote: VoteEntity; onOpen: (id: string) => void; onDelete: (id: string) => void }> = ({ vote, onOpen, onDelete }) => {
  const phaseLabel = PHASE_LABELS[vote.config.phase] || vote.config.phase;
  const phaseColor = PHASE_COLORS[vote.config.phase] || 'bg-gray-100 text-gray-700';
  const modeLabel = VOTING_MODES_LABELS[vote.config.mode] || vote.config.mode;

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onOpen(vote.id)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{vote.title}</h3>
          {vote.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{vote.description}</p>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(vote.id); }}
          className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${phaseColor}`}>{phaseLabel}</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">{modeLabel}</span>
        {vote.config.kind === 'decision' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Decision</span>
        )}
        {vote.config.kind === 'consultation' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">Consultation</span>
        )}
        {vote.linkedTaskId && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />Linked task
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(vote.createdAt).toLocaleDateString()}</span>
        <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />/v/{vote.slug}</span>
      </div>
    </div>
  );
};

const VotingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VotingTab>('consultations');
  const kind: VoteKind = activeTab === 'consultations' ? 'consultation' : 'decision';
  const { votes, isLoading, createVote, deleteVote } = useVotes({ kind });

  const handleCreate = async () => {
    await createVote({
      title: `New ${activeTab === 'consultations' ? 'Consultation' : 'Decision'}`,
      ownerId: 'me',
      config: {
        mode: 'THUMBS_UP',
        kind,
        phase: 'IDLE',
      },
      proposals: [{ id: crypto.randomUUID(), content: '', position: 0, active: true }],
    });
  };

  const handleOpen = (id: string) => {
    const vote = votes.find(v => v.id === id);
    if (vote) {
      const url = `${window.location.origin}/v/${vote.slug}`;
      window.open(url, '_blank');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteVote(id);
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Vote className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-semibold">Voting</h1>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New {activeTab === 'consultations' ? 'Consultation' : 'Decision'}
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('consultations')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'consultations'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Consultations
        </button>
        <button
          onClick={() => setActiveTab('decisions')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'decisions'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Decisions
        </button>
      </div>

      <div className="flex-1 overflow-auto">
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
                {activeTab === 'consultations'
                  ? 'Create consultations to gather input from your audience'
                  : 'Create decisions with formal binding outcomes'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {votes.map(vote => (
              <VoteCard key={vote.id} vote={vote} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingPage;