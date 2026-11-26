import i18next from "i18next";

type VotingStrings = {
  phases: Record<string, string>;
  kinds: Record<string, string>;
  kindDescriptions: Record<string, string>;
  modes: Record<string, string>;
  modeDescriptions: Record<string, string>;
  attendanceOptions: {
    going: string;
    maybe: string;
    notGoing: string;
  };
  attendance: {
    dateTime: string;
    addToCalendar: string;
    displayName: string;
    email: string;
    partySize: string;
    visibility: string;
    visibilityPublic: string;
    visibilityHidden: string;
    customQuestions: string;
    rsvpTitle: string;
    rsvpThanks: string;
    removalNotice: string;
    removalError: string;
    removalConfirm: string;
    full: string;
    attendees: string;
    hiddenAttendees: string;
    noAttendees: string;
    manageRsvp: string;
    removeRsvp: string;
    privateRemovalLink: string;
    linkCopied: string;
    requiredAnswer: string;
    invalidAnswer: string;
    invalidEmail: string;
    submitError: string;
    welcomeTitle: string;
    welcomeDescription: string;
    useRandomName: string;
    saveName: string;
    nameRequired: string;
    eventInfo: string;
    votingAs: string;
    changeName: string;
    nameAttachedNote: string;
  };
  attendanceEditor: {
    sectionTitle: string;
    eventStartAt: string;
    eventEndAt: string;
    location: string;
    locationPlaceholder: string;
    coverImageUrl: string;
    coverImageUrlPlaceholder: string;
    infoUrl: string;
    infoUrlPlaceholder: string;
    welcomeModal: string;
    welcomeModalHelp: string;
    askEmail: string;
    allowPartySize: string;
    maxPartySize: string;
    maxPartySizeHelp: string;
    allowHiddenAttendance: string;
    maxAttendees: string;
    maxAttendeesHelp: string;
    unlimited: string;
    customQuestions: string;
    customQuestionsHelp: string;
    noQuestions: string;
    question: string;
    prompt: string;
    promptPlaceholder: string;
    type: string;
    typeText: string;
    typeChoice: string;
    options: string;
    optionsPlaceholder: string;
    required: string;
    addQuestion: string;
    removeQuestion: string;
  };
  scheduling: {
    timezone: string;
    yourTimezone: string;
    time: string;
    myAvailability: string;
    groupAvailability: string;
    dateRange: string;
    dailyStart: string;
    dailyEnd: string;
    duration: string;
    minutes: string;
    slotCount: string;
    noSlots: string;
    available: string;
    ifNeeded: string;
    unavailable: string;
    unavailableNoAnswer: string;
    coverage: string;
    everyoneAvailable: string;
    everyoneCanAttendIfNeeded: string;
    selectAllAvailable: string;
    clearAll: string;
    bestTimes: string;
    bestDays: string;
    noCommonTime: string;
    allDay: string;
    dayCount: string;
    selectDaysHelp: string;
    days: string;
    heatmap: string;
    participants: string;
    addToCalendar: string;
    winningTime: string;
    noWinningTime: string;
    helpText: string;
    selectSlotsHelp: string;
    submitError: string;
    namePrompt: string;
    namePromptHelp: string;
    removeParticipant: string;
    removeParticipantConfirm: string;
    editCell: string;
    cellSaveError: string;
  };
  schedulingEditor: {
    sectionTitle: string;
    askFor: string;
    unitTime: string;
    unitDay: string;
    dayModeHelp: string;
    timezone: string;
    timezoneHelp: string;
    dates: string;
    datesHelp: string;
    dateRange: string;
    applyRange: string;
    startDate: string;
    endDate: string;
    weekdays: string;
    weekdaysHelp: string;
    dailyStart: string;
    dailyEnd: string;
    granularity: string;
    granularityHelp: string;
    duration: string;
    durationHelp: string;
    allowIfNeeded: string;
    maxSlots: string;
    maxSlotsHelp: string;
    generateSlots: string;
    slotCount: string;
    preview: string;
    noSlots: string;
    removeSlot: string;
    addDate: string;
    removeDate: string;
    minutesUnit: string;
    fifteenMinutes: string;
    thirtyMinutes: string;
    sixtyMinutes: string;
  };
  mjGrades: Record<number, string>;
  buttons: {
    vote: string;
    voted: string;
    submit: string;
    submitPoints: string;
    submitAllVotes: string;
    cancel: string;
    confirm: string;
    close: string;
    copy: string;
    copied: string;
    add: string;
    addProposal: string;
    batchImport: string;
    import: string;
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
    batchImportProposals: string;
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
    sortResults: string;
    sortByOriginal: string;
    sortByMedian: string;
    sortByAverage: string;
    sortAscending: string;
    sortDescending: string;
  };
  messages: {
    loading: string;
    loadingVote: string;
    loadingModeration: string;
    loadingResults: string;
    noVotesYet: string;
    batchImportProposalsDescription: string;
    noVotesAvailable: string;
    noModerators: string;
    noRoundsYet: string;
    noActiveRound: string;
    noMatchingVotes: string;
    voteNotFound: string;
    notOpenForResponses: string;
    closedNoMoreResponses: string;
    thanksVoted: string;
    thanksVotedNoChange: string;
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
    consentLoopFinalOutcome: string;
    consentLoopNoAdoptedRound: string;
    consentLoopBestRound: string;
    selectWinningRound: string;
    roundAuto: string;
    allocatePointsBudget: string;
    attendancePrompt: string;
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
    batchImportProposals: string;
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
    ATTENDANCE: "Attendance",
    POINTS: "Points Budget",
    MAJORITY_JUDGMENT: "Majority Judgment",
    CONSENT_LOOP: "Consent Loop",
    COMPARATIVE_PRIORITIZATION: "Comparative Prioritization",
    SCHEDULING: "Scheduling",
  },
  modeDescriptions: {
    THUMBS_UP: "Simple yes vote per proposal",
    THUMBS_UD_NEUTRAL: "Up, down, or neutral per proposal",
    ATTENDANCE: "Single RSVP for the whole event",
    POINTS: "Distribute a budget of points",
    MAJORITY_JUDGMENT: "Grade each proposal on a scale",
    CONSENT_LOOP: "Iterative rounds until adopted or blocked",
    COMPARATIVE_PRIORITIZATION: "Rank proposals through adaptive pairwise comparisons",
    SCHEDULING: "Find the best time in candidate slots",
  },
  attendanceOptions: {
    going: "Going",
    maybe: "Maybe",
    notGoing: "Not going",
  },
  attendance: {
    dateTime: "Date & time",
    addToCalendar: "Add to calendar",
    displayName: "Display name",
    email: "Email (optional)",
    partySize: "Party size",
    visibility: "Visibility",
    visibilityPublic: "Show me in the attendee list",
    visibilityHidden: "Hide me from the attendee list",
    customQuestions: "Additional questions",
    rsvpTitle: "Your RSVP",
    rsvpThanks: "Your RSVP has been saved. You can change it while the event is open.",
    removalNotice: "Your RSVP has been removed.",
    removalError: "We could not remove your RSVP. It may already be gone.",
    removalConfirm: "Remove your RSVP for this event? This cannot be undone.",
    full: "This event is full.",
    attendees: "Attendees",
    hiddenAttendees: "hidden attendees",
    noAttendees: "No attendees yet.",
    manageRsvp: "Manage your RSVP",
    removeRsvp: "Remove my RSVP",
    privateRemovalLink: "Private removal link",
    linkCopied: "Link copied",
    requiredAnswer: "Please answer the required question",
    invalidAnswer: "Please check your answer",
    invalidEmail: "Please enter a valid email address",
    submitError: "Could not save your RSVP. Please try again.",
    welcomeTitle: "Welcome!",
    welcomeDescription: "Choose the name other attendees will see.",
    useRandomName: "Use a random name",
    saveName: "Save name",
    nameRequired: "Please enter a display name",
    eventInfo: "Event details",
    votingAs: "You're voting as",
    changeName: "Change name",
    nameAttachedNote: "This name is attached to your responses.",
  },
  attendanceEditor: {
    sectionTitle: "Event settings",
    eventStartAt: "Event start",
    eventEndAt: "Event end",
    location: "Location",
    locationPlaceholder: "e.g. Community hall, 3rd floor",
    coverImageUrl: "Cover image URL",
    coverImageUrlPlaceholder: "https://...",
    infoUrl: "Info URL",
    infoUrlPlaceholder: "https://...",
    welcomeModal: "Ask non-anonymous voters for a display name",
    welcomeModalHelp: "Shows a welcome dialog where voters pick the name shown in the attendee list.",
    askEmail: "Ask for an email address",
    allowPartySize: "Allow party size",
    maxPartySize: "Max party size",
    maxPartySizeHelp: "Between 1 and 100 people per RSVP.",
    allowHiddenAttendance: "Allow hidden attendance",
    maxAttendees: "Max attendees",
    maxAttendeesHelp: "Total number of people allowed. 0 means unlimited.",
    unlimited: "Unlimited",
    customQuestions: "Custom questions",
    customQuestionsHelp: "Ask voters extra questions when they RSVP.",
    noQuestions: "No custom questions yet.",
    question: "Question",
    prompt: "Prompt",
    promptPlaceholder: "e.g. Any dietary requirements?",
    type: "Type",
    typeText: "Text",
    typeChoice: "Choice",
    options: "Options",
    optionsPlaceholder: "Option A\nOption B",
    required: "Required",
    addQuestion: "Add question",
    removeQuestion: "Remove",
  },
  scheduling: {
    timezone: "Time zone",
    yourTimezone: "Your time zone",
    time: "Time",
    myAvailability: "My availability",
    groupAvailability: "Group availability",
    dateRange: "Date range",
    dailyStart: "Daily start",
    dailyEnd: "Daily end",
    duration: "Meeting length",
    minutes: "minutes",
    slotCount: "{{count}} slots",
    noSlots: "No slots yet",
    available: "Available",
    ifNeeded: "If needed",
    unavailable: "Unavailable",
    unavailableNoAnswer: "Unavailable / no answer",
    coverage: "Coverage",
    everyoneAvailable: "Everyone is available",
    everyoneCanAttendIfNeeded: "Everyone can attend if needed",
    selectAllAvailable: "Select all available",
    clearAll: "Clear all",
    bestTimes: "Best times",
    bestDays: "Best days",
    noCommonTime: "No common availability yet.",
    allDay: "All day",
    dayCount: "{{count}} days",
    selectDaysHelp: "Click a day to toggle it; drag to paint the selected status.",
    days: "days",
    heatmap: "Heatmap",
    participants: "Participants",
    addToCalendar: "Add to calendar",
    winningTime: "Winning time",
    noWinningTime: "No times available",
    helpText: "Mark each slot as available, if needed, or unavailable.",
    selectSlotsHelp: "Click a slot to toggle it; drag to paint the selected status.",
    submitError: "Could not save your availability. Please try again.",
    namePrompt: "What name should others see?",
    namePromptHelp: "Your name is only shown to the organizer and moderators.",
    removeParticipant: "Remove this participant",
    removeParticipantConfirm: "Delete all availability for {{name}}? This cannot be undone.",
    editCell: "Edit this availability",
    cellSaveError: "Could not save this change.",
  },
  schedulingEditor: {
    sectionTitle: "Scheduling settings",
    askFor: "Ask for",
    unitTime: "Time slots",
    unitDay: "Whole days",
    dayModeHelp:
      "Voters pick whole days. Daily start and end, slot length and meeting length are not used.",
    timezone: "Time zone",
    timezoneHelp: "Slots are generated in this IANA time zone.",
    dates: "Dates",
    datesHelp: "Add each local day that can host the meeting.",
    dateRange: "Date range",
    applyRange: "Apply range",
    startDate: "Start date",
    endDate: "End date",
    weekdays: "Weekdays",
    weekdaysHelp: "Only include these weekdays inside the range.",
    dailyStart: "Daily start",
    dailyEnd: "Daily end",
    granularity: "Slot length",
    granularityHelp: "Each candidate slot is this long.",
    duration: "Meeting length",
    durationHelp: "Voters must be free for this many consecutive slots.",
    allowIfNeeded: "Allow “if needed” answers",
    maxSlots: "Maximum slots",
    maxSlotsHelp: "Generated slots are capped at this number (1–1000).",
    generateSlots: "Generate slots",
    slotCount: "{{count}} slots",
    preview: "Preview",
    noSlots: "No slots generated yet.",
    removeSlot: "Remove slot",
    addDate: "Add date",
    removeDate: "Remove",
    minutesUnit: "min",
    fifteenMinutes: "15 minutes",
    thirtyMinutes: "30 minutes",
    sixtyMinutes: "60 minutes",
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
    submitAllVotes: "Submit all votes",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    copy: "Copy",
    copied: "Copied!",
    add: "Add",
    addProposal: "Add proposal",
    batchImport: "Batch import",
    import: "Import",
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
    batchImportProposals: "Batch import proposals",
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
    sortResults: "Sort results",
    sortByOriginal: "Original order",
    sortByMedian: "Majority Mention (median)",
    sortByAverage: "Average",
    sortAscending: "Ascending",
    sortDescending: "Descending",
  },
  messages: {
    loading: "Loading...",
    loadingVote: "Loading vote...",
    loadingModeration: "Loading moderation view...",
    loadingResults: "Loading results...",
    noVotesYet: "No votes yet.",
    batchImportProposalsDescription: "Paste one proposal per line. Each line becomes a proposal.",
    noVotesAvailable: "No votes available",
    noModerators: "No moderators added yet.",
    noRoundsYet: "No rounds yet. Open the first round to begin the consent loop.",
    noActiveRound: "No active round. Open a round to begin editing.",
    noMatchingVotes: "No matching votes",
    voteNotFound: "Vote not found",
    notOpenForResponses: "This vote is not yet open for responses.",
    closedNoMoreResponses: "This vote is closed. No more responses are accepted.",
    thanksVoted: "Thanks, you voted! You can still change your vote while the vote is open.",
    thanksVotedNoChange: "Thanks, you voted! Your vote is final and cannot be changed.",
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
    consentLoopFinalOutcome: "Consent Loop Outcome",
    consentLoopNoAdoptedRound: "No round was adopted — objections remained throughout.",
    consentLoopBestRound: "Best adopted round",
    selectWinningRound: "Select the round to use as the final result",
    roundAuto: "Auto (best adopted round)",
    allocatePointsBudget: "Allocate points across proposals, then submit all at once.",
    attendancePrompt: "Let others know if you are going to this event.",
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
    batchImportProposals: "Proposal A\nProposal B\nProposal C",
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
    newConsultation: "Consultation",
    newDecision: "Decision",
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
    ATTENDANCE: "Pr\u00e9sence",
    POINTS: "Budget de points",
    MAJORITY_JUDGMENT: "Jugement majoritaire",
    CONSENT_LOOP: "Boucle de consentement",
    COMPARATIVE_PRIORITIZATION: "Priorisation comparative",
    SCHEDULING: "Planification",
  },
  modeDescriptions: {
    THUMBS_UP: "Vote simple par proposition",
    THUMBS_UD_NEUTRAL: "Pour, contre ou neutre par proposition",
    ATTENDANCE: "Une seule r\u00e9ponse de pr\u00e9sence pour l'\u00e9v\u00e9nement",
    POINTS: "R\u00e9partir un budget de points",
    MAJORITY_JUDGMENT: "Noter chaque proposition sur une \u00e9chelle",
    CONSENT_LOOP: "Tours it\u00e9ratifs jusqu'\u00e0 adoption ou blocage",
    COMPARATIVE_PRIORITIZATION: "Classer les propositions par comparaisons par paires adaptatives",
    SCHEDULING: "Trouver le meilleur cr\u00e9neau parmi les disponibilit\u00e9s",
  },
  attendanceOptions: {
    going: "Pr\u00e9sent",
    maybe: "Peut-\u00eatre",
    notGoing: "Absent",
  },
  attendance: {
    dateTime: "Date et heure",
    addToCalendar: "Ajouter au calendrier",
    displayName: "Nom affich\u00e9",
    email: "E-mail (optionnel)",
    partySize: "Nombre de personnes",
    visibility: "Visibilit\u00e9",
    visibilityPublic: "M'afficher dans la liste des participants",
    visibilityHidden: "Me masquer de la liste des participants",
    customQuestions: "Questions suppl\u00e9mentaires",
    rsvpTitle: "Votre r\u00e9ponse",
    rsvpThanks: "Votre r\u00e9ponse a \u00e9t\u00e9 enregistr\u00e9e. Vous pouvez la modifier tant que l'\u00e9v\u00e9nement est ouvert.",
    removalNotice: "Votre r\u00e9ponse a \u00e9t\u00e9 supprim\u00e9e.",
    removalError: "Impossible de supprimer votre r\u00e9ponse. Elle a peut-\u00eatre d\u00e9j\u00e0 \u00e9t\u00e9 retir\u00e9e.",
    removalConfirm: "Supprimer votre r\u00e9ponse pour cet \u00e9v\u00e9nement\u00a0? Cette action est irr\u00e9versible.",
    full: "Cet \u00e9v\u00e9nement est complet.",
    attendees: "Participants",
    hiddenAttendees: "participants masqu\u00e9s",
    noAttendees: "Aucun participant pour le moment.",
    manageRsvp: "G\u00e9rer votre r\u00e9ponse",
    removeRsvp: "Supprimer ma r\u00e9ponse",
    privateRemovalLink: "Lien de suppression priv\u00e9",
    linkCopied: "Lien copi\u00e9",
    requiredAnswer: "Veuillez r\u00e9pondre \u00e0 la question obligatoire",
    invalidAnswer: "Veuillez v\u00e9rifier votre r\u00e9ponse",
    invalidEmail: "Veuillez saisir une adresse e-mail valide",
    submitError: "Impossible d'enregistrer votre r\u00e9ponse. Veuillez r\u00e9essayer.",
    welcomeTitle: "Bienvenue\u00a0!",
    welcomeDescription: "Choisissez le nom que les autres participants verront.",
    useRandomName: "Utiliser un nom al\u00e9atoire",
    saveName: "Enregistrer le nom",
    nameRequired: "Veuillez saisir un nom affich\u00e9",
    eventInfo: "D\u00e9tails de l'\u00e9v\u00e9nement",
    votingAs: "Vous votez en tant que",
    changeName: "Changer de nom",
    nameAttachedNote: "Ce nom est associ\u00e9 \u00e0 vos r\u00e9ponses.",
  },
  attendanceEditor: {
    sectionTitle: "Param\u00e8tres de l'\u00e9v\u00e9nement",
    eventStartAt: "D\u00e9but de l'\u00e9v\u00e9nement",
    eventEndAt: "Fin de l'\u00e9v\u00e9nement",
    location: "Lieu",
    locationPlaceholder: "p. ex. Salle communale, 3e \u00e9tage",
    coverImageUrl: "URL de l'image de couverture",
    coverImageUrlPlaceholder: "https://...",
    infoUrl: "URL d'information",
    infoUrlPlaceholder: "https://...",
    welcomeModal: "Demander un nom affich\u00e9 aux votants non anonymes",
    welcomeModalHelp: "Affiche une fen\u00eatre d'accueil o\u00f9 les votants choisissent le nom visible dans la liste des participants.",
    askEmail: "Demander une adresse e-mail",
    allowPartySize: "Autoriser le nombre de personnes",
    maxPartySize: "Nombre de personnes maximum",
    maxPartySizeHelp: "Entre 1 et 100 personnes par r\u00e9ponse.",
    allowHiddenAttendance: "Autoriser la participation masqu\u00e9e",
    maxAttendees: "Participants maximum",
    maxAttendeesHelp: "Nombre total de personnes autoris\u00e9es. 0 signifie illimit\u00e9.",
    unlimited: "Illimit\u00e9",
    customQuestions: "Questions personnalis\u00e9es",
    customQuestionsHelp: "Posez des questions suppl\u00e9mentaires lors de la r\u00e9ponse.",
    noQuestions: "Aucune question personnalis\u00e9e pour le moment.",
    question: "Question",
    prompt: "Intitul\u00e9",
    promptPlaceholder: "p. ex. Des restrictions alimentaires\u00a0?",
    type: "Type",
    typeText: "Texte",
    typeChoice: "Choix",
    options: "Options",
    optionsPlaceholder: "Option A\nOption B",
    required: "Obligatoire",
    addQuestion: "Ajouter une question",
    removeQuestion: "Supprimer",
  },
  scheduling: {
    timezone: "Fuseau horaire",
    yourTimezone: "Votre fuseau horaire",
    time: "Heure",
    myAvailability: "Mes disponibilités",
    groupAvailability: "Disponibilités du groupe",
    dateRange: "Plage de dates",
    dailyStart: "D\u00e9but quotidien",
    dailyEnd: "Fin quotidienne",
    duration: "Dur\u00e9e de la r\u00e9union",
    minutes: "minutes",
    slotCount: "{{count}} cr\u00e9neaux",
    noSlots: "Aucun cr\u00e9neau pour le moment",
    available: "Disponible",
    ifNeeded: "Si n\u00e9cessaire",
    unavailable: "Indisponible",
    unavailableNoAnswer: "Indisponible / sans r\u00e9ponse",
    coverage: "Couverture",
    everyoneAvailable: "Tout le monde est disponible",
    everyoneCanAttendIfNeeded: "Tout le monde peut venir si n\u00e9cessaire",
    selectAllAvailable: "Tout marquer disponible",
    clearAll: "Tout effacer",
    bestTimes: "Meilleurs moments",
    bestDays: "Meilleurs jours",
    noCommonTime: "Aucune disponibilit\u00e9 commune pour le moment.",
    allDay: "Journ\u00e9e enti\u00e8re",
    dayCount: "{{count}} jours",
    selectDaysHelp: "Cliquez sur un jour pour le basculer ; glissez pour appliquer le statut s\u00e9lectionn\u00e9.",
    days: "jours",
    heatmap: "Carte de chaleur",
    participants: "Participants",
    addToCalendar: "Ajouter au calendrier",
    winningTime: "Cr\u00e9neau retenu",
    noWinningTime: "Aucun cr\u00e9neau disponible",
    helpText: "Indiquez chaque cr\u00e9neau comme disponible, si n\u00e9cessaire ou indisponible.",
    selectSlotsHelp: "Cliquez sur un cr\u00e9neau pour le basculer ; glissez pour appliquer le statut s\u00e9lectionn\u00e9.",
    submitError: "Impossible d'enregistrer vos disponibilit\u00e9s. Veuillez r\u00e9essayer.",
    namePrompt: "Quel nom les autres doivent-ils voir ?",
    namePromptHelp: "Votre nom n'est visible que par l'organisateur et les mod\u00e9rateurs.",
    removeParticipant: "Supprimer ce participant",
    removeParticipantConfirm: "Supprimer toutes les disponibilit\u00e9s de {{name}} ? Cette action est irr\u00e9versible.",
    editCell: "Modifier cette disponibilit\u00e9",
    cellSaveError: "Impossible d'enregistrer cette modification.",
  },
  schedulingEditor: {
    sectionTitle: "Param\u00e8tres de planification",
    askFor: "Demander",
    unitTime: "Cr\u00e9neaux horaires",
    unitDay: "Journ\u00e9es enti\u00e8res",
    dayModeHelp:
      "Les votants choisissent des journ\u00e9es enti\u00e8res ; le d\u00e9but, la fin, la dur\u00e9e des cr\u00e9neaux et la dur\u00e9e de la r\u00e9union ne sont pas utilis\u00e9s.",
    timezone: "Fuseau horaire",
    timezoneHelp: "Les cr\u00e9neaux sont g\u00e9n\u00e9r\u00e9s dans ce fuseau IANA.",
    dates: "Dates",
    datesHelp: "Ajoutez chaque jour local pouvant accueillir la r\u00e9union.",
    dateRange: "Plage de dates",
    applyRange: "Appliquer la plage",
    startDate: "Date de d\u00e9but",
    endDate: "Date de fin",
    weekdays: "Jours de la semaine",
    weekdaysHelp: "N'inclure que ces jours dans la plage.",
    dailyStart: "D\u00e9but quotidien",
    dailyEnd: "Fin quotidienne",
    granularity: "Dur\u00e9e du cr\u00e9neau",
    granularityHelp: "Chaque cr\u00e9neau candidat a cette dur\u00e9e.",
    duration: "Dur\u00e9e de la r\u00e9union",
    durationHelp: "Les votants doivent \u00eatre libres pendant ces cr\u00e9neaux cons\u00e9cutifs.",
    allowIfNeeded: "Autoriser les r\u00e9ponses \u00ab si n\u00e9cessaire \u00bb",
    maxSlots: "Cr\u00e9neaux maximum",
    maxSlotsHelp: "Les cr\u00e9neaux g\u00e9n\u00e9r\u00e9s sont limit\u00e9s \u00e0 ce nombre (1\u20131000).",
    generateSlots: "G\u00e9n\u00e9rer les cr\u00e9neaux",
    slotCount: "{{count}} cr\u00e9neaux",
    preview: "Aper\u00e7u",
    noSlots: "Aucun cr\u00e9neau g\u00e9n\u00e9r\u00e9 pour le moment.",
    removeSlot: "Supprimer le cr\u00e9neau",
    addDate: "Ajouter une date",
    removeDate: "Supprimer",
    minutesUnit: "min",
    fifteenMinutes: "15 minutes",
    thirtyMinutes: "30 minutes",
    sixtyMinutes: "60 minutes",
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
    submitAllVotes: "Soumettre tous les votes",
    cancel: "Annuler",
    confirm: "Confirmer",
    close: "Fermer",
    copy: "Copier",
    copied: "Copi\u00e9\u00a0!",
    add: "Ajouter",
    addProposal: "Ajouter une proposition",
    batchImport: "Importer en lot",
    import: "Importer",
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
    batchImportProposals: "Importer des propositions en lot",
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
    sortResults: "Trier les r\u00e9sultats",
    sortByOriginal: "Ordre original",
    sortByMedian: "Mention majoritaire (m\u00e9diane)",
    sortByAverage: "Moyenne",
    sortAscending: "Croissant",
    sortDescending: "D\u00e9croissant",
  },
  messages: {
    loading: "Chargement...",
    loadingVote: "Chargement du vote...",
    loadingModeration: "Chargement de la mod\u00e9ration...",
    loadingResults: "Chargement des r\u00e9sultats...",
    noVotesYet: "Aucun vote pour le moment.",
    batchImportProposalsDescription: "Collez une proposition par ligne. Chaque ligne devient une proposition.",
    noVotesAvailable: "Aucun vote disponible",
    noModerators: "Aucun mod\u00e9rateur ajout\u00e9.",
    noRoundsYet: "Aucun tour. Ouvrez le premier tour pour commencer la boucle de consentement.",
    noActiveRound: "Aucun tour actif. Ouvrez un tour pour commencer l'\u00e9dition.",
    noMatchingVotes: "Aucun vote correspondant",
    voteNotFound: "Vote introuvable",
    notOpenForResponses: "Ce vote n'est pas encore ouvert aux r\u00e9ponses.",
    closedNoMoreResponses: "Ce vote est ferm\u00e9. Aucune r\u00e9ponse suppl\u00e9mentaire n'est accept\u00e9e.",
    thanksVoted: "Merci, vous avez vot\u00e9\u00a0! Vous pouvez encore modifier votre vote tant que le vote est ouvert.",
    thanksVotedNoChange: "Merci, vous avez vot\u00e9\u00a0! Votre vote est d\u00e9finitif et ne peut pas \u00eatre modifi\u00e9.",
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
    consentLoopFinalOutcome: "R\u00e9sultat du Consent Loop",
    consentLoopNoAdoptedRound: "Aucun tour adopt\u00e9 \u2014 des objections sont rest\u00e9es jusqu'au bout.",
    consentLoopBestRound: "Meilleur tour adopt\u00e9",
    selectWinningRound: "S\u00e9lectionnez le tour \u00e0 utiliser comme r\u00e9sultat final",
    roundAuto: "Auto (meilleur tour adopt\u00e9)",
    allocatePointsBudget: "R\u00e9partissez les points entre les propositions, puis soumettez-les tous en une fois.",
    attendancePrompt: "Indiquez si vous participez \u00e0 cet \u00e9v\u00e9nement.",
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
    batchImportProposals: "Proposition A\nProposition B\nProposition C",
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

const de: VotingStrings = {
  phases: {
    IDLE: "Entwurf",
    OPEN: "Offen",
    CLOSED: "Geschlossen",
    FINALIZED: "Abgeschlossen",
  },
  kinds: {
    consultation: "Konsultation",
    decision: "Entscheid",
  },
  kindDescriptions: {
    consultation: "Input sammeln — Ergebnisse sind beratend",
    decision: "Formaler verbindlicher Ergebnis mit Finalisierungsschritt",
  },
  modes: {
    THUMBS_UP: "Daumen hoch",
    THUMBS_UD_NEUTRAL: "Hoch / Runter / Neutral",
    ATTENDANCE: "Teilnahme",
    POINTS: "Punkte-Budget",
    MAJORITY_JUDGMENT: "Mehrheitsurteil",
    CONSENT_LOOP: "Zustimmungs-Schleife",
    COMPARATIVE_PRIORITIZATION: "Vergleichende Priorisierung",
    SCHEDULING: "Terminplanung",
  },
  modeDescriptions: {
    THUMBS_UP: "Einfache Ja-Stimme pro Vorschlag",
    THUMBS_UD_NEUTRAL: "Hoch, runter oder neutral pro Vorschlag",
    ATTENDANCE: "Eine einzige Zu- oder Absage für die Veranstaltung",
    POINTS: "Ein Punktebudget verteilen",
    MAJORITY_JUDGMENT: "Jeden Vorschlag auf einer Skala bewerten",
    CONSENT_LOOP: "Iterative Runden bis angenommen oder blockiert",
    COMPARATIVE_PRIORITIZATION: "Vorschläge durch adaptive Paarvergleiche ordnen",
    SCHEDULING: "Die beste Zeit aus Kandidaten-Slots finden",
  },
  attendanceOptions: {
    going: "Dabei",
    maybe: "Vielleicht",
    notGoing: "Nicht dabei",
  },
  attendance: {
    dateTime: "Datum & Uhrzeit",
    addToCalendar: "Zum Kalender hinzuf\u00fcgen",
    displayName: "Anzeige-Name",
    email: "E-Mail (optional)",
    partySize: "Personenzahl",
    visibility: "Sichtbarkeit",
    visibilityPublic: "In der Teilnehmerliste anzeigen",
    visibilityHidden: "In der Teilnehmerliste verbergen",
    customQuestions: "Weitere Fragen",
    rsvpTitle: "Ihre R\u00fcckmeldung",
    rsvpThanks: "Ihre R\u00fcckmeldung wurde gespeichert. Sie k\u00f6nnen sie \u00e4ndern, solange die Veranstaltung offen ist.",
    removalNotice: "Ihre R\u00fcckmeldung wurde entfernt.",
    removalError: "Ihre R\u00fcckmeldung konnte nicht entfernt werden. M\u00f6glicherweise wurde sie bereits gel\u00f6scht.",
    removalConfirm: "Ihre R\u00fcckmeldung f\u00fcr diese Veranstaltung entfernen? Dies kann nicht r\u00fcckg\u00e4ngig gemacht werden.",
    full: "Diese Veranstaltung ist ausgebucht.",
    attendees: "Teilnehmende",
    hiddenAttendees: "versteckte Teilnehmende",
    noAttendees: "Noch keine Teilnehmenden.",
    manageRsvp: "R\u00fcckmeldung verwalten",
    removeRsvp: "Meine R\u00fcckmeldung entfernen",
    privateRemovalLink: "Privater L\u00f6schlink",
    linkCopied: "Link kopiert",
    requiredAnswer: "Bitte beantworten Sie die Pflichtfrage",
    invalidAnswer: "Bitte \u00fcberpr\u00fcfen Sie Ihre Antwort",
    invalidEmail: "Bitte geben Sie eine g\u00fcltige E-Mail-Adresse ein",
    submitError: "Ihre R\u00fcckmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    welcomeTitle: "Willkommen!",
    welcomeDescription: "W\u00e4hlen Sie den Namen, den andere Teilnehmende sehen.",
    useRandomName: "Zuf\u00e4lligen Namen verwenden",
    saveName: "Namen speichern",
    nameRequired: "Bitte geben Sie einen Anzeige-Namen ein",
    eventInfo: "Veranstaltungsdetails",
    votingAs: "Sie stimmen ab als",
    changeName: "Namen \u00e4ndern",
    nameAttachedNote: "Dieser Name ist mit Ihren Antworten verkn\u00fcpft.",
  },
  attendanceEditor: {
    sectionTitle: "Veranstaltungseinstellungen",
    eventStartAt: "Beginn der Veranstaltung",
    eventEndAt: "Ende der Veranstaltung",
    location: "Ort",
    locationPlaceholder: "z. B. Gemeindesaal, 3. Stock",
    coverImageUrl: "URL des Titelbilds",
    coverImageUrlPlaceholder: "https://...",
    infoUrl: "Info-URL",
    infoUrlPlaceholder: "https://...",
    welcomeModal: "Nicht-anonyme Abstimmende nach Anzeige-Namen fragen",
    welcomeModalHelp: "Zeigt einen Willkommensdialog, in dem Abstimmende den Namen f\u00fcr die Teilnehmerliste w\u00e4hlen.",
    askEmail: "Nach E-Mail-Adresse fragen",
    allowPartySize: "Personenzahl erlauben",
    maxPartySize: "Max. Personenzahl",
    maxPartySizeHelp: "Zwischen 1 und 100 Personen pro R\u00fcckmeldung.",
    allowHiddenAttendance: "Versteckte Teilnahme erlauben",
    maxAttendees: "Max. Teilnehmende",
    maxAttendeesHelp: "Gesamtzahl der erlaubten Personen. 0 bedeutet unbegrenzt.",
    unlimited: "Unbegrenzt",
    customQuestions: "Eigene Fragen",
    customQuestionsHelp: "Stellen Sie Abstimmenden bei der R\u00fcckmeldung zus\u00e4tzliche Fragen.",
    noQuestions: "Noch keine eigenen Fragen.",
    question: "Frage",
    prompt: "Frage",
    promptPlaceholder: "z. B. Besondere Ern\u00e4hrungsanforderungen?",
    type: "Typ",
    typeText: "Text",
    typeChoice: "Auswahl",
    options: "Optionen",
    optionsPlaceholder: "Option A\nOption B",
    required: "Erforderlich",
    addQuestion: "Frage hinzuf\u00fcgen",
    removeQuestion: "Entfernen",
  },
  scheduling: {
    timezone: "Zeitzone",
    yourTimezone: "Deine Zeitzone",
    time: "Zeit",
    myAvailability: "Meine Verfügbarkeit",
    groupAvailability: "Gruppenverfügbarkeit",
    dateRange: "Datumsbereich",
    dailyStart: "T\u00e4glicher Beginn",
    dailyEnd: "T\u00e4gliches Ende",
    duration: "Besprechungsdauer",
    minutes: "Minuten",
    slotCount: "{{count}} Slots",
    noSlots: "Noch keine Slots",
    available: "Verf\u00fcgbar",
    ifNeeded: "Falls n\u00f6tig",
    unavailable: "Nicht verf\u00fcgbar",
    unavailableNoAnswer: "Nicht verf\u00fcgbar / keine Antwort",
    coverage: "Abdeckung",
    everyoneAvailable: "Alle sind verf\u00fcgbar",
    everyoneCanAttendIfNeeded: "Alle k\u00f6nnen bei Bedarf teilnehmen",
    selectAllAvailable: "Alle als verf\u00fcgbar markieren",
    clearAll: "Alle leeren",
    bestTimes: "Beste Zeiten",
    bestDays: "Beste Tage",
    noCommonTime: "Noch keine gemeinsame Verf\u00fcgbarkeit.",
    allDay: "Ganzt\u00e4gig",
    dayCount: "{{count}} Tage",
    selectDaysHelp: "Klicken Sie auf einen Tag, um ihn umzuschalten; ziehen Sie, um den gew\u00e4hlten Status zu malen.",
    days: "Tage",
    heatmap: "Heatmap",
    participants: "Teilnehmende",
    addToCalendar: "Zum Kalender hinzuf\u00fcgen",
    winningTime: "Gew\u00e4hlte Zeit",
    noWinningTime: "Keine Zeiten verf\u00fcgbar",
    helpText: "Markieren Sie jeden Slot als verf\u00fcgbar, falls n\u00f6tig oder nicht verf\u00fcgbar.",
    selectSlotsHelp: "Klicken Sie auf einen Slot, um ihn umzuschalten; ziehen Sie, um den gew\u00e4hlten Status zu malen.",
    submitError: "Ihre Verf\u00fcgbarkeit konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    namePrompt: "Welchen Namen sollen andere sehen?",
    namePromptHelp: "Ihr Name ist nur f\u00fcr die Organisation und Moderierende sichtbar.",
    removeParticipant: "Teilnehmende Person entfernen",
    removeParticipantConfirm: "Alle Verf\u00fcgbarkeiten von {{name}} l\u00f6schen? Dies kann nicht r\u00fcckg\u00e4ngig gemacht werden.",
    editCell: "Diese Verf\u00fcgbarkeit bearbeiten",
    cellSaveError: "Diese \u00c4nderung konnte nicht gespeichert werden.",
  },
  schedulingEditor: {
    sectionTitle: "Terminplanungs-Einstellungen",
    askFor: "Abfragen",
    unitTime: "Zeitfenster",
    unitDay: "Ganze Tage",
    dayModeHelp:
      "Abstimmende w\u00e4hlen ganze Tage; t\u00e4glicher Beginn, Ende, Slot-L\u00e4nge und Besprechungsdauer werden nicht verwendet.",
    timezone: "Zeitzone",
    timezoneHelp: "Slots werden in dieser IANA-Zeitzone generiert.",
    dates: "Daten",
    datesHelp: "F\u00fcgen Sie jeden lokalen Tag hinzu, an dem die Besprechung stattfinden kann.",
    dateRange: "Datumsbereich",
    applyRange: "Bereich anwenden",
    startDate: "Startdatum",
    endDate: "Enddatum",
    weekdays: "Wochentage",
    weekdaysHelp: "Nur diese Wochentage innerhalb des Bereichs einbeziehen.",
    dailyStart: "T\u00e4glicher Beginn",
    dailyEnd: "T\u00e4gliches Ende",
    granularity: "Slot-L\u00e4nge",
    granularityHelp: "Jeder Kandidaten-Slot ist so lang.",
    duration: "Besprechungsdauer",
    durationHelp: "Abstimmende m\u00fcssen \u00fcber diese aufeinanderfolgenden Slots frei sein.",
    allowIfNeeded: "\u201eFalls n\u00f6tig\u201c-Antworten erlauben",
    maxSlots: "Maximale Slots",
    maxSlotsHelp: "Generierte Slots sind auf diese Zahl begrenzt (1\u20131000).",
    generateSlots: "Slots generieren",
    slotCount: "{{count}} Slots",
    preview: "Vorschau",
    noSlots: "Noch keine Slots generiert.",
    removeSlot: "Slot entfernen",
    addDate: "Datum hinzuf\u00fcgen",
    removeDate: "Entfernen",
    minutesUnit: "Min.",
    fifteenMinutes: "15 Minuten",
    thirtyMinutes: "30 Minuten",
    sixtyMinutes: "60 Minuten",
  },
  mjGrades: {
    4: "Ausgezeichnet",
    3: "Gut",
    2: "Akzeptabel",
    1: "Genügend",
    0: "Ungenügend",
    [-1]: "Ablehnen",
  },
  buttons: {
    vote: "Abstimmen",
    voted: "Abgestimmt",
    submit: "Einreichen",
    submitPoints: "Punkte einreichen",
    submitAllVotes: "Alle Stimmen einreichen",
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    close: "Schliessen",
    copy: "Kopieren",
    copied: "Kopiert!",
    add: "Hinzufügen",
    addProposal: "Vorschlag hinzufügen",
    batchImport: "Stapelimport",
    import: "Importieren",
    addModerator: "Moderator hinzufügen",
    delete: "Löschen",
    edit: "Bearbeiten",
    createVote: "Abstimmung erstellen",
    createAndOpen: "Erstellen & Öffnen",
    createAndClose: "Erstellen & Schliessen",
    creating: "Erstellen...",
    saving: "Speichern...",
    saveChanges: "Änderungen speichern",
    finalize: "Finalisieren",
    finalizeDecision: "Entscheid finalisieren",
    openVote: "Abstimmung öffnen",
    closeVote: "Abstimmung schliessen",
    requestFinalization: "Finalisierung anfordern",
    adopt: "Annehmen",
    withdraw: "Zurückziehen",
    blocked: "Blockiert",
    downloadPng: "PNG herunterladen",
    moreInfo: "Mehr Infos",
    show: "Anzeigen",
    hide: "Ausblenden",
    share: "Teilen",
    reset: "Zurücksetzen",
    openRound: "Runde öffnen",
    closeRound: "Runde schliessen",
    saveDraft: "Entwurf speichern",
  },
  labels: {
    voting: "Abstimmung",
    outcome: "Ergebnis",
    results: "Resultate",
    rounds: "Runden",
    proposals: "Vorschläge",
    batchImportProposals: "Vorschläge im Stapel importieren",
    moderation: "Moderation",
    moderators: "Moderatoren",
    settings: "Einstellungen",
    title: "Titel",
    description: "Beschreibung",
    kind: "Art",
    mode: "Modus",
    winningProposal: "Gewinnender Vorschlag",
    summary: "Zusammenfassung (optional)",
    signature: "Signatur (optional)",
    perRoundResults: "Resultate pro Runde",
    roundControls: "Runden-Steuerung",
    roundComparison: "Runden-Vergleich",
    linkedVotes: "Verknüpfte Abstimmungen",
    linkedTask: "Verknüpfte Aufgabe",
    votingMode: "Abstimmungsmodus",
    newLinkedVote: "Neue verknüpfte Abstimmung",
    voters: "Abstimmende",
    voter: "Abstimmende:r",
    comment: "Kommentar",
    comments: "Kommentare",
    suggestProposal: "Vorschlag vorschlagen",
    finalResults: "Schlussresultate",
    blockLevelDiff: "Block-weise Diff",
    leftRound: "Linke Runde",
    rightRound: "Rechte Runde",
    currentRoundProposal: "Vorschlag der aktuellen Runde",
    currentRoundResults: "Resultate der aktuellen Runde",
    draftSaved: "Entwurf gespeichert",
    draftUnsaved: "Nicht gespeicherte Änderungen",
    roundByRoundSummary: "Runden-für-Runden-Zusammenfassung",
    maxPointsPerUser: "Max. Punkte pro Benutzer",
    allowMultiple: "Mehrere Stimmen pro Vorschlag erlauben",
    anonymousVoting: "Anonyme Abstimmung",
    allowFreeText: "Freitext-Kommentare erlauben",
    encourageNegativeComments: "Abstimmende ermutigen, negative Stimmen zu begründen",
    openAt: "Öffnen um",
    closeAt: "Schliessen um",
    infoUrl: "Info-URL",
    descriptionPlain: "Beschreibung (Klartext)",
    contentRich: "Inhalt (Rich Text)",
    active: "Aktiv",
    allowAudienceProposals: "Publikum erlaubt, Vorschläge hinzuzufügen",
    showResultsBeforeClose: "Resultate vor Schliessen anzeigen",
    allowVoteChangeUntilClose: "Stimmänderung bis Schliessen erlauben",
    multipleChoiceVote: "Mehrfachauswahl-Abstimmung",
    round: "Runde",
    median: "Mehrheitsnennung",
    status: "Status",
    points: "Punkte",
    medianColon: "Median:",
    sortResults: "Resultate sortieren",
    sortByOriginal: "Ursprüngliche Reihenfolge",
    sortByMedian: "Mehrheitsnennung (Median)",
    sortByAverage: "Durchschnitt",
    sortAscending: "Aufsteigend",
    sortDescending: "Absteigend",
  },
  messages: {
    loading: "Laden...",
    loadingVote: "Abstimmung laden...",
    loadingModeration: "Moderationsansicht laden...",
    loadingResults: "Resultate laden...",
    noVotesYet: "Noch keine Stimmen.",
    batchImportProposalsDescription: "Fügen Sie einen Vorschlag pro Zeile ein. Jede Zeile wird ein Vorschlag.",
    noVotesAvailable: "Keine Abstimmungen verfügbar",
    noModerators: "Noch keine Moderatoren hinzugefügt.",
    noRoundsYet: "Noch keine Runden. Öffnen Sie die erste Runde, um die Zustimmungs-Schleife zu starten.",
    noActiveRound: "Keine aktive Runde. Öffnen Sie eine Runde, um mit der Bearbeitung zu beginnen.",
    noMatchingVotes: "Keine passenden Abstimmungen",
    voteNotFound: "Abstimmung nicht gefunden",
    notOpenForResponses: "Diese Abstimmung ist noch nicht für Antworten geöffnet.",
    closedNoMoreResponses: "Diese Abstimmung ist geschlossen. Es werden keine weiteren Antworten akzeptiert.",
    thanksVoted: "Danke, Sie haben abgestimmt! Sie können Ihre Stimme noch ändern, solange die Abstimmung offen ist.",
    thanksVotedNoChange: "Danke, Sie haben abgestimmt! Ihre Stimme ist endgültig und kann nicht geändert werden.",
    finalizingLocks: "Finalisierung sperrt diese Abstimmung. Es werden keine weiteren Antworten oder Bearbeitungen akzeptiert.",
    selectWinningProposal: "Wählen Sie den Gewinnervorschlag und fügen Sie optional eine Signatur hinzu. Diese Aktion ist unwiderruflich.",
    onlyOwnerCanManage: "Nur der Abstimmungsbesitzer kann Moderatoren verwalten.",
    accessDenied: "Zugriff verweigert",
    invalidModLink: "Dieser Moderationslink ist ungültig oder wurde widerrufen.",
    moderatorsCannotFinalize: "Moderatoren können Entscheide nicht finalisieren. Bitten Sie den Besitzer um Finalisierung.",
    onlyOwnerCanFinalize: "Nur der Besitzer kann finalisieren. Bitten Sie den Besitzer um Finalisierung.",
    roundClosedCannotEdit: "Diese Runde ist geschlossen und kann nicht mehr bearbeitet werden.",
    consentLoopFinalized: "Diese Zustimmungs-Schleife ist finalisiert.",
    consentLoopResultsPerRound: "Die Resultate der Zustimmungs-Schleife werden pro Runde im Tab Runden angezeigt.",
    consentLoopProcess: "Diese Abstimmung verwendet einen Zustimmungs-Schleifen-Prozess mit mehreren Verfeinerungsrunden.",
    negativeCommentNudge: "Sie haben eine negative Option gewählt. Zu teilen warum hilft der Gruppe — ein kurzer Kommentar wirkt Wunder.",
    qrCodeUnavailable: "QR-Code nicht verfügbar",
    scanToVote: "Scannen zum Abstimmen",
    poweredBy: "Powered by p3fo Voting",
    needTwoClosedRounds: "Mindestens zwei geschlossene Runden sind nötig, um zu vergleichen.",
    compareRoundsDescription: "Vergleichen Sie den Vorschlagstext zwischen zwei Runden, um Änderungen zu sehen.",
    moderatorDescription: "Moderatoren können Vorschläge bearbeiten, Runden öffnen/schliessen und über Prüfungen abstimmen. Sie können Entscheide nicht finalisieren oder die Abstimmung löschen.",
    consentLoopAdopted: "Angenommen — keine verbleibenden Einwände",
    consentLoopWithdrawn: "Zurückgezogen — der Vorschlagende hat den Vorschlag zurückgezogen",
    consentLoopBlocked: "Blockiert — Einwände konnten nicht integriert werden",
    tieNoDecision: "Gleichstand — kein Ergebnis erreicht",
    consentLoopFinalOutcome: "Ergebnis der Zustimmungs-Schleife",
    consentLoopNoAdoptedRound: "Keine Runde angenommen — Einwände blieben bis zum Schluss bestehen.",
    consentLoopBestRound: "Beste angenommene Runde",
    selectWinningRound: "Wählen Sie die Runde als Endresultat",
    roundAuto: "Auto (beste angenommene Runde)",
    allocatePointsBudget: "Verteilen Sie Punkte über die Vorschläge, dann reichen Sie alle auf einmal ein.",
    attendancePrompt: "Teilen Sie mit, ob Sie an dieser Veranstaltung teilnehmen.",
    resetConfirm: "Diese Abstimmung zurücksetzen? Alle Antworten und Schleifenrunden werden dauerhaft gelöscht.",
    resetWarning: "Dies löscht alle Stimmen und Runden und setzt die Abstimmung auf Entwurf zurück. Dies kann nicht rückgängig gemacht werden.",
  },
  placeholders: {
    title: "Was sollen wir entscheiden?",
    description: "Optionaler Kontext für Abstimmende",
    signature: "Formalen Entscheidungstext oder Notiz hinzufügen...",
    summaryOverride: "Die auto-generierte Zusammenfassung überschreiben...",
    comment: "Teilen Sie Ihre Gedanken...",
    proposal: "Ihr Vorschlag...",
    batchImportProposals: "Vorschlag A\nVorschlag B\nVorschlag C",
    searchVotes: "Abstimmungen suchen...",
    url: "https://...",
    writeProposal: "Schreiben Sie hier Ihren Vorschlag...",
    shortDescription: "Optionale Kurzbeschreibung",
    displayName: "Anzeige-Name",
    email: "E-Mail (optional)",
    refineProposal: "Vorschlagstext für diese Runde verfeinern...",
  },
  pages: {
    consultations: "Konsultationen",
    decisions: "Entscheide",
    newConsultation: "Konsultation",
    newDecision: "Entscheid",
    noConsultationsYet: "Noch keine Konsultationen",
    noDecisionsYet: "Noch keine Entscheide",
    createConsultationDescription: "Erstellen Sie Konsultationen, um Input Ihres Publikums zu sammeln",
    createDecisionDescription: "Erstellen Sie Entscheide mit formalem verbindlichem Ergebnis",
    editVote: "Abstimmung bearbeiten",
    createNewVote: "Abstimmung erstellen",
    finalizing: "Finalisieren...",
    proposalSelected: "Vorschlag als Entscheid ausgewählt.",
    closed: "Geschlossen",
  },
};

type Locale = "en" | "fr" | "de";

/**
 * `getVotingStrings()` runs from render bodies, including once per cell of the
 * scheduling participant matrix (thousands of calls per render), and the
 * persisted locale is read through a synchronous `localStorage` call. Cache the
 * resolved locale and drop the cache whenever the app language changes, so the
 * public vote still follows the LanguageSwitcher without paying a storage read
 * per call.
 */
let cachedLocale: Locale | null = null;
i18next.on("languageChanged", () => {
  cachedLocale = null;
});

function detectLocale(): Locale {
  if (cachedLocale) return cachedLocale;
  // The app shell initializes i18next with the localStorage detector (key:
  // i18nextLng), so the public vote follows the language picked anywhere else.
  // Read it from the instance when it has initialized, and only fall back to
  // the persisted value directly before init (and in tests).
  let lang = i18next.resolvedLanguage ?? i18next.language ?? "";
  if (!lang) {
    try {
      lang = localStorage.getItem("i18nextLng") ?? "";
    } catch {
      // localStorage can be unavailable in private contexts and tests.
    }
  }
  if (!lang) lang = navigator?.language ?? "en";
  const normalized = lang.toLowerCase();
  cachedLocale = normalized.startsWith("fr")
    ? "fr"
    : normalized.startsWith("de")
      ? "de"
      : "en";
  return cachedLocale;
}

const strings: Record<Locale, VotingStrings> = { en, fr, de };

export function getVotingStrings(locale?: Locale): VotingStrings {
  return strings[locale ?? detectLocale()];
}

export function useVotingLocale(): Locale {
  return detectLocale();
}

export type { VotingStrings, Locale };