import * as React from "react";
import { Plus, Trash2, GripVertical, ExternalLink, Upload } from "lucide-react";
import { VoteProposal, VoteKind } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { proposalHasContent, proposalPlainText } from "@/lib/vote-ranking";
import { BlockNoteProposalEditor, BlockNoteProposalEditorHandle } from "./BlockNoteProposalEditor";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ProposalEditorProps {
  proposals: VoteProposal[];
  onChange: (proposals: VoteProposal[]) => void;
  kind: VoteKind;
  allowAudienceProposals?: boolean;
  onAllowAudienceProposalsChange?: (value: boolean) => void;
  readOnly?: boolean;
}

export interface ProposalEditorHandle {
  flush: () => VoteProposal[];
}

export const ProposalEditor = React.forwardRef<ProposalEditorHandle, ProposalEditorProps>(({
  proposals,
  onChange,
  kind,
  allowAudienceProposals = false,
  onAllowAudienceProposalsChange,
  readOnly = false,
}, ref) => {
  const t = getVotingStrings();
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchText, setBatchText] = React.useState('');
  const editorRefs = React.useRef<(BlockNoteProposalEditorHandle | null)[]>([]);
  const proposalsRef = React.useRef(proposals);
  proposalsRef.current = proposals;

  React.useImperativeHandle(ref, () => ({
    flush: () => {
      const updated = [...proposalsRef.current];
      editorRefs.current.forEach((editor, i) => {
        if (editor && i < updated.length) {
          updated[i] = { ...updated[i], content: editor.flush() };
        }
      });
      onChange(updated);
      return updated;
    },
  }), [onChange]);

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

  // Shared with `proposalDisplayTitle`: inspecting only top-level nodes would
  // treat nested block text as empty and drop those proposals on batch import.
  const hasContent = (proposal: VoteProposal): boolean => proposalHasContent(proposal);

  const handleBatchImport = () => {
    const lines = batchText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))
      // Reuse the same normalization as the rendered title, so imported markup
      // cannot be stored in a shape that displays differently later (tags are
      // replaced with a space, keeping sibling blocks from merging).
      .map((line) => proposalPlainText({ content: line }) ?? "")
      .filter(Boolean);
    if (lines.length === 0) return;

    const current = [...proposalsRef.current];
    editorRefs.current.forEach((editor, index) => {
      if (editor && index < current.length) {
        current[index] = { ...current[index], content: editor.flush() };
      }
    });
    const base = current.filter(hasContent);
    const imported: VoteProposal[] = lines.map((text, index) => ({
      id: crypto.randomUUID(),
      description: text.slice(0, 200),
      content: text,
      position: base.length + index,
      active: true,
    }));

    onChange([...base, ...imported].map((proposal, index) => ({
      ...proposal,
      position: index,
    })));
    setBatchText('');
    setBatchOpen(false);
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
              {proposal.description?.trim() || `Proposal ${index + 1}`}
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
                  {t.labels.descriptionPlain}
                </Label>
                <Input
                  value={proposal.description || ""}
                  onChange={(e) =>
                    updateProposal(index, { description: e.target.value })
                  }
                  placeholder={t.placeholders.shortDescription}
                  disabled={readOnly}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  {t.labels.infoUrl}
                </Label>
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                  <Input
                    value={proposal.infoUrl || ""}
                    onChange={(e) =>
                      updateProposal(index, { infoUrl: e.target.value })
                    }
                    placeholder={t.placeholders.url}
                    disabled={readOnly}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-500 mb-1 block">
                {t.labels.contentRich}
              </Label>
              <BlockNoteProposalEditor
                ref={(el) => { editorRefs.current[index] = el; }}
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
              <Label className="text-xs text-gray-500">{t.labels.active}</Label>
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addProposal}
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t.buttons.addProposal}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBatchOpen(true)}
            className="sm:w-auto"
          >
            <Upload className="w-4 h-4 mr-2" />
            {t.buttons.batchImport}
          </Button>
        </div>
      )}

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.labels.batchImportProposals}</DialogTitle>
            <DialogDescription>
              {t.messages.batchImportProposalsDescription}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={batchText}
            onChange={(event) => setBatchText(event.target.value)}
            placeholder={t.placeholders.batchImportProposals}
            rows={10}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              {t.buttons.cancel}
            </Button>
            <Button onClick={handleBatchImport} disabled={!batchText.trim()}>
              {t.buttons.import}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {kind === "consultation" && onAllowAudienceProposalsChange && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Switch
            checked={allowAudienceProposals}
            onCheckedChange={onAllowAudienceProposalsChange}
            disabled={readOnly}
          />
          <Label className="text-sm text-gray-600">
            {t.labels.allowAudienceProposals}
          </Label>
        </div>
      )}
    </div>
  );
});

ProposalEditor.displayName = "ProposalEditor";