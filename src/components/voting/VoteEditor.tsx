import * as React from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { Save, X, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  VoteEntity,
  VoteMode,
  VoteKind,
  VoteConfig,
  VoteProposal,
  AttendanceConfig,
  AttendanceQuestion,
  SchedulingConfig,
} from "@/lib/persistence-types";
import { DEFAULT_RANKING_ENGINE, voteAllowsTies } from "@/lib/vote-ranking";
import { DEFAULT_MAX_PARTY_SIZE } from "@/lib/attendance";
import {
  DEFAULT_SCHEDULING_CONFIG,
  MAX_SCHEDULING_SLOTS,
  formatSchedulingDay,
  formatSchedulingRange,
  generateSchedulingSlots,
  getFormatter,
  getSchedulingTimeZones,
  mergeSchedulingDates,
  normalizeSchedulingConfig,
  normalizeSchedulingGranularity,
  prunedSchedulingSlotKeys,
  roundSchedulingDuration,
  schedulingSlotIdentity,
  validateSchedulingConfig,
} from "@/lib/scheduling";
import { getVotingStrings } from "@/lib/voting-i18n";
import { useTranslation } from "react-i18next";
import { KindSelector } from "./KindSelector";
import { ModeSelector } from "./ModeSelector";
import { ProposalEditor, ProposalEditorHandle } from "./ProposalEditor";
import {
  BlockNoteProposalEditor,
  type BlockNoteProposalEditorHandle,
} from "./BlockNoteProposalEditor";
import { isRichTextEmpty } from "@/lib/rich-text";
import { useSettingsContext } from "@/context/SettingsContext";
import { instantToPlainDateTime, plainDateTimeToTimestamp } from "@/lib/format-utils";

interface VoteEditorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  vote?: VoteEntity | null;
  onSave: (input: Partial<VoteEntity>) => Promise<void>;
  /** Render the form directly (Edition tab) instead of inside a modal. */
  inline?: boolean;
}

const DEFAULT_CONFIG: VoteConfig = {
  mode: "THUMBS_UP",
  kind: "consultation",
  phase: "IDLE",
};

const DEFAULT_PROPOSALS: VoteProposal[] = [
  { id: crypto.randomUUID(), content: "", position: 0, active: true },
];

const SCHEDULING_MAX_DATES = 90;
const SCHEDULING_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const MAX_DAY_MINUTES = 24 * 60;

const schedulingDateToLocalDate = (key: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return undefined;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
};

const localDateToSchedulingKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const schedulingWeekdayLabel = (isoWeekday: number): string => {
  // 2024-01-01 is a Monday, so offsetting by isoWeekday - 1 lands on the target.
  const date = Temporal.PlainDate.from("2024-01-01").add({
    days: isoWeekday - 1,
  });
  const formatter = getFormatter(undefined, { weekday: "short" });
  if (!formatter) return String(isoWeekday);
  try {
    return formatter.format(new Date(`${date.toString()}T12:00:00`));
  } catch {
    return String(isoWeekday);
  }
};

// Resolved once: the weekday toggles re-render on every keystroke, and an
// uncached `Intl.DateTimeFormat` here was constructed seven times per render.
const SCHEDULING_WEEKDAY_LABELS: Record<number, string> = Object.fromEntries(
  SCHEDULING_WEEKDAYS.map((day) => [day, schedulingWeekdayLabel(day)]),
);

const isoToDateTimeLocal = (iso: string, timezone: string): string => {
  if (!iso) return "";
  try {
    const pdt = instantToPlainDateTime(Temporal.Instant.from(iso), timezone);
    const date = pdt.toPlainDate().toString();
    const time = pdt.toPlainTime().toString({ smallestUnit: "minute" });
    return `${date}T${time}`;
  } catch {
    return "";
  }
};

const dateTimeLocalToIso = (value: string, timezone: string): string => {
  if (!value) return "";
  try {
    const pdt = Temporal.PlainDateTime.from(value);
    return Temporal.Instant.fromEpochMilliseconds(
      plainDateTimeToTimestamp(pdt, timezone),
    ).toString();
  } catch {
    return "";
  }
};

