type VotingStrings = {
  phases: Record<string, string>;
  kinds: Record<string, string>;
  kindDescriptions: Record<string, string>;
  modes: Record<string, string>;
  modeDescriptions: Record<string, string>;
  mjGrades: Record<number, string>;
  buttons: {
    vote: string;
    voted: string;
    submit: string;
    submitPoints: string;
    cancel: string;
    confirm: string;
    close: string;
    copy: string;
    copied: string;
    add: string;
    addProposal: string;
    addModerator: string;
    delete: string;
    edit: string;
    createVote: string;
    createAndOpen: string;
    createAndClose: string;
    creating: string;
    saving: string;
    saveChanges: string;
    finalize: string;
    finalizeDecision: string;
    openVote: string;
    closeVote: string;
    requestFinalization: string;
    adopt: string;
    withdraw: string;
    blocked: string;
    downloadPng: string;
    moreInfo: string;
    show: string;
    hide: string;
    share: string;
    reset: string;
    openRound: string;
    closeRound: string;
    saveDraft: string;
  };
  labels: {
    voting: string;
    outcome: string;
    results: string;
    rounds: string;
    proposals: string;
    moderation: string;
    moderators: string;
    settings: string;
    title: string;
    description: string;
    kind: string;
    mode: string;
    winningProposal: string;
    summary: string;
    signature: string;
    perRoundResults: string;
    roundControls: string;
    roundComparison: string;
    linkedVotes: string;
    linkedTask: string;
    votingMode: string;
    newLinkedVote: string;
    voters: string;
    voter: string;
    comment: string;
    comments: string;
    suggestProposal: string;
    finalResults: string;
    blockLevelDiff: string;
    leftRound: string;
    rightRound: string;
    currentRoundProposal: string;
    currentRoundResults: string;
    draftSaved: string;
    draftUnsaved: string;
    roundByRoundSummary: string;
    maxPointsPerUser: string;
    allowMultiple: string;
    anonymousVoting: string;
    allowFreeText: string;
    encourageNegativeComments: string;
    openAt: string;
    closeAt: string;
    infoUrl: string;
    descriptionPlain: string;
    contentRich: string;
    active: string;
    allowAudienceProposals: string;
    showResultsBeforeClose: string;
    allowVoteChangeUntilClose: string;
    multipleChoiceVote: string;
    round: string;
    median: string;
    status: string;
    points: string;
    medianColon: string;
  };
  messages: {
    loading: string;
    loadingVote: string;
    loadingModeration: string;
    loadingResults: string;
    noVotesYet: string;
    noVotesAvailable: string;
    noModerators: string;
    noRoundsYet: string;
    noActiveRound: string;
    noMatchingVotes: string;
    voteNotFound: string;
    notOpenForResponses: string;
    closedNoMoreResponses: string;
    thanksVoted: string;
    finalizingLocks: string;
    selectWinningProposal: string;
    onlyOwnerCanManage: string;
    accessDenied: string;
    invalidModLink: string;
    moderatorsCannotFinalize: string;
    onlyOwnerCanFinalize: string;
    roundClosedCannotEdit: string;
    consentLoopFinalized: string;
    consentLoopResultsPerRound: string;
    consentLoopProcess: string;
    negativeCommentNudge: string;
    qrCodeUnavailable: string;
    scanToVote: string;
    poweredBy: string;
    needTwoClosedRounds: string;
    compareRoundsDescription: string;
    moderatorDescription: string;
    consentLoopAdopted: string;
    consentLoopWithdrawn: string;
    consentLoopBlocked: string;
    tieNoDecision: string;
    allocatePointsBudget: string;
    resetConfirm: string;
    resetWarning: string;
  };
  placeholders: {
    title: string;
    description: string;
    signature: string;
    summaryOverride: string;
    comment: string;
    proposal: string;
    searchVotes: string;
    url: string;
    writeProposal: string;
    shortDescription: string;
    displayName: string;
    email: string;
    refineProposal: string;
  };
  pages: {
    consultations: string;
    decisions: string;
    newConsultation: string;
    newDecision: string;
    noConsultationsYet: string;
    noDecisionsYet: string;
    createConsultationDescription: string;
    createDecisionDescription: string;
    editVote: string;
    createNewVote: string;
    finalizing: string;
    proposalSelected: string;
    closed: string;
  };
};

