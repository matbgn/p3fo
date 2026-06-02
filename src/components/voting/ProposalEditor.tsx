import * as React from "react";
import { Plus, Trash2, GripVertical, ExternalLink } from "lucide-react";
import { VoteProposal, VoteKind } from "@/lib/persistence-types";
import { BlockNoteProposalEditor } from "./BlockNoteProposalEditor";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ProposalEditorProps {
  proposals: VoteProposal[];
  onChange: (proposals: VoteProposal[]) => void;
  kind: VoteKind;
  allowAudienceProposals?: boolean;
  onAllowAudienceProposalsChange?: (value: boolean) => void;
  readOnly?: boolean;
}

export const ProposalEditor: React.FC<ProposalEditorProps> = ({
  proposals,
  onChange,
  kind,
  allowAudienceProposals = false,
  onAllowAudienceProposalsChange,
  readOnly = false,
}) => {
  const updateProposal = (index: number, patch: Partial<VoteProposal>) => {
    const next = [...proposals];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeProposal = (index: number) => {
    if (proposals.length <= 1) return;
    onChange(proposals.filter((_, i) => i !== index));
  };

  const addProposal = () => {
    onChange([
      ...proposals,
      {
        id: crypto.randomUUID(),
        content: "",
        position: proposals.length,
        active: true,
      },
    ]);
  };

  const moveProposal = (from: number, to: number) => {
    if (to < 0 || to >= proposals.length) return;
    const next = [...proposals];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next.map((p, i) => ({ ...p, position: i })));
  };

  return (
    <div className="space-y-4">
      {proposals.map((proposal, index) => (
        <div
          key={proposal.id}
          className="border rounded-lg p-4 bg-white"
        >
          <div className="flex items-center gap-2 mb-3">
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => moveProposal(index, index - 1)}
                >
                  <GripVertical className="w-4 h-4 rotate-180" />
                </button>
                <button
                  type="button"
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={index === proposals.length - 1}
                  onClick={() => moveProposal(index, index + 1)}
                >
                  <GripVertical className="w-4 h-4" />
                </button>
              </div>
            )}
            <span className="text-sm font-medium text-gray-700">
              Proposal {index + 1}
            </span>
            {!readOnly && proposals.length > 1 && (
              <button
                type="button"
                className="ml-auto p-1 text-gray-400 hover:text-red-500 transition-colors"
                onClick={() => removeProposal(index)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  Description (plain text)
                </Label>
                <Input
                  value={proposal.description || ""}
                  onChange={(e) =>
                    updateProposal(index, { description: e.target.value })
                  }
                  placeholder="Optional short description"
                  disabled={readOnly}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  Info URL
                </Label>
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                  <Input
                    value={proposal.infoUrl || ""}
                    onChange={(e) =>
                      updateProposal(index, { infoUrl: e.target.value })
                    }
                    placeholder="https://..."
                    disabled={readOnly}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-500 mb-1 block">
                Content (rich text)
              </Label>
              <BlockNoteProposalEditor
                value={proposal.content}
                onChange={(json) => updateProposal(index, { content: json })}
                placeholder={`Write proposal ${index + 1} here...`}
                readOnly={readOnly}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={proposal.active}
                onCheckedChange={(checked) =>
                  updateProposal(index, { active: checked })
                }
                disabled={readOnly}
              />
              <Label className="text-xs text-gray-500">Active</Label>
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addProposal}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add proposal
        </Button>
      )}

      {kind === "consultation" && onAllowAudienceProposalsChange && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Switch
            checked={allowAudienceProposals}
            onCheckedChange={onAllowAudienceProposalsChange}
            disabled={readOnly}
          />
          <Label className="text-sm text-gray-600">
            Allow audience to add proposals
          </Label>
        </div>
      )}
    </div>
  );
};