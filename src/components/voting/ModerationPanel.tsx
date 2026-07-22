import * as React from "react";
import { VoteEntity, VoteModerator } from "@/lib/persistence-types";
import { useVoteModerators } from "@/hooks/useVoteModerators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  UserPlus,
  Copy,
  Trash2,
  ExternalLink,
  Shield,
  Clock,
  Mail,
} from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";

interface ModerationPanelProps {
  vote: VoteEntity;
  currentUserId: string;
  onOpenModerationPopout: (token: string) => void;
}

export const ModerationPanel: React.FC<ModerationPanelProps> = ({
  vote,
  currentUserId,
  onOpenModerationPopout,
}) => {
  const t = getVotingStrings();
  const { moderators, isLoading, addModerator, revokeModerator } =
    useVoteModerators(vote.id);
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  const isOwner = vote.ownerId === currentUserId;

  const handleAdd = async () => {
    if (!displayName.trim()) return;
    setIsAdding(true);
    try {
      const moderator = await addModerator({
        displayName: displayName.trim(),
        email: email.trim() || undefined,
      });
      if (moderator) {
        setDisplayName("");
        setEmail("");
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/v/${vote.slug}/m/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const handleRevoke = async (moderatorId: string) => {
    await revokeModerator(moderatorId);
  };

  if (!isOwner) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        {t.messages.onlyOwnerCanManage}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">{t.messages.loading}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-medium text-gray-700">{t.labels.moderators}</h3>
        <Badge variant="secondary" className="text-xs">
          {moderators.length}
        </Badge>
      </div>

      <p className="text-xs text-gray-500">
        {t.messages.moderatorDescription}
      </p>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs font-medium">{t.buttons.addModerator}</Label>
        <div className="flex gap-2">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t.placeholders.displayName}
            className="h-8 text-sm flex-1"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.placeholders.email}
            className="h-8 text-sm flex-1"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!displayName.trim() || isAdding}
            className="h-8"
          >
            <UserPlus className="w-3 h-3 mr-1" />
            {t.buttons.add}
          </Button>
        </div>
      </div>

      {moderators.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">
          {t.messages.noModerators}
        </p>
      ) : (
        <div className="space-y-2">
          {moderators.map((mod) => (
            <ModeratorRow
              key={mod.id}
              moderator={mod}
              voteSlug={vote.slug}
              onCopyLink={handleCopyLink}
              onRevoke={handleRevoke}
              onOpenPopout={onOpenModerationPopout}
              copiedToken={copiedToken}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ModeratorRow: React.FC<{
  moderator: VoteModerator;
  voteSlug: string;
  onCopyLink: (token: string) => void;
  onRevoke: (id: string) => void;
  onOpenPopout: (token: string) => void;
  copiedToken: string | null;
}> = ({ moderator, voteSlug, onCopyLink, onRevoke, onOpenPopout, copiedToken }) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const isActive = moderator.active;
  const isCopied = copiedToken === moderator.token;

  return (
    <div className="flex items-center gap-2 p-2 border rounded-md text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">
            {moderator.displayName}
          </span>
          <Badge
            variant={isActive ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {isActive ? t.labels.active : "Revoked"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
          {moderator.email && (
            <span className="flex items-center gap-0.5">
              <Mail className="w-3 h-3" />
              {moderator.email}
            </span>
          )}
          {moderator.lastSeenAt && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              Last seen {new Date(moderator.lastSeenAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {isActive && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onOpenPopout(moderator.token)}
            title={tt("voting.openModerationView")}
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onCopyLink(moderator.token)}
            title="Copy invitation link"
          >
            {isCopied ? (
              <span className="text-green-600 text-xs">{t.buttons.copied}</span>
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
            onClick={() => onRevoke(moderator.id)}
            title={t.buttons.delete}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};