const en: VotingStrings = {
  phases: {
    IDLE: "Draft",
    OPEN: "Open",
    CLOSED: "Closed",
    FINALIZED: "Finalized",
  },
  kinds: {
    consultation: "Consultation",
    decision: "Decision",
  },
  kindDescriptions: {
    consultation: "Gather input — results are advisory",
    decision: "Formal binding outcome with finalize step",
  },
  modes: {
    THUMBS_UP: "Thumbs Up",
    THUMBS_UD_NEUTRAL: "Up / Down / Neutral",
    POINTS: "Points Budget",
    MAJORITY_JUDGMENT: "Majority Judgment",
    CONSENT_LOOP: "Consent Loop",
  },
  modeDescriptions: {
    THUMBS_UP: "Simple yes vote per proposal",
    THUMBS_UD_NEUTRAL: "Up, down, or neutral per proposal",
    POINTS: "Distribute a budget of points",
    MAJORITY_JUDGMENT: "Grade each proposal on a scale",
    CONSENT_LOOP: "Iterative rounds until adopted or blocked",
  },
  mjGrades: {
    4: "Excellent",
    3: "Good",
    2: "Acceptable",
    1: "Passable",
    0: "Insufficient",
    [-1]: "Reject",
  },
  buttons: {
    vote: "Vote",
    voted: "Voted",
    submit: "Submit",
    submitPoints: "Submit your points",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    copy: "Copy",
    copied: "Copied!",
    add: "Add",
    addProposal: "Add proposal",
    addModerator: "Add moderator",
    delete: "Delete",
    edit: "Edit",
    createVote: "Create vote",
    createAndOpen: "Create & Open",
    createAndClose: "Create & Close",
    creating: "Creating...",
    saving: "Saving...",
    saveChanges: "Save changes",
    finalize: "Finalize",
    finalizeDecision: "Finalize decision",
    openVote: "Open vote",
    closeVote: "Close vote",
    requestFinalization: "Request finalization",
    adopt: "Adopt",
    withdraw: "Withdraw",
    blocked: "Blocked",
    downloadPng: "Download PNG",
    moreInfo: "More info",
    show: "Show",
    hide: "Hide",
    share: "Share",
    reset: "Reset",
    openRound: "Open round",
    closeRound: "Close round",
    saveDraft: "Save draft",
  },
  labels: {
    voting: "Voting",
    outcome: "Outcome",
    results: "Results",
    rounds: "Rounds",
    proposals: "Proposals",
    moderation: "Moderation",
    moderators: "Moderators",
    settings: "Settings",
    title: "Title",
    description: "Description",
    kind: "Kind",
    mode: "Mode",
    winningProposal: "Winning proposal",
    summary: "Summary (optional)",
    signature: "Signature (optional)",
    perRoundResults: "Per-round results",
    roundControls: "Round controls",
    roundComparison: "Round comparison",
    linkedVotes: "Linked Votes",
    linkedTask: "Linked task",
    votingMode: "Voting Mode",
    newLinkedVote: "New linked vote",
    voters: "voters",
    voter: "voter",
    comment: "comment",
    comments: "comments",
    suggestProposal: "Suggest a proposal",
    finalResults: "Final Results",
    blockLevelDiff: "Block-level diff",
    leftRound: "Left round",
    rightRound: "Right round",
    currentRoundProposal: "Current round proposal",
    currentRoundResults: "Current round results",
    draftSaved: "Draft saved",
    draftUnsaved: "Unsaved changes",
    roundByRoundSummary: "Round-by-round summary",
    maxPointsPerUser: "Max points per user",
    allowMultiple: "Allow multiple votes per proposal",
    anonymousVoting: "Anonymous voting",
    allowFreeText: "Allow free-text comments",
    encourageNegativeComments: "Encourage voters to explain negative votes",
    openAt: "Open at",
    closeAt: "Close at",
    infoUrl: "Info URL",
    descriptionPlain: "Description (plain text)",
    contentRich: "Content (rich text)",
    active: "Active",
    allowAudienceProposals: "Allow audience to add proposals",
    showResultsBeforeClose: "Show results before close",
    allowVoteChangeUntilClose: "Allow vote change until close",
    multipleChoiceVote: "Multiple choice vote",
    round: "Round",
    median: "Majority Mention",
    status: "Status",
    points: "points",
    medianColon: "Median:",
  },
  messages: {
    loading: "Loading...",
    loadingVote: "Loading vote...",
    loadingModeration: "Loading moderation view...",
    loadingResults: "Loading results...",
    noVotesYet: "No votes yet.",
    noVotesAvailable: "No votes available",
    noModerators: "No moderators added yet.",
    noRoundsYet: "No rounds yet. Open the first round to begin the consent loop.",
    noActiveRound: "No active round. Open a round to begin editing.",
    noMatchingVotes: "No matching votes",
    voteNotFound: "Vote not found",
    notOpenForResponses: "This vote is not yet open for responses.",
    closedNoMoreResponses: "This vote is closed. No more responses are accepted.",
    thanksVoted: "Thanks, you voted! You can still change your vote while the vote is open.",
    finalizingLocks: "Finalizing locks this vote. No further responses or edits will be accepted.",
    selectWinningProposal: "Select the winning proposal and optionally add a signature. This action is irreversible.",
    onlyOwnerCanManage: "Only the vote owner can manage moderators.",
    accessDenied: "Access denied",
    invalidModLink: "This moderation link is invalid or has been revoked.",
    moderatorsCannotFinalize: "Moderators cannot finalize decisions. Request the owner to finalize.",
    onlyOwnerCanFinalize: "Only the owner can finalize. Request finalization from the owner.",
    roundClosedCannotEdit: "This round is closed and cannot be edited.",
    consentLoopFinalized: "This consent loop is finalized.",
    consentLoopResultsPerRound: "Consent Loop results are shown per round on the Rounds tab.",
    consentLoopProcess: "This vote uses a consent-loop process with multiple rounds of refinement.",
    negativeCommentNudge: "You picked a negative option. Sharing why helps the group — a short comment goes a long way.",
    qrCodeUnavailable: "QR code unavailable",
    scanToVote: "Scan to vote",
    poweredBy: "Powered by p3fo Voting",
    needTwoClosedRounds: "At least two closed rounds are needed to compare.",
    compareRoundsDescription: "Compare the proposal text between two rounds to see what changed.",
    moderatorDescription: "Moderators can edit proposals, open/close rounds, and vote on gating checks. They cannot finalize decisions or delete the vote.",
    consentLoopAdopted: "Adopted — no remaining objections",
    consentLoopWithdrawn: "Withdrawn — the proposer pulled the proposal",
    consentLoopBlocked: "Blocked — objection(s) could not be integrated",
    tieNoDecision: "Tie — no decision reached",
    allocatePointsBudget: "Allocate points across proposals, then submit all at once.",
    resetConfirm: "Reset this vote? All responses and loop rounds will be permanently deleted.",
    resetWarning: "This will delete all votes and rounds, and revert the vote to Draft. This cannot be undone.",
  },
  placeholders: {
    title: "What should we decide?",
    description: "Optional context for voters",
    signature: "Add a formal decision text or note...",
    summaryOverride: "Override the auto-generated summary...",
    comment: "Share your thoughts...",
    proposal: "Your proposal...",
    searchVotes: "Search votes...",
    url: "https://...",
    writeProposal: "Write your proposal here...",
    shortDescription: "Optional short description",
    displayName: "Display name",
    email: "Email (optional)",
    refineProposal: "Refine the proposal text for this round...",
  },
  pages: {
    consultations: "Consultations",
    decisions: "Decisions",
    newConsultation: "New Consultation",
    newDecision: "New Decision",
    noConsultationsYet: "No consultations yet",
    noDecisionsYet: "No decisions yet",
    createConsultationDescription: "Create consultations to gather input from your audience",
    createDecisionDescription: "Create decisions with formal binding outcomes",
    editVote: "Edit vote",
    createNewVote: "Create vote",
    finalizing: "Finalizing...",
    proposalSelected: "Proposal selected as the decision.",
    closed: "Closed",
  },
};