export const VoteEditor: React.FC<VoteEditorProps> = ({
  open = false,
  onOpenChange,
  vote,
  onSave,
  inline = false,
}) => {
  const isEditing = !!vote;
  const isFinalized = vote?.config.phase === "FINALIZED";
  const hasStarted = isEditing && vote?.config.phase !== "IDLE";
  const t = getVotingStrings();
  const { t: tt } = useTranslation();
  const proposalEditorRef = React.useRef<ProposalEditorHandle>(null);
  const descriptionEditorRef =
    React.useRef<BlockNoteProposalEditorHandle>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState<VoteKind>("consultation");
  const [mode, setMode] = React.useState<VoteMode>("THUMBS_UP");
  const [proposals, setProposals] = React.useState<VoteProposal[]>(DEFAULT_PROPOSALS);
  const [isAnonymous, setIsAnonymous] = React.useState(true);
  const [allowFreeText, setAllowFreeText] = React.useState(false);
  const [requireObjectionComment, setRequireObjectionComment] = React.useState(false);
  const [allowAudienceProposals, setAllowAudienceProposals] = React.useState(false);
  const [showResultsBeforeClose, setShowResultsBeforeClose] = React.useState(false);
  const [allowVoteChangeUntilClose, setAllowVoteChangeUntilClose] = React.useState(true);
  const [multipleChoiceVote, setMultipleChoiceVote] = React.useState(true);
  const [maxPointsPerUser, setMaxPointsPerUser] = React.useState(10);
  const [rankingEngine, setRankingEngine] = React.useState<"bt-k2" | "bt-k4">(DEFAULT_RANKING_ENGINE);
  const [allowTies, setAllowTies] = React.useState(true);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [openAt, setOpenAt] = React.useState<number | null>(null);
  const [closeAt, setCloseAt] = React.useState<number | null>(null);
  const [eventStartAt, setEventStartAt] = React.useState("");
  const [eventEndAt, setEventEndAt] = React.useState("");
  const [attendanceLocation, setAttendanceLocation] = React.useState("");
  const [coverImageUrl, setCoverImageUrl] = React.useState("");
  const [attendanceInfoUrl, setAttendanceInfoUrl] = React.useState("");
  const [welcomeModal, setWelcomeModal] = React.useState(true);
  const [askEmail, setAskEmail] = React.useState(false);
  const [allowPartySize, setAllowPartySize] = React.useState(false);
  const [maxPartySize, setMaxPartySize] = React.useState(DEFAULT_MAX_PARTY_SIZE);
  const [allowHiddenAttendance, setAllowHiddenAttendance] = React.useState(false);
  const [maxAttendees, setMaxAttendees] = React.useState(0);
  const [customQuestions, setCustomQuestions] = React.useState<AttendanceQuestion[]>([]);
  const [schedulingUnit, setSchedulingUnit] = React.useState<"time" | "day">(
    DEFAULT_SCHEDULING_CONFIG.unit === "day" ? "day" : "time",
  );
  const [schedulingTimeZone, setSchedulingTimeZone] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.timeZone,
  );
  const [schedulingGranularity, setSchedulingGranularity] = React.useState<15 | 30 | 60>(
    normalizeSchedulingGranularity(DEFAULT_SCHEDULING_CONFIG.granularityMinutes),
  );
  const [schedulingDuration, setSchedulingDuration] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.durationMinutes,
  );
  // Controlled text mirror of the duration field. The numeric state is the
  // committed value; keeping the raw text lets a moderator type a multi-digit
  // duration (e.g. 90) instead of every keystroke being rounded up to the
  // granularity before the next digit can be entered.
  const [schedulingDurationInput, setSchedulingDurationInput] = React.useState(
    String(DEFAULT_SCHEDULING_CONFIG.durationMinutes),
  );
  const [schedulingDates, setSchedulingDates] = React.useState<string[]>([]);
  const [schedulingDayStart, setSchedulingDayStart] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.dayStart,
  );
  const [schedulingDayEnd, setSchedulingDayEnd] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.dayEnd,
  );
  const [schedulingAllowIfNeeded, setSchedulingAllowIfNeeded] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.allowIfNeeded ?? false,
  );
  const [schedulingMaxSlots, setSchedulingMaxSlots] = React.useState(
    DEFAULT_SCHEDULING_CONFIG.maxSlots ?? 500,
  );
  const [schedulingError, setSchedulingError] = React.useState<string | null>(null);
  const [schedulingDirty, setSchedulingDirty] = React.useState(false);
  // Slots the moderator explicitly removed from the generated grid. They must be
  // re-applied whenever a later config edit triggers regeneration, otherwise an
  // unrelated change (allowIfNeeded, maxSlots) silently restores them. Keys are
  // local date + wall-clock identities (see `schedulingSlotIdentity`), not slot
  // ids, because changing the time zone changes every slot's instant id.
  const [removedSchedulingSlotKeys, setRemovedSchedulingSlotKeys] = React.useState<
    string[]
  >([]);
  const [schedulingRangeStart, setSchedulingRangeStart] = React.useState("");
  const [schedulingRangeEnd, setSchedulingRangeEnd] = React.useState("");
  const [schedulingRangeWeekdays, setSchedulingRangeWeekdays] = React.useState<number[]>([
    1, 2, 3, 4, 5, 6, 7,
  ]);
  const [schedulingSingleDate, setSchedulingSingleDate] = React.useState("");
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const [timePickerConfig, setTimePickerConfig] = React.useState<{
    type: "openAt" | "closeAt";
    initialTime: number;
  } | null>(null);
  const { settings } = useSettingsContext();
  const timezone = settings.timezone || "Europe/Zurich";
  const weekStartsOn = settings.weekStartDay as 0 | 1;

  const loadVote = React.useCallback((source: VoteEntity | null) => {
    // One scheduling initializer for both the populated and the blank form so
    // the two branches cannot drift when a scheduling field is added.
    const applySchedulingConfig = (
      scheduling: SchedulingConfig | undefined,
      storedSlotProposals: VoteProposal[] = [],
    ) => {
      setSchedulingUnit(scheduling?.unit === "day" ? "day" : "time");
      setSchedulingTimeZone(scheduling?.timeZone ?? timezone);
      setSchedulingGranularity(
        normalizeSchedulingGranularity(scheduling?.granularityMinutes),
      );
      const durationMinutes =
        scheduling?.durationMinutes ??
        DEFAULT_SCHEDULING_CONFIG.durationMinutes;
      setSchedulingDuration(durationMinutes);
      setSchedulingDurationInput(String(durationMinutes));
      setSchedulingDates(scheduling?.dates ? [...scheduling.dates] : []);
      setSchedulingDayStart(
        scheduling?.dayStart ?? DEFAULT_SCHEDULING_CONFIG.dayStart,
      );
      setSchedulingDayEnd(scheduling?.dayEnd ?? DEFAULT_SCHEDULING_CONFIG.dayEnd);
      setSchedulingAllowIfNeeded(scheduling?.allowIfNeeded ?? false);
      setSchedulingMaxSlots(
        scheduling?.maxSlots ?? DEFAULT_SCHEDULING_CONFIG.maxSlots ?? 500,
      );
      setSchedulingError(null);
      setSchedulingDirty(false);
      // Explicit slot removals live only in this session's state, so reopening
      // the editor would forget them and the next dirty save would regenerate
      // the full grid, silently restoring pruned slots (including pruned days
      // in day mode). Rebuild the removal set from the saved config/proposals.
      setRemovedSchedulingSlotKeys(
        prunedSchedulingSlotKeys(scheduling, storedSlotProposals),
      );
    };

    if (source) {
      setTitle(source.title);
      setDescription(source.description || "");
      setKind(source.config.kind);
      setMode(source.config.mode);
      setProposals(
        source.config.mode === "ATTENDANCE"
          ? []
          : source.config.mode === "SCHEDULING"
            ? source.proposals.filter((proposal) => proposal.timeSlot)
            : source.proposals.length > 0
              ? source.proposals
              : DEFAULT_PROPOSALS,
      );
      setIsAnonymous(source.config.isAnonymous ?? true);
      setAllowFreeText(source.config.allowFreeText ?? false);
      setRequireObjectionComment(source.config.requireObjectionComment ?? false);
      setAllowAudienceProposals(source.config.allowAudienceProposals ?? false);
      setShowResultsBeforeClose(source.config.showResultsBeforeClose ?? false);
      setAllowVoteChangeUntilClose(source.config.allowVoteChangeUntilClose ?? true);
      setMultipleChoiceVote(source.config.multipleChoiceVote ?? true);
      setMaxPointsPerUser(source.config.maxPointsPerUser ?? 10);
      setRankingEngine(source.config.rankingEngine ?? DEFAULT_RANKING_ENGINE);
      setAllowTies(voteAllowsTies(source.config));
      setAllowMultiple(source.config.allowMultiple ?? false);
      setOpenAt(source.config.openAt ? new Date(source.config.openAt).getTime() : null);
      setCloseAt(source.config.closeAt ? new Date(source.config.closeAt).getTime() : null);

      const attendance = source.config.attendance;
      setEventStartAt(attendance?.eventStartAt ?? "");
      setEventEndAt(attendance?.eventEndAt ?? "");
      setAttendanceLocation(attendance?.location ?? "");
      setCoverImageUrl(attendance?.coverImageUrl ?? "");
      setAttendanceInfoUrl(attendance?.infoUrl ?? "");
      setWelcomeModal(attendance?.welcomeModal ?? true);
      setAskEmail(attendance?.askEmail ?? false);
      setAllowPartySize(attendance?.allowPartySize ?? false);
      setMaxPartySize(attendance?.maxPartySize ?? DEFAULT_MAX_PARTY_SIZE);
      setAllowHiddenAttendance(attendance?.allowHiddenAttendance ?? false);
      setMaxAttendees(attendance?.maxAttendees ?? 0);
      setCustomQuestions(
        attendance?.customQuestions
          ? attendance.customQuestions.map((question) => ({
              ...question,
              options: question.options ? [...question.options] : undefined,
            }))
          : [],
      );

      const scheduling = source.config.scheduling;
      applySchedulingConfig(
        scheduling,
        source.config.mode === "SCHEDULING"
          ? source.proposals.filter((proposal) => proposal.timeSlot)
          : [],
      );
    } else {
      setTitle("");
      setDescription("");
      setKind("consultation");
      setMode("THUMBS_UP");
      setProposals([{ id: crypto.randomUUID(), content: "", position: 0, active: true }]);
      setIsAnonymous(true);
      setAllowFreeText(false);
      setRequireObjectionComment(false);
      setAllowAudienceProposals(false);
      setShowResultsBeforeClose(false);
      setAllowVoteChangeUntilClose(true);
      setMultipleChoiceVote(true);
      setMaxPointsPerUser(10);
      setRankingEngine(DEFAULT_RANKING_ENGINE);
      setAllowTies(true);
      setAllowMultiple(false);
      setOpenAt(null);
      setCloseAt(null);
      setEventStartAt("");
      setEventEndAt("");
      setAttendanceLocation("");
      setCoverImageUrl("");
      setAttendanceInfoUrl("");
      setWelcomeModal(true);
      setAskEmail(false);
      setAllowPartySize(false);
      setMaxPartySize(DEFAULT_MAX_PARTY_SIZE);
      setAllowHiddenAttendance(false);
      setMaxAttendees(0);
      setCustomQuestions([]);
      applySchedulingConfig(undefined);
    }
    setSchedulingRangeStart("");
    setSchedulingRangeEnd("");
    setSchedulingRangeWeekdays([1, 2, 3, 4, 5, 6, 7]);
    setSchedulingSingleDate("");
  }, [timezone]);

  const initializedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (inline) {
      // Mounted inside a tab: load once per vote id and do not clobber the
      // draft while the parent's 5s vote poll recreates the object.
      const key = vote?.id ?? "new";
      if (initializedRef.current === key) return;
      initializedRef.current = key;
      loadVote(vote ?? null);
      return;
    }
    if (!open) {
      initializedRef.current = null;
      return;
    }
    // Load only on the open transition or when the edited vote changes.
    // `loadVote` now depends on the settings timezone, which resolves
    // asynchronously after mount and can also change through settings sync;
    // without this guard a late timezone value re-runs the effect and wipes an
    // in-progress modal form (the inline branch already uses the same key).
    const key = vote?.id ?? "new";
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    loadVote(vote ?? null);
  }, [inline, open, vote, loadVote]);

  const handleCancel = () => {
    if (inline) {
      loadVote(vote ?? null);
      return;
    }
    onOpenChange?.(false);
  };

  const handleModeChange = (nextMode: VoteMode) => {
    if (nextMode === mode) return;
    // A scheduling draft's `proposals` are generated time slots, not content.
    // Leaving them in state when the mode changes would render one editor per
    // slot and persist every empty slot as a blank content proposal on save.
    // Entering SCHEDULING is safe: the save path regenerates the slot grid from
    // the config, so content proposals are replaced there.
    if (mode === "SCHEDULING") {
      setProposals([{ id: crypto.randomUUID(), content: "", position: 0, active: true }]);
    }
    setMode(nextMode);
  };

  const showObjectionComment =
    mode === "THUMBS_UD_NEUTRAL" || mode === "MAJORITY_JUDGMENT" || mode === "CONSENT_LOOP";

  const addQuestion = () => {
    setCustomQuestions((previous) => [
      ...previous,
      { id: crypto.randomUUID(), prompt: "", type: "text", required: false },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<AttendanceQuestion>) => {
    setCustomQuestions((previous) =>
      previous.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  };

  const removeQuestion = (id: string) => {
    setCustomQuestions((previous) => previous.filter((question) => question.id !== id));
  };

  const schedulingLocked = hasStarted || isFinalized;

  const schedulingSlotProposals = React.useMemo(
    () => proposals.filter((proposal) => proposal.timeSlot),
    [proposals],
  );

  const schedulingTimeZoneOptions = React.useMemo(() => {
    const zones = getSchedulingTimeZones();
    if (schedulingTimeZone && !zones.includes(schedulingTimeZone)) {
      return [schedulingTimeZone, ...zones];
    }
    return zones;
  }, [schedulingTimeZone]);

  const buildSchedulingConfig = (): SchedulingConfig => ({
    unit: schedulingUnit,
    timeZone: schedulingTimeZone,
    granularityMinutes: schedulingGranularity,
    durationMinutes: schedulingDuration,
    dates: [...schedulingDates].sort(),
    dayStart: schedulingDayStart,
    dayEnd: schedulingDayEnd,
    allowIfNeeded: schedulingAllowIfNeeded,
    maxSlots: schedulingMaxSlots,
  });

  const markSchedulingDirty = () => {
    setSchedulingDirty(true);
    setSchedulingError(null);
  };

  const handleApplySchedulingRange = () => {
    if (!schedulingRangeStart || !schedulingRangeEnd) return;
    let start: Temporal.PlainDate;
    let end: Temporal.PlainDate;
    try {
      start = Temporal.PlainDate.from(schedulingRangeStart);
      end = Temporal.PlainDate.from(schedulingRangeEnd);
    } catch {
      return;
    }
    if (Temporal.PlainDate.compare(start, end) > 0) return;

    const weekdays = new Set(
      schedulingRangeWeekdays.length > 0
        ? schedulingRangeWeekdays
        : SCHEDULING_WEEKDAYS,
    );
    const generated: string[] = [];
    let cursor = start;
    let guard = 0;
    while (
      Temporal.PlainDate.compare(cursor, end) <= 0 &&
      guard < SCHEDULING_MAX_DATES * 31
    ) {
      if (weekdays.has(cursor.dayOfWeek)) generated.push(cursor.toString());
      cursor = cursor.add({ days: 1 });
      guard += 1;
    }

    setSchedulingDates((previous) => mergeSchedulingDates(previous, generated, SCHEDULING_MAX_DATES));
    markSchedulingDirty();
  };

  const handleToggleSchedulingWeekday = (day: number) => {
    setSchedulingRangeWeekdays((previous) =>
      previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day].sort((a, b) => a - b),
    );
  };

  const handleAddSchedulingDate = () => {
    if (!schedulingSingleDate) return;
    try {
      Temporal.PlainDate.from(schedulingSingleDate);
    } catch {
      return;
    }
    setSchedulingDates((previous) =>
      mergeSchedulingDates(previous, [schedulingSingleDate], SCHEDULING_MAX_DATES),
    );
    setSchedulingSingleDate("");
    markSchedulingDirty();
  };

  const handleRemoveSchedulingDate = (date: string) => {
    setSchedulingDates((previous) => previous.filter((value) => value !== date));
    markSchedulingDirty();
  };

  const handleGenerateSchedulingSlots = () => {
    const { proposals: generated, error } = generateSchedulingSlots(
      normalizeSchedulingConfig(buildSchedulingConfig()),
    );
    if (error) {
      setSchedulingError(error);
      return;
    }
    // An explicit regenerate rebuilds the full grid, so earlier removals no
    // longer apply.
    setRemovedSchedulingSlotKeys([]);
    setProposals(generated);
    setSchedulingError(null);
    setSchedulingDirty(false);
  };

  const handleRemoveSchedulingSlot = (proposal: VoteProposal) => {
    // Record the slot's local identity in the zone the grid was generated for,
    // so a later time-zone change (which rewrites every slot id) still matches.
    const key = schedulingSlotIdentity(
      proposal,
      schedulingUnit,
      schedulingTimeZone,
    );
    setRemovedSchedulingSlotKeys((previous) =>
      previous.includes(key) ? previous : [...previous, key],
    );
    setProposals((previous) => previous.filter((candidate) => candidate.id !== proposal.id));
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    // Flush any pending BlockNote editor content into the proposals state
    // before reading it for the save payload.
    const flushedProposals = proposalEditorRef.current?.flush() ?? proposals;
    const flushedDescription =
      descriptionEditorRef.current?.flush() ?? description;

    let schedulingConfig: SchedulingConfig | undefined;
    let schedulingProposals: VoteProposal[] = [];
    if (mode === "SCHEDULING") {
      const normalized = normalizeSchedulingConfig(buildSchedulingConfig());
      const hasAllSlots =
        proposals.length > 0 && proposals.every((proposal) => Boolean(proposal.timeSlot));
      let slotProposals = proposals.filter((proposal) => proposal.timeSlot);

      if (schedulingDirty || !hasAllSlots) {
        const generated = generateSchedulingSlots(normalized);
        if (generated.error) {
          setSchedulingError(generated.error);
          return;
        }
        // Re-apply explicit removals after regeneration so changing an unrelated
        // scheduling setting cannot silently bring a pruned slot back. The keys
        // are local identities, so a time-zone change (which rewrites every slot
        // id) still prunes the same wall-clock slots.
        const removedKeys = new Set(removedSchedulingSlotKeys);
        slotProposals = generated.proposals
          .filter(
            (proposal) =>
              !removedKeys.has(
                schedulingSlotIdentity(
                  proposal,
                  normalized.unit === "day" ? "day" : "time",
                  normalized.timeZone ?? DEFAULT_SCHEDULING_CONFIG.timeZone ?? "UTC",
                ),
              ),
          )
          .map((proposal, index) => ({ ...proposal, position: index }));
        // Write the regenerated grid back into form state. The inline editor is
        // not remounted after saving, so without this the preview (and the next
        // save) would keep sending the pre-regeneration slot set.
        setProposals(slotProposals);
      }

      const validationError = validateSchedulingConfig(normalized, slotProposals);
      if (validationError) {
        setSchedulingError(validationError);
        return;
      }

      schedulingConfig = normalized;
      schedulingProposals = slotProposals
        .filter((proposal) => proposal.active)
        .map((proposal, index) => ({ ...proposal, position: index }));
    }

    setIsSaving(true);
    try {
      const cleanedQuestions: AttendanceQuestion[] = customQuestions
        .map((question) => {
          const prompt = question.prompt.trim();
          const options = (question.options ?? [])
            .map((option) => option.trim())
            .filter((option) => option.length > 0);
          // A "choice" question with no options is unanswerable, and a required
          // one would block every RSVP. Persist it as free text instead so the
          // prompt is still asked and remains satisfiable.
          const type: AttendanceQuestion["type"] =
            question.type === "choice" && options.length === 0 ? "text" : question.type;
          return {
            id: question.id,
            prompt,
            type,
            ...(type === "choice" ? { options } : {}),
            ...(question.required ? { required: true } : {}),
          };
        })
        .filter((question) => question.prompt.length > 0);

      const attendanceConfig: AttendanceConfig | undefined =
        mode === "ATTENDANCE"
          ? {
              eventStartAt: eventStartAt || undefined,
              eventEndAt: eventEndAt || undefined,
              location: attendanceLocation.trim() || undefined,
              coverImageUrl: coverImageUrl.trim() || undefined,
              infoUrl: attendanceInfoUrl.trim() || undefined,
              welcomeModal,
              askEmail,
              allowPartySize,
              maxPartySize,
              allowHiddenAttendance,
              maxAttendees,
              customQuestions: cleanedQuestions.length > 0 ? cleanedQuestions : undefined,
            }
          : undefined;

      const config: VoteConfig = {
        mode,
        kind,
        phase: vote?.config.phase || "IDLE",
        isAnonymous,
        allowFreeText:
          mode !== "COMPARATIVE_PRIORITIZATION" && mode !== "SCHEDULING"
            ? allowFreeText
            : undefined,
        requireObjectionComment: showObjectionComment ? requireObjectionComment : undefined,
        allowAudienceProposals:
          kind === "consultation" && mode !== "ATTENDANCE" && mode !== "SCHEDULING"
            ? allowAudienceProposals
            : undefined,
        showResultsBeforeClose,
        allowVoteChangeUntilClose,
        multipleChoiceVote:
          mode !== "POINTS" &&
          mode !== "CONSENT_LOOP" &&
          mode !== "COMPARATIVE_PRIORITIZATION" &&
          mode !== "ATTENDANCE" &&
          mode !== "SCHEDULING"
            ? multipleChoiceVote
            : undefined,
        maxPointsPerUser: mode === "POINTS" ? maxPointsPerUser : undefined,
        rankingEngine: mode === "COMPARATIVE_PRIORITIZATION" ? rankingEngine : undefined,
        allowTies: mode === "COMPARATIVE_PRIORITIZATION" ? allowTies : undefined,
        allowMultiple: mode === "POINTS" ? allowMultiple : undefined,
        openAt: openAt ? new Date(openAt).toISOString() : undefined,
        closeAt: closeAt ? new Date(closeAt).toISOString() : undefined,
        attendance: attendanceConfig,
        scheduling: schedulingConfig,
      };

      await onSave({
        id: vote?.id,
        title: title.trim(),
        description: isRichTextEmpty(flushedDescription)
          ? undefined
          : flushedDescription.trim(),
        ownerId: vote?.ownerId || "me",
        proposals:
          mode === "ATTENDANCE"
            ? []
            : mode === "SCHEDULING"
              ? schedulingProposals
              : flushedProposals.filter((p) => p.active),
        config,
      });

      if (mode === "SCHEDULING") {
        setSchedulingError(null);
        setSchedulingDirty(false);
      }

      if (!inline) onOpenChange?.(false);
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <>
        {inline ? (
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? t.pages.editVote : t.pages.createNewVote}
            </h2>
            <p className="text-sm text-gray-500">
              {isEditing
                ? isFinalized
                  ? t.pages.closed
                  : t.buttons.saveChanges
                : t.buttons.createVote}
            </p>
          </div>
        ) : (
          <DialogHeader>
            <DialogTitle>{isEditing ? t.pages.editVote : t.pages.createNewVote}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? isFinalized
                  ? t.pages.closed
                  : t.buttons.saveChanges
                : t.buttons.createVote}
            </DialogDescription>
          </DialogHeader>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="vote-title">{t.labels.title}</Label>
            <Input
              id="vote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.placeholders.title}
              disabled={isFinalized}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.labels.description}</Label>
            <BlockNoteProposalEditor
              ref={descriptionEditorRef}
              value={description}
              onChange={setDescription}
              placeholder={t.placeholders.description}
              readOnly={isFinalized}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t.labels.kind}</Label>
            <KindSelector
              value={kind}
              onChange={setKind}
              disabled={hasStarted || isFinalized}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.labels.mode}</Label>
            <ModeSelector
              value={mode}
              onChange={handleModeChange}
              disabled={hasStarted || isFinalized}
            />
          </div>

          {mode === "POINTS" && (
            <div className="space-y-3 border rounded-md p-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.allowMultiple}</Label>
                <Switch
                  checked={allowMultiple}
                  onCheckedChange={setAllowMultiple}
                  disabled={isFinalized}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.maxPointsPerUser}</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxPointsPerUser}
                  onChange={(e) => setMaxPointsPerUser(parseInt(e.target.value, 10) || 10)}
                  disabled={isFinalized}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {mode === "CONSENT_LOOP" && (
            <div className="border rounded-md p-3 bg-gray-50">
              <p className="text-xs text-gray-500">
                {t.messages.consentLoopProcess}
              </p>
            </div>
          )}

          {mode === "COMPARATIVE_PRIORITIZATION" && (
            <div className="space-y-3 border rounded-md p-3 bg-gray-50">
              <div className="space-y-1">
                <Label className="text-sm">{tt("voting.comparative.engine")}</Label>
                <select
                  value={rankingEngine}
                  onChange={(event) => setRankingEngine(event.target.value as "bt-k2" | "bt-k4")}
                  disabled={hasStarted || isFinalized}
                  className="text-sm border rounded px-2 py-1 bg-white"
                >
                  <option value="bt-k4">BT K=4</option>
                  <option value="bt-k2">BT K=2</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">{tt("voting.comparative.allowTies")}</Label>
                <Switch
                  checked={allowTies}
                  onCheckedChange={setAllowTies}
                  disabled={hasStarted || isFinalized}
                />
              </div>
              <p className="text-xs text-gray-500">
                {tt("voting.comparative.configHelp")}
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-medium">{t.labels.settings}</Label>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.anonymousVoting}</Label>
              <Switch
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                disabled={isFinalized}
              />
            </div>

            {mode !== "COMPARATIVE_PRIORITIZATION" && mode !== "SCHEDULING" && (
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.allowFreeText}</Label>
                <Switch
                  checked={allowFreeText}
                  onCheckedChange={setAllowFreeText}
                  disabled={isFinalized}
                />
              </div>
            )}

            {showObjectionComment && (
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.encourageNegativeComments}</Label>
                <Switch
                  checked={requireObjectionComment}
                  onCheckedChange={setRequireObjectionComment}
                  disabled={isFinalized}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.showResultsBeforeClose}</Label>
              <Switch
                checked={showResultsBeforeClose}
                onCheckedChange={setShowResultsBeforeClose}
                disabled={isFinalized}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.labels.allowVoteChangeUntilClose}</Label>
              <Switch
                checked={allowVoteChangeUntilClose}
                onCheckedChange={setAllowVoteChangeUntilClose}
                disabled={isFinalized}
              />
            </div>

            {mode !== "POINTS" && mode !== "CONSENT_LOOP" && mode !== "COMPARATIVE_PRIORITIZATION" && mode !== "ATTENDANCE" && mode !== "SCHEDULING" && (
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t.labels.multipleChoiceVote}</Label>
                <Switch
                  checked={multipleChoiceVote}
                  onCheckedChange={setMultipleChoiceVote}
                  disabled={isFinalized}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.openAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !openAt && "text-muted-foreground"
                      )}
                      disabled={isFinalized}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {openAt ? format(new Date(openAt), "PPP p") : <span>{tt("task.pickDate")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={openAt ? new Date(openAt) : undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        const currentPdt = openAt
                          ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(openAt), timezone)
                          : instantToPlainDateTime(Temporal.Now.instant(), timezone);
                        const newPdt = Temporal.PlainDateTime.from({
                          year: date.getFullYear(),
                          month: date.getMonth() + 1,
                          day: date.getDate(),
                          hour: currentPdt.hour,
                          minute: currentPdt.minute,
                          second: currentPdt.second,
                        });
                        setOpenAt(plainDateTimeToTimestamp(newPdt, timezone));
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setTimePickerConfig({ type: "openAt", initialTime: openAt || Date.now() });
                          setTimePickerOpen(true);
                        }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {openAt ? format(new Date(openAt), "HH:mm") : <span className="text-muted-foreground">{tt("task.setTime")}</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {openAt && !isFinalized && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOpenAt(null)}>
                    {tt("voting.clear")}
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t.labels.closeAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !closeAt && "text-muted-foreground"
                      )}
                      disabled={isFinalized}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {closeAt ? format(new Date(closeAt), "PPP p") : <span>{tt("task.pickDate")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={closeAt ? new Date(closeAt) : undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        const currentPdt = closeAt
                          ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(closeAt), timezone)
                          : openAt
                            ? instantToPlainDateTime(Temporal.Instant.fromEpochMilliseconds(openAt), timezone)
                            : instantToPlainDateTime(Temporal.Now.instant(), timezone);
                        const newPdt = Temporal.PlainDateTime.from({
                          year: date.getFullYear(),
                          month: date.getMonth() + 1,
                          day: date.getDate(),
                          hour: currentPdt.hour,
                          minute: currentPdt.minute,
                          second: currentPdt.second,
                        });
                        setCloseAt(plainDateTimeToTimestamp(newPdt, timezone));
                      }}
                      initialFocus
                      weekStartsOn={weekStartsOn}
                    />
                    <div className="p-3 border-t border-border">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setTimePickerConfig({ type: "closeAt", initialTime: closeAt || openAt || Date.now() });
                          setTimePickerOpen(true);
                        }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {closeAt ? format(new Date(closeAt), "HH:mm") : <span className="text-muted-foreground">{tt("task.setTime")}</span>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {closeAt && !isFinalized && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCloseAt(null)}>
                    {tt("voting.clear")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {mode === "ATTENDANCE" ? (
            <div className="space-y-4">
              <div className="border rounded-md p-3 bg-gray-50">
                <p className="text-sm text-gray-600">
                  {t.modeDescriptions.ATTENDANCE}
                </p>
              </div>

              <div className="space-y-4 border rounded-md p-3">
                <Label className="text-base font-medium">{t.attendanceEditor.sectionTitle}</Label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm" htmlFor="attendance-event-start">
                      {t.attendanceEditor.eventStartAt}
                    </Label>
                    <Input
                      id="attendance-event-start"
                      type="datetime-local"
                      value={isoToDateTimeLocal(eventStartAt, timezone)}
                      onChange={(e) =>
                        setEventStartAt(dateTimeLocalToIso(e.target.value, timezone))
                      }
                      disabled={isFinalized}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm" htmlFor="attendance-event-end">
                      {t.attendanceEditor.eventEndAt}
                    </Label>
                    <Input
                      id="attendance-event-end"
                      type="datetime-local"
                      value={isoToDateTimeLocal(eventEndAt, timezone)}
                      onChange={(e) =>
                        setEventEndAt(dateTimeLocalToIso(e.target.value, timezone))
                      }
                      disabled={isFinalized}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="attendance-location">
                    {t.attendanceEditor.location}
                  </Label>
                  <Input
                    id="attendance-location"
                    value={attendanceLocation}
                    onChange={(e) => setAttendanceLocation(e.target.value)}
                    placeholder={t.attendanceEditor.locationPlaceholder}
                    disabled={isFinalized}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="attendance-cover-image">
                    {t.attendanceEditor.coverImageUrl}
                  </Label>
                  <Input
                    id="attendance-cover-image"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder={t.attendanceEditor.coverImageUrlPlaceholder}
                    disabled={isFinalized}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="attendance-info-url">
                    {t.attendanceEditor.infoUrl}
                  </Label>
                  <Input
                    id="attendance-info-url"
                    value={attendanceInfoUrl}
                    onChange={(e) => setAttendanceInfoUrl(e.target.value)}
                    placeholder={t.attendanceEditor.infoUrlPlaceholder}
                    disabled={isFinalized}
                  />
                </div>

                {!isAnonymous && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t.attendanceEditor.welcomeModal}</Label>
                      <Switch
                        checked={welcomeModal}
                        onCheckedChange={setWelcomeModal}
                        disabled={isFinalized}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{t.attendanceEditor.welcomeModalHelp}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t.attendanceEditor.askEmail}</Label>
                  <Switch
                    checked={askEmail}
                    onCheckedChange={setAskEmail}
                    disabled={isFinalized}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t.attendanceEditor.allowPartySize}</Label>
                    <Switch
                      checked={allowPartySize}
                      onCheckedChange={setAllowPartySize}
                      disabled={isFinalized}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="attendance-max-party-size">
                      {t.attendanceEditor.maxPartySize}
                    </Label>
                    <Input
                      id="attendance-max-party-size"
                      type="number"
                      min={1}
                      max={100}
                      value={maxPartySize}
                      onChange={(e) =>
                        setMaxPartySize(
                          Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 100),
                        )
                      }
                      disabled={isFinalized || !allowPartySize}
                      className="w-24"
                    />
                    <p className="text-xs text-gray-500">{t.attendanceEditor.maxPartySizeHelp}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t.attendanceEditor.allowHiddenAttendance}</Label>
                  <Switch
                    checked={allowHiddenAttendance}
                    onCheckedChange={setAllowHiddenAttendance}
                    disabled={isFinalized}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="attendance-max-attendees">
                    {t.attendanceEditor.maxAttendees}
                  </Label>
                  <Input
                    id="attendance-max-attendees"
                    type="number"
                    min={0}
                    value={maxAttendees}
                    onChange={(e) =>
                      setMaxAttendees(Math.max(parseInt(e.target.value, 10) || 0, 0))
                    }
                    placeholder={t.attendanceEditor.unlimited}
                    disabled={isFinalized}
                    className="w-24"
                  />
                  <p className="text-xs text-gray-500">{t.attendanceEditor.maxAttendeesHelp}</p>
                </div>

                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">{t.attendanceEditor.customQuestions}</Label>
                      <p className="text-xs text-gray-500">
                        {t.attendanceEditor.customQuestionsHelp}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addQuestion}
                      disabled={isFinalized}
                    >
                      {t.attendanceEditor.addQuestion}
                    </Button>
                  </div>

                  {customQuestions.length === 0 ? (
                    <p className="text-xs text-gray-500">{t.attendanceEditor.noQuestions}</p>
                  ) : (
                    customQuestions.map((question, index) => (
                      <div
                        key={question.id}
                        className="space-y-2 rounded-md border p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">
                            {t.attendanceEditor.question} {index + 1}
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => removeQuestion(question.id)}
                            disabled={isFinalized}
                          >
                            {t.attendanceEditor.removeQuestion}
                          </Button>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t.attendanceEditor.prompt}</Label>
                          <Input
                            value={question.prompt}
                            onChange={(e) =>
                              updateQuestion(question.id, { prompt: e.target.value })
                            }
                            placeholder={t.attendanceEditor.promptPlaceholder}
                            disabled={isFinalized}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t.attendanceEditor.type}</Label>
                          <select
                            value={question.type}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                type: e.target.value as AttendanceQuestion["type"],
                              })
                            }
                            disabled={isFinalized}
                            className="text-sm border rounded px-2 py-1 bg-white"
                          >
                            <option value="text">{t.attendanceEditor.typeText}</option>
                            <option value="choice">{t.attendanceEditor.typeChoice}</option>
                          </select>
                        </div>

                        {question.type === "choice" && (
                          <div className="space-y-1">
                            <Label className="text-xs">{t.attendanceEditor.options}</Label>
                            <Textarea
                              value={(question.options ?? []).join("\n")}
                              onChange={(e) =>
                                updateQuestion(question.id, {
                                  options: e.target.value.split("\n"),
                                })
                              }
                              rows={3}
                              placeholder={t.attendanceEditor.optionsPlaceholder}
                              disabled={isFinalized}
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{t.attendanceEditor.required}</Label>
                          <Switch
                            checked={question.required ?? false}
                            onCheckedChange={(checked) =>
                              updateQuestion(question.id, { required: checked })
                            }
                            disabled={isFinalized}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : mode === "SCHEDULING" ? (
            <div className="space-y-4">
              <div className="border rounded-md p-3 bg-gray-50">
                <p className="text-sm text-gray-600">{t.modeDescriptions.SCHEDULING}</p>
              </div>

              <div className="space-y-4 border rounded-md p-3">
                <Label className="text-base font-medium">
                  {t.schedulingEditor.sectionTitle}
                </Label>

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="scheduling-timezone">
                    {t.schedulingEditor.timezone}
                  </Label>
                  <select
                    id="scheduling-timezone"
                    value={schedulingTimeZone}
                    onChange={(e) => {
                      setSchedulingTimeZone(e.target.value);
                      markSchedulingDirty();
                    }}
                    disabled={schedulingLocked}
                    className="text-sm border rounded px-2 py-1 bg-white w-full"
                  >
                    {schedulingTimeZoneOptions.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">{t.schedulingEditor.timezoneHelp}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm">{t.schedulingEditor.askFor}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={schedulingUnit === "time" ? "default" : "outline"}
                      onClick={() => {
                        setSchedulingUnit("time");
                        markSchedulingDirty();
                      }}
                      disabled={schedulingLocked}
                    >
                      {t.schedulingEditor.unitTime}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={schedulingUnit === "day" ? "default" : "outline"}
                      onClick={() => {
                        setSchedulingUnit("day");
                        markSchedulingDirty();
                      }}
                      disabled={schedulingLocked}
                    >
                      {t.schedulingEditor.unitDay}
                    </Button>
                  </div>
                  {schedulingUnit === "day" && (
                    <p className="text-xs text-gray-500">
                      {t.schedulingEditor.dayModeHelp}
                    </p>
                  )}
                </div>

                {schedulingUnit === "time" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm" htmlFor="scheduling-day-start">
                        {t.schedulingEditor.dailyStart}
                      </Label>
                      <Input
                        id="scheduling-day-start"
                        type="time"
                        value={schedulingDayStart}
                        onChange={(e) => {
                          setSchedulingDayStart(e.target.value);
                          markSchedulingDirty();
                        }}
                        disabled={schedulingLocked}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm" htmlFor="scheduling-day-end">
                        {t.schedulingEditor.dailyEnd}
                      </Label>
                      <Input
                        id="scheduling-day-end"
                        type="time"
                        value={schedulingDayEnd}
                        onChange={(e) => {
                          setSchedulingDayEnd(e.target.value);
                          markSchedulingDirty();
                        }}
                        disabled={schedulingLocked}
                      />
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    "grid gap-3",
                    schedulingUnit === "time" ? "grid-cols-3" : "grid-cols-1",
                  )}
                >
                  {schedulingUnit === "time" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-sm" htmlFor="scheduling-granularity">
                          {t.schedulingEditor.granularity}
                        </Label>
                        <select
                          id="scheduling-granularity"
                          value={schedulingGranularity}
                          onChange={(e) => {
                            const granularity = normalizeSchedulingGranularity(
                              Number(e.target.value),
                            );
                            setSchedulingGranularity(granularity);
                            const rounded = roundSchedulingDuration(
                              schedulingDuration,
                              granularity,
                              MAX_DAY_MINUTES,
                            );
                            setSchedulingDuration(rounded);
                            setSchedulingDurationInput(String(rounded));
                            markSchedulingDirty();
                          }}
                          disabled={schedulingLocked}
                          className="text-sm border rounded px-2 py-1 bg-white w-full"
                        >
                          <option value={15}>{t.schedulingEditor.fifteenMinutes}</option>
                          <option value={30}>{t.schedulingEditor.thirtyMinutes}</option>
                          <option value={60}>{t.schedulingEditor.sixtyMinutes}</option>
                        </select>
                        <p className="text-xs text-gray-500">
                          {t.schedulingEditor.granularityHelp}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm" htmlFor="scheduling-duration">
                          {t.schedulingEditor.duration}
                        </Label>
                        <div className="flex items-center gap-1">
                          <Input
                            id="scheduling-duration"
                            type="number"
                            min={schedulingGranularity}
                            max={MAX_DAY_MINUTES}
                            step={schedulingGranularity}
                            value={schedulingDurationInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setSchedulingDurationInput(raw);
                              // Keep the committed value in step with what the
                              // moderator is typing without rounding it yet:
                              // rounding here rewrites "9" to "30" before the
                              // "0" that makes "90" can be typed.
                              const parsed = parseInt(raw, 10);
                              if (Number.isFinite(parsed)) {
                                setSchedulingDuration(parsed);
                              }
                              markSchedulingDirty();
                            }}
                            onBlur={() => {
                              const rounded = roundSchedulingDuration(
                                schedulingDuration,
                                schedulingGranularity,
                                MAX_DAY_MINUTES,
                              );
                              setSchedulingDuration(rounded);
                              setSchedulingDurationInput(String(rounded));
                            }}
                            disabled={schedulingLocked}
                          />
                          <span className="text-xs text-gray-500">
                            {t.schedulingEditor.minutesUnit}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{t.schedulingEditor.durationHelp}</p>
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <Label className="text-sm" htmlFor="scheduling-max-slots">
                      {t.schedulingEditor.maxSlots}
                    </Label>
                    <Input
                      id="scheduling-max-slots"
                      type="number"
                      min={1}
                      max={MAX_SCHEDULING_SLOTS}
                      value={schedulingMaxSlots}
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setSchedulingMaxSlots(
                          Math.min(
                            Math.max(Number.isFinite(next) ? next : 1, 1),
                            MAX_SCHEDULING_SLOTS,
                          ),
                        );
                        markSchedulingDirty();
                      }}
                      disabled={schedulingLocked}
                    />
                    <p className="text-xs text-gray-500">{t.schedulingEditor.maxSlotsHelp}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t.schedulingEditor.allowIfNeeded}</Label>
                  <Switch
                    checked={schedulingAllowIfNeeded}
                    onCheckedChange={(checked) => {
                      setSchedulingAllowIfNeeded(checked);
                      markSchedulingDirty();
                    }}
                    disabled={schedulingLocked}
                  />
                </div>

                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-sm">{t.schedulingEditor.dates}</Label>
                    <p className="text-xs text-gray-500">{t.schedulingEditor.datesHelp}</p>
                  </div>

                  <div className="rounded-md border bg-white p-1">
                    <Calendar
                      mode="multiple"
                      selected={schedulingDates
                        .map(schedulingDateToLocalDate)
                        .filter((date): date is Date => Boolean(date))}
                      onSelect={(dates) => {
                        const keys = (dates ?? [])
                          .map(localDateToSchedulingKey)
                          .sort();
                        setSchedulingDates(keys.slice(0, SCHEDULING_MAX_DATES));
                        markSchedulingDirty();
                      }}
                      disabled={schedulingLocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">
                      {t.schedulingEditor.dateRange}
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="scheduling-range-start">
                          {t.schedulingEditor.startDate}
                        </Label>
                        <Input
                          id="scheduling-range-start"
                          type="date"
                          value={schedulingRangeStart}
                          onChange={(e) => setSchedulingRangeStart(e.target.value)}
                          disabled={schedulingLocked}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="scheduling-range-end">
                          {t.schedulingEditor.endDate}
                        </Label>
                        <Input
                          id="scheduling-range-end"
                          type="date"
                          value={schedulingRangeEnd}
                          onChange={(e) => setSchedulingRangeEnd(e.target.value)}
                          disabled={schedulingLocked}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.schedulingEditor.weekdays}</Label>
                      <div className="flex flex-wrap gap-3">
                        {SCHEDULING_WEEKDAYS.map((day) => (
                          <label
                            key={day}
                            className="flex items-center gap-1 text-xs text-gray-700"
                          >
                            <Checkbox
                              checked={schedulingRangeWeekdays.includes(day)}
                              onCheckedChange={() => handleToggleSchedulingWeekday(day)}
                              disabled={schedulingLocked}
                            />
                            {SCHEDULING_WEEKDAY_LABELS[day]}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        {t.schedulingEditor.weekdaysHelp}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplySchedulingRange}
                      disabled={
                        schedulingLocked || !schedulingRangeStart || !schedulingRangeEnd
                      }
                    >
                      {t.schedulingEditor.applyRange}
                    </Button>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs" htmlFor="scheduling-single-date">
                        {t.schedulingEditor.addDate}
                      </Label>
                      <Input
                        id="scheduling-single-date"
                        type="date"
                        value={schedulingSingleDate}
                        onChange={(e) => setSchedulingSingleDate(e.target.value)}
                        disabled={schedulingLocked}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddSchedulingDate}
                      disabled={schedulingLocked || !schedulingSingleDate}
                    >
                      {t.schedulingEditor.addDate}
                    </Button>
                  </div>

                  {schedulingDates.length === 0 ? (
                    <p className="text-xs text-gray-500">{t.schedulingEditor.noSlots}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {schedulingDates.map((date) => (
                        <span
                          key={date}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                        >
                          {date}
                          <button
                            type="button"
                            onClick={() => handleRemoveSchedulingDate(date)}
                            disabled={schedulingLocked}
                            title={t.schedulingEditor.removeDate}
                            aria-label={t.schedulingEditor.removeDate}
                            className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleGenerateSchedulingSlots}
                      disabled={schedulingLocked}
                    >
                      {t.schedulingEditor.generateSlots}
                    </Button>
                    <span className="text-xs text-gray-500">
                      {t.schedulingEditor.slotCount.replace(
                        "{{count}}",
                        String(schedulingSlotProposals.length),
                      )}
                    </span>
                  </div>

                  {schedulingError && (
                    <p className="text-xs text-red-600">{schedulingError}</p>
                  )}

                  {schedulingSlotProposals.length === 0 ? (
                    <p className="text-xs text-gray-500">{t.schedulingEditor.noSlots}</p>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">
                        {t.schedulingEditor.preview}
                      </Label>
                      <ul className="space-y-1">
                        {schedulingSlotProposals.slice(0, 12).map((slot) => (
                          <li
                            key={slot.id}
                            className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                          >
                            <span>
                              {schedulingUnit === "day"
                                ? formatSchedulingDay(
                                    slot.timeSlot?.startAt ?? "",
                                    schedulingTimeZone,
                                  )
                                : formatSchedulingRange(
                                    slot.timeSlot?.startAt ?? "",
                                    slot.timeSlot?.endAt ?? "",
                                    schedulingTimeZone,
                                  )}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSchedulingSlot(slot)}
                              disabled={schedulingLocked}
                              title={t.schedulingEditor.removeSlot}
                              aria-label={t.schedulingEditor.removeSlot}
                              className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-base font-medium">{t.labels.proposals}</Label>
              <ProposalEditor
                ref={proposalEditorRef}
                proposals={proposals}
                onChange={setProposals}
                kind={kind}
                allowAudienceProposals={allowAudienceProposals}
                onAllowAudienceProposalsChange={setAllowAudienceProposals}
                readOnly={isFinalized}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            <X className="w-4 h-4 mr-2" />
            {inline ? tt("voting.revert") : t.buttons.cancel}
          </Button>
          {!isFinalized && (
            <Button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? t.buttons.saving : isEditing ? t.buttons.saveChanges : t.buttons.createVote}
            </Button>
          )}
        </DialogFooter>
        {timePickerConfig && (
          <TimePickerDialog
            isOpen={timePickerOpen}
            onClose={() => setTimePickerOpen(false)}
            initialTime={timePickerConfig.initialTime}
            onTimeChange={(timestamp) => {
              const instant = Temporal.Instant.fromEpochMilliseconds(timestamp);
              const pdt = instant.toZonedDateTimeISO(timezone).toPlainDateTime();
              const currentDate = timePickerConfig.type === "openAt" ? openAt : closeAt;
              let finalPdt: Temporal.PlainDateTime;
              if (currentDate) {
                const currentPdt = instantToPlainDateTime(
                  Temporal.Instant.fromEpochMilliseconds(currentDate),
                  timezone
                );
                finalPdt = currentPdt.with({ hour: pdt.hour, minute: pdt.minute, second: 0 });
              } else {
                finalPdt = pdt.with({ second: 0 });
              }
              const epochMs = plainDateTimeToTimestamp(finalPdt, timezone);
              if (timePickerConfig.type === "openAt") {
                setOpenAt(epochMs);
              } else {
                setCloseAt(epochMs);
              }
            }}
          />
        )}
    </>
  );

  if (inline) {
    return (
      <div className="w-full rounded-lg border bg-white p-5">
        {content}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  );
};