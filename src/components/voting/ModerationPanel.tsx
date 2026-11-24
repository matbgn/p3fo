import * as React from "react";
import { VoteEntity, VoteModerator } from "@/lib/persistence-types";
import type { useVoteModerators } from "@/hooks/useVoteModerators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Plus,
  Shield,
  Trash2,
  Clock,
} from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";

interface ModerationPanelProps {
  vote: VoteEntity;
  currentUserId: string;
  /** Shared moderator list owned by the vote detail view. */
  moderationState: ReturnType<typeof useVoteModerators>;
  onOpenModerationPopout: (token: string) => void;
}

const moderationUrl = (slug: string, token: string) =>
  `${window.location.origin}/v/${slug}/m/${token}`;

/**
 * The `/v/<slug>/m/<token>` page is a capability link: the token is the whole
 * credential, so it can be shared with someone who is not signed in. This panel
 * makes that link explicit and copyable instead of hiding it behind per-person
 * display-name/email metadata.
 */
export const ModerationPanel: React.FC<ModerationPanelProps> = ({
  vote,
  currentUserId,
  moderationState,
  onOpenModerationPopout,
}) => {
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const { moderators, isLoading, addModerator, revokeModerator } = moderationState;
  const [isCreating, setIsCreating] = React.useState(false);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  const isOwner = vote.ownerId === currentUserId;

  const activeModerators = React.useMemo(
    () =>
      moderators
        .filter((moderator) => moderator.active)
        .sort(
          (a, b) =>
            (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0),
        ),
    [moderators],
  );
  const primary = activeModerators[0] ?? null;
  const otherModerators = React.useMemo(
    () => moderators.filter((moderator) => moderator.id !== primary?.id),
    [moderators, primary?.id],
  );

  const createLink = async () => {
    setIsCreating(true);
    try {
      await addModerator({
        displayName: `${tt("voting.moderatorLinkLabel")} ${moderators.length + 1}`,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const url = moderationUrl(vote.slug, token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // The URL stays visible in the input, so it can still be selected and
      // copied manually when the Clipboard API is unavailable.
    }
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
          {activeModerators.length}
        </Badge>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-gray-900">
              {tt("voting.shareModeratorLink")}
            </h4>
            <p className="text-xs text-gray-600 mt-1">
              {tt("voting.shareModeratorDescription")}
            </p>
          </div>
        </div>

        {primary ? (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={moderationUrl(vote.slug, primary.token)}
                onFocus={(event) => event.currentTarget.select()}
                className="h-8 text-xs font-mono bg-white"
                aria-label={tt("voting.shareModeratorLink")}
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                onClick={() => handleCopyLink(primary.token)}
              >
                {copiedToken === primary.token ? (
                  <Check className="w-3.5 h-3.5 mr-1" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1" />
                )}
                {copiedToken === primary.token
                  ? t.buttons.copied
                  : tt("voting.copyModeratorLink")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => onOpenModerationPopout(primary.token)}
                title={tt("voting.openModerationView")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1 min-w-0">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {primary.lastSeenAt
                    ? tt("voting.moderatorLastSeen", {
                        date: new Date(primary.lastSeenAt).toLocaleString(),
                      })
                    : tt("voting.moderatorNeverUsed")}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-red-600 hover:text-red-700 shrink-0"
                onClick={() => handleRevoke(primary.id)}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {tt("voting.revokeModeratorLink")}
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" onClick={createLink} disabled={isCreating}>
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {tt("voting.createModeratorLink")}
          </Button>
        )}

        <p className="text-xs text-amber-700">
          {tt("voting.shareModeratorWarning")}
        </p>

        {primary && (
          <Button
            size="sm"
            variant="outline"
            onClick={createLink}
            disabled={isCreating}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {tt("voting.newModeratorLink")}
          </Button>
        )}
      </div>

      {otherModerators.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-700">
              {tt("voting.moderatorLinks")}
            </h4>
            {otherModerators.map((moderator) => (
              <ModeratorLinkRow
                key={moderator.id}
                moderator={moderator}
                voteSlug={vote.slug}
                onCopyLink={handleCopyLink}
                onRevoke={handleRevoke}
                onOpenPopout={onOpenModerationPopout}
                copiedToken={copiedToken}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ModeratorLinkRow: React.FC<{
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
    <div className="p-2 border rounded-md text-sm space-y-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-gray-900 truncate">
          {moderator.displayName}
        </span>
        <Badge
          variant={isActive ? "default" : "secondary"}
          className="text-[10px] px-1.5 py-0"
        >
          {isActive ? t.labels.active : tt("voting.revokedLink")}
        </Badge>
        <span className="ml-auto flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
          <Clock className="w-3 h-3" />
          {moderator.lastSeenAt
            ? new Date(moderator.lastSeenAt).toLocaleDateString()
            : tt("voting.moderatorNeverUsed")}
        </span>
      </div>

      {isActive && (
        <div className="flex gap-1.5">
          <Input
            readOnly
            value={moderationUrl(voteSlug, moderator.token)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-7 text-[11px] font-mono"
            aria-label={tt("voting.moderatorLinkLabel")}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => onCopyLink(moderator.token)}
            title={tt("voting.copyModeratorLink")}
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => onOpenPopout(moderator.token)}
            title={tt("voting.openModerationView")}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0 text-red-500 hover:text-red-600"
            onClick={() => onRevoke(moderator.id)}
            title={tt("voting.revokeModeratorLink")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