const fr: VotingStrings = {
  phases: {
    IDLE: "Brouillon",
    OPEN: "Ouvert",
    CLOSED: "Ferm\u00e9",
    FINALIZED: "Finalis\u00e9",
  },
  kinds: {
    consultation: "Consultation",
    decision: "D\u00e9cision",
  },
  kindDescriptions: {
    consultation: "Recueillir des avis \u2014 les r\u00e9sultats sont consultatifs",
    decision: "D\u00e9cision formelle avec \u00e9tape de finalisation",
  },
  modes: {
    THUMBS_UP: "Pouce en l'air",
    THUMBS_UD_NEUTRAL: "Pour / Contre / Neutre",
    POINTS: "Budget de points",
    MAJORITY_JUDGMENT: "Jugement majoritaire",
    CONSENT_LOOP: "Boucle de consentement",
  },
  modeDescriptions: {
    THUMBS_UP: "Vote simple par proposition",
    THUMBS_UD_NEUTRAL: "Pour, contre ou neutre par proposition",
    POINTS: "R\u00e9partir un budget de points",
    MAJORITY_JUDGMENT: "Noter chaque proposition sur une \u00e9chelle",
    CONSENT_LOOP: "Tours it\u00e9ratifs jusqu'\u00e0 adoption ou blocage",
  },
  mjGrades: {
    4: "Excellent",
    3: "Tr\u00e8s bien",
    2: "Bien",
    1: "Passable",
    0: "Insuffisant",
    [-1]: "\u00c0 rejeter",
  },
  buttons: {
    vote: "Voter",
    voted: "Vot\u00e9",
    submit: "Soumettre",
    submitPoints: "Soumettre vos points",
    cancel: "Annuler",
    confirm: "Confirmer",
    close: "Fermer",
    copy: "Copier",
    copied: "Copi\u00e9\u00a0!",
    add: "Ajouter",
    addProposal: "Ajouter une proposition",
    addModerator: "Ajouter un mod\u00e9rateur",
    delete: "Supprimer",
    edit: "Modifier",
    createVote: "Cr\u00e9er le vote",
    createAndOpen: "Cr\u00e9er et ouvrir",
    createAndClose: "Cr\u00e9er et fermer",
    creating: "Cr\u00e9ation...",
    saving: "Enregistrement...",
    saveChanges: "Enregistrer les modifications",
    finalize: "Finaliser",
    finalizeDecision: "Finaliser la d\u00e9cision",
    openVote: "Ouvrir le vote",
    closeVote: "Fermer le vote",
    requestFinalization: "Demander la finalisation",
    adopt: "Adopter",
    withdraw: "Retirer",
    blocked: "Bloqu\u00e9",
    downloadPng: "T\u00e9l\u00e9charger PNG",
    moreInfo: "Plus d'infos",
    show: "Afficher",
    hide: "Masquer",
    share: "Partager",
    reset: "R\u00e9initialiser",
    openRound: "Ouvrir le tour",
    closeRound: "Fermer le tour",
    saveDraft: "Enregistrer le brouillon",
  },
  labels: {
    voting: "Vote",
    outcome: "R\u00e9sultat",
    results: "R\u00e9sultats",
    rounds: "Tours",
    proposals: "Propositions",
    moderation: "Mod\u00e9ration",
    moderators: "Mod\u00e9rateurs",
    settings: "Param\u00e8tres",
    title: "Titre",
    description: "Description",
    kind: "Type",
    mode: "Mode",
    winningProposal: "Proposition gagnante",
    summary: "R\u00e9sum\u00e9 (optionnel)",
    signature: "Signature (optionnelle)",
    perRoundResults: "R\u00e9sultats par tour",
    roundControls: "Contr\u00f4les du tour",
    roundComparison: "Comparaison des tours",
    linkedVotes: "Votes li\u00e9s",
    linkedTask: "T\u00e2che li\u00e9e",
    votingMode: "Mode de vote",
    newLinkedVote: "Nouveau vote li\u00e9",
    voters: "votants",
    voter: "votant",
    comment: "commentaire",
    comments: "commentaires",
    suggestProposal: "Sugg\u00e9rer une proposition",
    finalResults: "R\u00e9sultats finaux",
    blockLevelDiff: "Diff bloc par bloc",
    leftRound: "Tour de gauche",
    rightRound: "Tour de droite",
    currentRoundProposal: "Proposition du tour en cours",
    currentRoundResults: "R\u00e9sultats du tour en cours",
    draftSaved: "Brouillon enregistr\u00e9",
    draftUnsaved: "Modifications non enregistr\u00e9es",
    roundByRoundSummary: "R\u00e9sum\u00e9 tour par tour",
    maxPointsPerUser: "Points maximum par utilisateur",
    allowMultiple: "Autoriser plusieurs votes par proposition",
    anonymousVoting: "Vote anonyme",
    allowFreeText: "Autoriser les commentaires libres",
    encourageNegativeComments: "Encourager les votants \u00e0 expliquer les votes n\u00e9gatifs",
    openAt: "Ouverture",
    closeAt: "Fermeture",
    infoUrl: "Lien d'info",
    descriptionPlain: "Description (texte brut)",
    contentRich: "Contenu (texte riche)",
    active: "Actif",
    allowAudienceProposals: "Autoriser le public \u00e0 ajouter des propositions",
    showResultsBeforeClose: "Afficher les r\u00e9sultats avant la fermeture",
    allowVoteChangeUntilClose: "Autoriser le changement de vote jusqu'\u00e0 la fermeture",
    multipleChoiceVote: "Vote \u00e0 choix multiple",
    round: "Tour",
    median: "M\u00e9diane",
    status: "Statut",
    points: "points",
    medianColon: "M\u00e9diane\u00a0:",
  },
  messages: {
    loading: "Chargement...",
    loadingVote: "Chargement du vote...",
    loadingModeration: "Chargement de la mod\u00e9ration...",
    loadingResults: "Chargement des r\u00e9sultats...",
    noVotesYet: "Aucun vote pour le moment.",
    noVotesAvailable: "Aucun vote disponible",
    noModerators: "Aucun mod\u00e9rateur ajout\u00e9.",
    noRoundsYet: "Aucun tour. Ouvrez le premier tour pour commencer la boucle de consentement.",
    noActiveRound: "Aucun tour actif. Ouvrez un tour pour commencer l'\u00e9dition.",
    noMatchingVotes: "Aucun vote correspondant",
    voteNotFound: "Vote introuvable",
    notOpenForResponses: "Ce vote n'est pas encore ouvert aux r\u00e9ponses.",
    closedNoMoreResponses: "Ce vote est ferm\u00e9. Aucune r\u00e9ponse suppl\u00e9mentaire n'est accept\u00e9e.",
    thanksVoted: "Merci, vous avez vot\u00e9\u00a0! Vous pouvez encore modifier votre vote tant que le vote est ouvert.",
    finalizingLocks: "La finalisation verrouille ce vote. Aucune r\u00e9ponse ou modification ne sera accept\u00e9e.",
    selectWinningProposal: "S\u00e9lectionnez la proposition gagnante et ajoutez optionnellement une signature. Cette action est irr\u00e9versible.",
    onlyOwnerCanManage: "Seul le propri\u00e9taire du vote peut g\u00e9rer les mod\u00e9rateurs.",
    accessDenied: "Acc\u00e8s refus\u00e9",
    invalidModLink: "Ce lien de mod\u00e9ration est invalide ou a \u00e9t\u00e9 r\u00e9voqu\u00e9.",
    moderatorsCannotFinalize: "Les mod\u00e9rateurs ne peuvent pas finaliser les d\u00e9cisions. Demandez au propri\u00e9taire de finaliser.",
    onlyOwnerCanFinalize: "Seul le propri\u00e9taire peut finaliser. Demandez la finalisation au propri\u00e9taire.",
    roundClosedCannotEdit: "Ce tour est ferm\u00e9 et ne peut plus \u00eatre modifi\u00e9.",
    consentLoopFinalized: "Cette boucle de consentement est finalis\u00e9e.",
    consentLoopResultsPerRound: "Les r\u00e9sultats de la boucle de consentement sont affich\u00e9s par tour dans l'onglet Tours.",
    consentLoopProcess: "Ce vote utilise un processus de boucle de consentement avec plusieurs tours d'affinement.",
    negativeCommentNudge: "Vous avez choisi une option n\u00e9gative. Partager pourquoi aide le groupe \u2014 un court commentaire fait la diff\u00e9rence.",
    qrCodeUnavailable: "QR code indisponible",
    scanToVote: "Scanner pour voter",
    poweredBy: "Propuls\u00e9 par p3fo Voting",
    needTwoClosedRounds: "Au moins deux tours ferm\u00e9s sont n\u00e9cessaires pour comparer.",
    compareRoundsDescription: "Comparez le texte des propositions entre deux tours pour voir les changements.",
    moderatorDescription: "Les mod\u00e9rateurs peuvent modifier les propositions, ouvrir/fermer les tours et voter sur les validations. Ils ne peuvent ni finaliser les d\u00e9cisions ni supprimer le vote.",
    consentLoopAdopted: "Adopt\u00e9 \u2014 plus d'objection restante",
    consentLoopWithdrawn: "Retir\u00e9 \u2014 le proposeur a retir\u00e9 la proposition",
    consentLoopBlocked: "Bloqu\u00e9 \u2014 des objections n'ont pas pu \u00eatre int\u00e9gr\u00e9es",
    tieNoDecision: "\u00c9galit\u00e9 \u2014 aucune d\u00e9cision atteinte",
    allocatePointsBudget: "R\u00e9partissez les points entre les propositions, puis soumettez-les tous en une fois.",
    resetConfirm: "R\u00e9initialiser ce vote\u00a0? Toutes les r\u00e9ponses et les tours seront d\u00e9finitivement supprim\u00e9s.",
    resetWarning: "Cela supprimera tous les votes et les tours, et r\u00e9tablira le vote en Brouillon. Cette action est irr\u00e9versible.",
  },
  placeholders: {
    title: "Que devons-nous d\u00e9cider\u00a0?",
    description: "Contexte optionnel pour les votants",
    signature: "Ajoutez un texte de d\u00e9cision formel...",
    summaryOverride: "Remplacer le r\u00e9sum\u00e9 g\u00e9n\u00e9r\u00e9 automatiquement...",
    comment: "Partagez vos id\u00e9es...",
    proposal: "Votre proposition...",
    searchVotes: "Rechercher des votes...",
    url: "https://...",
    writeProposal: "\u00c9crivez votre proposition ici...",
    shortDescription: "Description courte optionnelle",
    displayName: "Nom affich\u00e9",
    email: "E-mail (optionnel)",
    refineProposal: "Affinez le texte de la proposition pour ce tour...",
  },
  pages: {
    consultations: "Consultations",
    decisions: "D\u00e9cisions",
    newConsultation: "Nouvelle consultation",
    newDecision: "Nouvelle d\u00e9cision",
    noConsultationsYet: "Aucune consultation",
    noDecisionsYet: "Aucune d\u00e9cision",
    createConsultationDescription: "Cr\u00e9ez des consultations pour recueillir les avis de votre audience",
    createDecisionDescription: "Cr\u00e9ez des d\u00e9cisions avec un r\u00e9sultat formel engageant",
    editVote: "Modifier le vote",
    createNewVote: "Cr\u00e9er un vote",
    finalizing: "Finalisation...",
    proposalSelected: "Proposition s\u00e9lectionn\u00e9e comme d\u00e9cision.",
    closed: "Ferm\u00e9",
  },
};

type Locale = "en" | "fr";

function detectLocale(): Locale {
  const lang = navigator?.language?.toLowerCase() ?? "en";
  if (lang.startsWith("fr")) return "fr";
  return "en";
}

const strings: Record<Locale, VotingStrings> = { en, fr };

let cachedLocale: Locale | null = null;

export function getVotingStrings(locale?: Locale): VotingStrings {
  if (locale) return strings[locale];
  if (!cachedLocale) cachedLocale = detectLocale();
  return strings[cachedLocale];
}

export function useVotingLocale(): Locale {
  if (!cachedLocale) cachedLocale = detectLocale();
  return cachedLocale;
}

export type { VotingStrings, Locale };