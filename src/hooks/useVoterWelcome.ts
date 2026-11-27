import * as React from "react";
import {
  getOrCreateVoterName,
  getStoredVoterName,
  setStoredVoterName,
} from "@/lib/voter-identity";

export interface VoterWelcomeOptions {
  /** Vote whose per-browser name is being managed. */
  voteId: string | undefined;
  /** Anonymous votes never name the participant, so no dialog or rename. */
  isAnonymous: boolean;
  /**
   * Attendance can switch the dialog off; a generated name is still stored
   * silently so the identity bar and stored responses keep a name.
   */
  welcomeDisabled?: boolean;
  /** Current display name, owned by the page. */
  name: string;
  /** Mirror the resolved name back into the page state. */
  onNameChange: (name: string) => void;
  /**
   * Persist a saved name on the server. The rule differs by page (a comparative
   * ballot keeps the name on its ranking submission and may rename while open;
   * a response-based vote only renames rows it already holds), so the page owns
   * it instead of the hook guessing.
   */
  onRename: (name: string) => void;
}

export interface VoterWelcomeState {
  open: boolean;
  setOpen: (open: boolean) => void;
  promptName: string;
  setPromptName: (name: string) => void;
  /** Persist the dialog value locally, then invoke the page's server rename. */
  save: () => void;
  /** Reopen the dialog prefilled with the current name. */
  edit: () => void;
}

/**
 * The single stored-name/welcome-dialog bootstrap shared by the public vote
 * pages. It loads the name this browser already chose for the vote, generates
 * and persists one when there is none, and opens the dialog once per vote. The
 * pages keep only their rendering and their own server-rename rule, so the two
 * copies cannot drift on when the dialog appears or where the name is stored.
 */
export function useVoterWelcome(options: VoterWelcomeOptions): VoterWelcomeState {
  const {
    voteId,
    isAnonymous,
    welcomeDisabled = false,
    name,
    onNameChange,
    onRename,
  } = options;
  const [open, setOpen] = React.useState(false);
  const [promptName, setPromptName] = React.useState("");
  const shownRef = React.useRef<string | null>(null);
  const previousVoteIdRef = React.useRef<string | undefined>(undefined);
  // Callbacks live in refs so the bootstrap effect depends only on the vote's
  // identity, not on a fresh closure every render.
  const onNameChangeRef = React.useRef(onNameChange);
  onNameChangeRef.current = onNameChange;
  const onRenameRef = React.useRef(onRename);
  onRenameRef.current = onRename;

  // Reset the dialog when the page switches to another vote. Declared before the
  // bootstrap effect so the new vote's plan (which may open the dialog) wins.
  React.useEffect(() => {
    if (previousVoteIdRef.current && previousVoteIdRef.current !== voteId) {
      setOpen(false);
      setPromptName("");
    }
    previousVoteIdRef.current = voteId;
  }, [voteId]);

  React.useEffect(() => {
    if (!voteId) return;
    const stored = getStoredVoterName(voteId);
    if (isAnonymous) {
      // Keep the page state aligned with a previously stored name; it is never
      // submitted for an anonymous vote.
      onNameChangeRef.current(stored ?? "");
      return;
    }
    if (welcomeDisabled) {
      const resolved = stored ?? getOrCreateVoterName(voteId);
      onNameChangeRef.current(resolved);
      setPromptName(resolved);
      return;
    }
    if (stored) {
      onNameChangeRef.current(stored);
      return;
    }
    // Show the welcome dialog once per vote; a later config change must not
    // reopen it after the visitor dismissed it.
    if (shownRef.current === voteId) return;
    shownRef.current = voteId;
    const generated = getOrCreateVoterName(voteId);
    onNameChangeRef.current(generated);
    setPromptName(generated);
    setOpen(true);
  }, [voteId, isAnonymous, welcomeDisabled]);

  const save = React.useCallback(() => {
    const next = promptName.trim();
    if (!voteId || !next) return;
    setStoredVoterName(voteId, next);
    onNameChangeRef.current(next);
    setOpen(false);
    onRenameRef.current(next);
  }, [promptName, voteId]);

  return {
    open,
    setOpen,
    promptName,
    setPromptName,
    save,
    edit: () => {
      setPromptName(name);
      setOpen(true);
    },
  };
}
