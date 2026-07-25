import type {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  FertilizationBoardEntity,
  DreamBoardEntity,
  SalaryBoardEntity,
  CircleEntity,
  FrameworkEntity,
  ReminderEntity,
  PomodoroSession,
  QolSurveyResponseEntity,
} from './persistence-types';
import type { TaskTemplate } from './task-templates';
import i18n from '@/i18n';

/**
 * ACME Corporation sample dataset — a small, opinionated demo workspace
 * inspired by "Who Framed Roger Rabbit" (1988).
 *
 * Three main characters (Eddie Valiant, Roger Rabbit, Jessica Rabbit) run a
 * single-screen cinema ("The Acme Theatre") and programme upcoming movies.
 * Each movie is a parent task; its subtasks are the operational steps needed
 * to project it (box office, ticket scanning, DCP prep, ...).
 *
 * The dataset is intentionally small: a handful of tasks, a few circles/roles,
 * one intentional + one collaborative framework, a basic salary board, a few
 * achievements on the Celebration board, and a couple of reminders.
 *
 * All IDs are stable string slugs (not random UUIDs) so the dataset is
 * deterministic and idempotent across imports.
 *
 * All human-readable strings are resolved from the `acme.*` i18n namespace so
 * the workspace is created in the user's chosen language. IDs stay locale-
 * independent.
 */

export const ACME_ORG_ID = 'acme-organization';
export const ACME_THEATRE_CIRCLE_ID = 'acme-theatre';
export const ACME_OPERATIONS_CIRCLE_ID = 'acme-operations';
export const ACME_PROGRAMMING_CIRCLE_ID = 'acme-programming';

export const ACME_USER_EDDIE = 'acme-eddie-valiant';
export const ACME_USER_ROGER = 'acme-roger-rabbit';
export const ACME_USER_JESSICA = 'acme-jessica-rabbit';

export const ACME_ROLE_BOX_OFFICE = 'acme-role-box-office';
export const ACME_ROLE_TICKET_SCANNER = 'acme-role-ticket-scanner';
export const ACME_ROLE_DCP_OPERATOR = 'acme-role-dcp-operator';
export const ACME_ROLE_PROGRAMMER = 'acme-role-programmer';

const NOW = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;
const iso = (epochMs: number) => new Date(epochMs).toISOString();

/**
 * Compute the start of the next Friday (00:00 local of the target date,
 * expressed as an epoch-ms timestamp). Used to anchor the ACME programme
 * on the upcoming weekend so the demo data always looks "fresh".
 *
 * Days of week: 0 = Sunday ... 5 = Friday, 6 = Saturday.
 */
function nextFridayEpoch(from = Date.now()): number {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // Days until next Friday (5). If today is Friday (5), go to *next* Friday
  // (7 days) so we never schedule "today" — the programme is always ahead.
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  return d.getTime() + daysUntilFriday * ONE_DAY;
}

const ACME_FRIDAY = nextFridayEpoch();
const ACME_SATURDAY = ACME_FRIDAY + ONE_DAY;
const ACME_SUNDAY = ACME_FRIDAY + 2 * ONE_DAY;

// ---------------------------------------------------------------------------
// Tasks — 5 upcoming movies (parents) + side tasks (finances, admin)
// ---------------------------------------------------------------------------

interface MovieSeed {
  id: string;
  titleKey: string;
  /** Epoch-ms of the screening day (midnight local). The actual screening time
   *  is set via `startHour`/`startMinute`. */
  screeningDate: number;
  /** Hour of the screening (24h, local). 14 = matinée, 20 = evening. */
  startHour: number;
  startMinute: number;
  /** Movie length in minutes. */
  durationMinutes: number;
  urgent: boolean;
  impact: boolean;
  sprintTarget: boolean;
  difficulty: number;
  category: TaskEntity['category'];
  assigneeId: string | null;
  priority: number;
}

const MOVIES: MovieSeed[] = [
  {
    id: 'acme-movie-somersault',
    titleKey: 'acme.task.movie1',
    screeningDate: ACME_FRIDAY,
    startHour: 20,
    startMinute: 0,
    durationMinutes: 125,
    urgent: false,
    impact: false,
    sprintTarget: false,
    difficulty: 5,
    category: 'Marketing',
    assigneeId: ACME_USER_JESSICA,
    priority: 1,
  },
  {
    id: 'acme-movie-dip-disaster',
    titleKey: 'acme.task.movie2',
    screeningDate: ACME_SATURDAY,
    startHour: 20,
    startMinute: 0,
    durationMinutes: 110,
    urgent: false,
    impact: false,
    sprintTarget: false,
    difficulty: 3,
    category: 'Marketing',
    assigneeId: ACME_USER_EDDIE,
    priority: 2,
  },
  {
    id: 'acme-movie-patty-cake',
    titleKey: 'acme.task.movie3',
    screeningDate: ACME_SATURDAY,
    startHour: 14,
    startMinute: 0,
    durationMinutes: 95,
    urgent: false,
    impact: false,
    sprintTarget: false,
    difficulty: 2,
    category: 'Marketing',
    assigneeId: ACME_USER_ROGER,
    priority: 3,
  },
  {
    id: 'acme-movie-toon-noir',
    titleKey: 'acme.task.movie4',
    screeningDate: ACME_SUNDAY,
    startHour: 20,
    startMinute: 0,
    durationMinutes: 130,
    urgent: false,
    impact: false,
    sprintTarget: false,
    difficulty: 3,
    category: 'Marketing',
    assigneeId: ACME_USER_JESSICA,
    priority: 4,
  },
  {
    id: 'acme-movie-benny-cab',
    titleKey: 'acme.task.movie5',
    screeningDate: ACME_SUNDAY,
    startHour: 14,
    startMinute: 0,
    durationMinutes: 85,
    urgent: false,
    impact: false,
    sprintTarget: false,
    difficulty: 1,
    category: 'Marketing',
    assigneeId: ACME_USER_ROGER,
    priority: 5,
  },
];

interface SubtaskSeed {
  id: string;
  parentId: string;
  titleKey: string;
  category: TaskEntity['category'];
  difficulty: number;
  assigneeId: string;
  triageStatus: TaskEntity['triageStatus'];
}

const SUBTASKS: SubtaskSeed[] = [
  // Somersault Symphony
  { id: 'acme-sub-somersault-box', parentId: 'acme-movie-somersault', titleKey: 'acme.task.subBoxOffice', category: 'Support', difficulty: 1, assigneeId: ACME_USER_EDDIE, triageStatus: 'Ready' },
  { id: 'acme-sub-somersault-scan', parentId: 'acme-movie-somersault', titleKey: 'acme.task.subScan', category: 'Support', difficulty: 1, assigneeId: ACME_USER_ROGER, triageStatus: 'Ready' },
  { id: 'acme-sub-somersault-dcp', parentId: 'acme-movie-somersault', titleKey: 'acme.task.subDcp', category: 'System Operations', difficulty: 3, assigneeId: ACME_USER_JESSICA, triageStatus: 'WIP' },
  { id: 'acme-sub-somersault-announce', parentId: 'acme-movie-somersault', titleKey: 'acme.task.subAnnounce', category: 'Marketing', difficulty: 1, assigneeId: ACME_USER_JESSICA, triageStatus: 'Done' },

  // The Dip Disaster
  { id: 'acme-sub-dip-box', parentId: 'acme-movie-dip-disaster', titleKey: 'acme.task.subBoxOffice', category: 'Support', difficulty: 1, assigneeId: ACME_USER_EDDIE, triageStatus: 'Backlog' },
  { id: 'acme-sub-dip-scan', parentId: 'acme-movie-dip-disaster', titleKey: 'acme.task.subScan', category: 'Support', difficulty: 1, assigneeId: ACME_USER_ROGER, triageStatus: 'Backlog' },
  { id: 'acme-sub-dip-dcp', parentId: 'acme-movie-dip-disaster', titleKey: 'acme.task.subDcp', category: 'System Operations', difficulty: 3, assigneeId: ACME_USER_JESSICA, triageStatus: 'Backlog' },

  // Patty-Cake Pandemonium
  { id: 'acme-sub-patty-box', parentId: 'acme-movie-patty-cake', titleKey: 'acme.task.subBoxOffice', category: 'Support', difficulty: 1, assigneeId: ACME_USER_EDDIE, triageStatus: 'Backlog' },
  { id: 'acme-sub-patty-scan', parentId: 'acme-movie-patty-cake', titleKey: 'acme.task.subScan', category: 'Support', difficulty: 1, assigneeId: ACME_USER_ROGER, triageStatus: 'Backlog' },
  { id: 'acme-sub-patty-dcp', parentId: 'acme-movie-patty-cake', titleKey: 'acme.task.subDcp', category: 'System Operations', difficulty: 2, assigneeId: ACME_USER_JESSICA, triageStatus: 'Backlog' },

  // Toon Noir
  { id: 'acme-sub-noir-box', parentId: 'acme-movie-toon-noir', titleKey: 'acme.task.subBoxOffice', category: 'Support', difficulty: 1, assigneeId: ACME_USER_EDDIE, triageStatus: 'Backlog' },
  { id: 'acme-sub-noir-scan', parentId: 'acme-movie-toon-noir', titleKey: 'acme.task.subScan', category: 'Support', difficulty: 1, assigneeId: ACME_USER_ROGER, triageStatus: 'Backlog' },
  { id: 'acme-sub-noir-dcp', parentId: 'acme-movie-toon-noir', titleKey: 'acme.task.subDcp', category: 'System Operations', difficulty: 3, assigneeId: ACME_USER_JESSICA, triageStatus: 'Backlog' },

  // Benny the Cab
  { id: 'acme-sub-benny-box', parentId: 'acme-movie-benny-cab', titleKey: 'acme.task.subBoxOffice', category: 'Support', difficulty: 1, assigneeId: ACME_USER_EDDIE, triageStatus: 'Backlog' },
  { id: 'acme-sub-benny-scan', parentId: 'acme-movie-benny-cab', titleKey: 'acme.task.subScan', category: 'Support', difficulty: 1, assigneeId: ACME_USER_ROGER, triageStatus: 'Backlog' },
  { id: 'acme-sub-benny-dcp', parentId: 'acme-movie-benny-cab', titleKey: 'acme.task.subDcp', category: 'System Operations', difficulty: 2, assigneeId: ACME_USER_JESSICA, triageStatus: 'Backlog' },
];

interface SideTaskSeed {
  id: string;
  titleKey: string;
  category: TaskEntity['category'];
  difficulty: number;
  assigneeId: string;
  urgent: boolean;
  impact: boolean;
  priority: number;
  triageStatus: TaskEntity['triageStatus'];
}

const SIDE_TASKS: SideTaskSeed[] = [
  { id: 'acme-side-rent', titleKey: 'acme.task.sideRent', category: 'Finances', difficulty: 1, assigneeId: ACME_USER_EDDIE, urgent: true, impact: false, priority: 6, triageStatus: 'Ready' },
  { id: 'acme-side-bookkeeping', titleKey: 'acme.task.sideBookkeeping', category: 'Finances', difficulty: 2, assigneeId: ACME_USER_JESSICA, urgent: false, impact: true, priority: 7, triageStatus: 'Backlog' },
  { id: 'acme-side-projector-maintenance', titleKey: 'acme.task.sideProjector', category: 'System Operations', difficulty: 3, assigneeId: ACME_USER_JESSICA, urgent: false, impact: true, priority: 8, triageStatus: 'Blocked' },
  { id: 'acme-side-supply-run', titleKey: 'acme.task.sideSupply', category: 'Admin', difficulty: 1, assigneeId: ACME_USER_ROGER, urgent: false, impact: false, priority: 9, triageStatus: 'Backlog' },
];

function buildAcmeTasks(): TaskEntity[] {
  const entities: TaskEntity[] = [];

  for (const m of MOVIES) {
    const childIds = SUBTASKS.filter(s => s.parentId === m.id).map(s => s.id);
    // Anchor the screening at startHour:startMinute local on the screening day.
    const screeningStart = new Date(m.screeningDate);
    screeningStart.setHours(m.startHour, m.startMinute, 0, 0);
    entities.push({
      id: m.id,
      title: i18n.t(m.titleKey),
      createdAt: iso(NOW - 2 * ONE_DAY),
      updatedAt: iso(NOW - ONE_DAY),
      triageStatus: 'Ready',
      urgent: m.urgent,
      impact: m.impact,
      majorIncident: false,
      sprintTarget: m.sprintTarget,
      difficulty: m.difficulty,
      timer: [],
      category: m.category,
      terminationDate: screeningStart.toISOString(),
      comment: null,
      durationInMinutes: m.durationMinutes,
      priority: m.priority,
      userId: m.assigneeId,
      parentId: null,
      children: childIds,
    });
  }

  for (const s of SUBTASKS) {
    entities.push({
      id: s.id,
      title: i18n.t(s.titleKey),
      createdAt: iso(NOW - 2 * ONE_DAY),
      updatedAt: null,
      triageStatus: s.triageStatus,
      urgent: false,
      impact: false,
      majorIncident: false,
      sprintTarget: false,
      difficulty: s.difficulty,
      timer: [],
      category: s.category,
      terminationDate: null,
      comment: null,
      durationInMinutes: null,
      priority: 0,
      userId: s.assigneeId,
      parentId: s.parentId,
      children: [],
    });
  }

  for (const t of SIDE_TASKS) {
    entities.push({
      id: t.id,
      title: i18n.t(t.titleKey),
      createdAt: iso(NOW - 3 * ONE_DAY),
      updatedAt: t.triageStatus === 'Blocked' ? iso(NOW - ONE_DAY) : null,
      triageStatus: t.triageStatus,
      urgent: t.urgent,
      impact: t.impact,
      majorIncident: false,
      sprintTarget: false,
      difficulty: t.difficulty,
      timer: [],
      category: t.category,
      terminationDate: null,
      comment: null,
      durationInMinutes: null,
      priority: t.priority,
      userId: t.assigneeId,
      parentId: null,
      children: [],
      blockedSince: t.triageStatus === 'Blocked' ? iso(NOW - ONE_DAY) : null,
    });
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Circles + Roles
// ---------------------------------------------------------------------------

function buildAcmeCircles(): CircleEntity[] {
  const ts = iso(NOW - 2 * ONE_DAY);
  return [
    {
      id: ACME_ORG_ID,
      name: i18n.t('acme.circle.org'),
      parentId: null,
      nodeType: 'organization',
      modifier: null,
      size: 1,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_THEATRE_CIRCLE_ID,
      name: i18n.t('acme.circle.theatre'),
      parentId: ACME_ORG_ID,
      nodeType: 'group',
      modifier: null,
      color: '#F9E79F',
      size: 5,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_OPERATIONS_CIRCLE_ID,
      name: i18n.t('acme.circle.operations'),
      parentId: ACME_THEATRE_CIRCLE_ID,
      nodeType: 'circle',
      modifier: null,
      color: '#4ADE80',
      size: 3,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_PROGRAMMING_CIRCLE_ID,
      name: i18n.t('acme.circle.programming'),
      parentId: ACME_THEATRE_CIRCLE_ID,
      nodeType: 'circle',
      modifier: null,
      color: '#60A5FA',
      size: 2,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_ROLE_BOX_OFFICE,
      name: i18n.t('acme.circle.boxOffice'),
      parentId: ACME_OPERATIONS_CIRCLE_ID,
      nodeType: 'role',
      modifier: null,
      color: '#cdab8f',
      size: 1,
      purpose: i18n.t('acme.circle.boxOfficePurpose'),
      missions: i18n.t('acme.circle.boxOfficeMissions'),
      authorityScope: i18n.t('acme.circle.boxOfficeAuthority'),
      assignments: [{ userId: ACME_USER_EDDIE, involvementType: 'P' }],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_ROLE_TICKET_SCANNER,
      name: i18n.t('acme.circle.scanner'),
      parentId: ACME_OPERATIONS_CIRCLE_ID,
      nodeType: 'role',
      modifier: null,
      color: '#f472b6',
      size: 1,
      purpose: i18n.t('acme.circle.scannerPurpose'),
      missions: i18n.t('acme.circle.scannerMissions'),
      authorityScope: i18n.t('acme.circle.scannerAuthority'),
      assignments: [{ userId: ACME_USER_ROGER, involvementType: 'P' }],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_ROLE_DCP_OPERATOR,
      name: i18n.t('acme.circle.dcpOperator'),
      parentId: ACME_PROGRAMMING_CIRCLE_ID,
      nodeType: 'role',
      modifier: null,
      color: '#38bdf8',
      size: 1,
      purpose: i18n.t('acme.circle.dcpPurpose'),
      missions: i18n.t('acme.circle.dcpMissions'),
      authorityScope: i18n.t('acme.circle.dcpAuthority'),
      assignments: [{ userId: ACME_USER_JESSICA, involvementType: 'P' }],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: ACME_ROLE_PROGRAMMER,
      name: i18n.t('acme.circle.programmer'),
      parentId: ACME_PROGRAMMING_CIRCLE_ID,
      nodeType: 'role',
      modifier: null,
      color: '#a78bfa',
      size: 1,
      purpose: i18n.t('acme.circle.programmerPurpose'),
      missions: i18n.t('acme.circle.programmerMissions'),
      authorityScope: i18n.t('acme.circle.programmerAuthority'),
      assignments: [{ userId: ACME_USER_JESSICA, involvementType: 'P' }],
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

// ---------------------------------------------------------------------------
// Frameworks — intentional (obligatory fields only) + collaborative (basic)
// ---------------------------------------------------------------------------

function buildAcmeFrameworks(): FrameworkEntity[] {
  const ts = iso(NOW - 2 * ONE_DAY);
  return [
    {
      id: 'acme-intentional-framework',
      name: i18n.t('acme.framework.intentionalName'),
      frameworkType: 'intentional',
      parentId: null,
      categories: [
        { id: 'mission', label: i18n.t('acme.framework.missionLabel'), description: i18n.t('acme.framework.missionDesc'), content: i18n.t('acme.framework.missionContent'), order: 0 },
        { id: 'purpose', label: i18n.t('acme.framework.purposeLabel'), description: i18n.t('acme.framework.purposeDesc'), content: i18n.t('acme.framework.purposeContent'), order: 1 },
        { id: 'values', label: i18n.t('acme.framework.valuesLabel'), description: i18n.t('acme.framework.valuesDesc'), content: i18n.t('acme.framework.valuesContent'), order: 2 },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'acme-collaborative-framework',
      name: i18n.t('acme.framework.collaborativeName'),
      frameworkType: 'collaborative',
      parentId: null,
      categories: [
        { id: 'collaborative-values', label: i18n.t('acme.framework.collabValuesLabel'), description: i18n.t('acme.framework.collabValuesDesc'), content: i18n.t('acme.framework.collabValuesContent'), order: 0 },
        { id: 'expected-behaviors', label: i18n.t('acme.framework.behaviorsLabel'), description: i18n.t('acme.framework.behaviorsDesc'), content: i18n.t('acme.framework.behaviorsContent'), order: 1 },
        { id: 'regular-meetings', label: i18n.t('acme.framework.meetingsLabel'), description: i18n.t('acme.framework.meetingsDesc'), content: i18n.t('acme.framework.meetingsContent'), order: 2 },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

// ---------------------------------------------------------------------------
// Salary board — very basic, USD, 3 employees
// ---------------------------------------------------------------------------

function buildAcmeSalaryBoard(): SalaryBoardEntity {
  return {
    config: {
      indexHourlyWage: 18,
      hoursPerWeek: 40,
      weeksPerMonth: 4.33333333333333,
      seniorityIncrease: 0.01,
      ageIncrease: 0.05,
      ageBrackets: [25, 35, 45, 55, 65],
      socialChargesRate: 0.0765,
      include13thSalary: false,
      hoursPerDay: 8,
      daysPerWeek: 5,
      roundingStep: 10,
      currency: 'USD',
      label: i18n.t('acme.salary.systemLabel'),
      expenseFactor: 1.4,
    },
    dimensions: [
      {
        id: 'expertise',
        name: i18n.t('acme.salary.dimExpertise'),
        stepValue: 150,
        maxLevel: 4,
        color: '#729FCF',
        affectsSalary: true,
        levelDescriptions: [
          i18n.t('acme.salary.expertiseL0'),
          i18n.t('acme.salary.expertiseL1'),
          i18n.t('acme.salary.expertiseL2'),
          i18n.t('acme.salary.expertiseL3'),
          i18n.t('acme.salary.expertiseL4'),
        ],
      },
      {
        id: 'responsibility',
        name: i18n.t('acme.salary.dimResponsibility'),
        stepValue: 200,
        maxLevel: 4,
        color: '#f472b6',
        affectsSalary: true,
        levelDescriptions: [
          i18n.t('acme.salary.responsibilityL0'),
          i18n.t('acme.salary.responsibilityL1'),
          i18n.t('acme.salary.responsibilityL2'),
          i18n.t('acme.salary.responsibilityL3'),
          i18n.t('acme.salary.responsibilityL4'),
        ],
      },
    ],
    employees: [
      {
        id: ACME_USER_EDDIE,
        name: 'Eddie Valiant',
        workload: 100,
        age: 40,
        seniority: 5,
        levels: [
          { dimensionId: 'expertise', level: 3 },
          { dimensionId: 'responsibility', level: 2 },
        ],
        comment: i18n.t('acme.salary.eddieComment'),
      },
      {
        id: ACME_USER_ROGER,
        name: 'Roger Rabbit',
        workload: 80,
        age: 30,
        seniority: 2,
        levels: [
          { dimensionId: 'expertise', level: 2 },
          { dimensionId: 'responsibility', level: 1 },
        ],
        comment: i18n.t('acme.salary.rogerComment'),
      },
      {
        id: ACME_USER_JESSICA,
        name: 'Jessica Rabbit',
        workload: 100,
        age: 35,
        seniority: 6,
        levels: [
          { dimensionId: 'expertise', level: 4 },
          { dimensionId: 'responsibility', level: 3 },
        ],
        employerAdjustments: [
          { id: 'acme-adj-projection', label: i18n.t('acme.salary.adjLabel'), amount: 200, frequency: 'monthly' },
        ],
        comment: i18n.t('acme.salary.jessicaComment'),
      },
    ],
    budget: {
      scenarios: [
        { id: 'acme-budget-typical', name: i18n.t('acme.salary.budgetName'), revenues: 240000, charges: 60000, reserve: 10000, chargesMode: 'manual' },
      ],
      activeScenarioId: 'acme-budget-typical',
    },
    updatedAt: iso(NOW - ONE_DAY),
  };
}

// ---------------------------------------------------------------------------
// Celebration board (fertilization) — only ACHIEVED (factTag 'A') + numbers ('K')
// ---------------------------------------------------------------------------

function buildAcmeFertilizationBoard(moderatorId: string): FertilizationBoardEntity {
  return {
    moderatorId,
    isSessionActive: true,
    columns: [
      { id: 'facts', title: i18n.t('fertilization.column.facts'), color: '#FFFFFF', isLocked: false },
      { id: 'satisfactions', title: i18n.t('fertilization.column.satisfactions'), color: '#FACC15', isLocked: true },
      { id: 'discomfort', title: i18n.t('fertilization.column.discomfort'), color: '#030303', isLocked: true },
      { id: 'levers', title: i18n.t('fertilization.column.levers'), color: '#4ADE80', isLocked: true },
      { id: 'priorities', title: i18n.t('fertilization.column.priorities'), color: '#60A5FA', isLocked: true },
    ],
    cards: [
      { id: 'acme-fert-1', columnId: 'facts', content: i18n.t('acme.fertilization.fact1'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, factTag: 'A' },
      { id: 'acme-fert-2', columnId: 'facts', content: i18n.t('acme.fertilization.fact2'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, factTag: 'A' },
      { id: 'acme-fert-3', columnId: 'facts', content: i18n.t('acme.fertilization.fact3'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, factTag: 'K' },
      { id: 'acme-fert-4', columnId: 'satisfactions', content: i18n.t('acme.fertilization.satisfaction1'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true },
    ],
    timer: null,
    hiddenEdition: false,
    votingMode: 'THUMBS_UP',
    votingPhase: 'IDLE',
    areCursorsVisible: true,
    showAllLinks: false,
  };
}

// ---------------------------------------------------------------------------
// Dream board — a couple of future aspirations
// ---------------------------------------------------------------------------

function buildAcmeDreamBoard(moderatorId: string): DreamBoardEntity {
  return {
    moderatorId,
    isSessionActive: true,
    columns: [
      { id: 'dreams', title: i18n.t('dream.column.dreams'), color: '#FFFFFF', isLocked: false },
      { id: 'strengths', title: i18n.t('dream.column.strengths'), color: '#FACC15', isLocked: true },
      { id: 'threats', title: i18n.t('dream.column.threats'), color: '#030303', isLocked: true },
      { id: 'levers', title: i18n.t('dream.column.levers'), color: '#4ADE80', isLocked: true },
      { id: 'priorities', title: i18n.t('dream.column.priorities'), color: '#60A5FA', isLocked: true },
    ],
    cards: [
      { id: 'acme-dream-1', columnId: 'dreams', content: i18n.t('acme.dream.dream1'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, timeFrame: '2y' },
      { id: 'acme-dream-2', columnId: 'strengths', content: i18n.t('acme.dream.strength1'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, timeFrame: '6mo' },
      { id: 'acme-dream-3', columnId: 'threats', content: i18n.t('acme.dream.threat1'), authorId: moderatorId, votes: {}, offlineVotes: {}, isRevealed: true, timeFrame: '1y' },
    ],
    timer: null,
    hiddenEdition: false,
    votingMode: 'THUMBS_UP',
    votingPhase: 'IDLE',
    isTimelineExpanded: false,
    timeSortDirection: 'nearest',
    areCursorsVisible: true,
    showAllLinks: false,
  };
}

// ---------------------------------------------------------------------------
// User settings — 3 characters
// ---------------------------------------------------------------------------

function buildAcmeUserSettings(): UserSettingsEntity[] {
  const base = {
    logo: '',
    hasCompletedOnboarding: true,
    workload: 100,
    splitTime: '13:00',
    monthlyBalances: {},
    cardCompactness: 0,
    timezone: 'America/Los_Angeles',
    weekStartDay: 0 as const,
    defaultPlanView: 'month' as const,
  };
  return [
    { ...base, userId: ACME_USER_EDDIE, username: 'Eddie Valiant', trigram: 'EDV' },
    { ...base, userId: ACME_USER_ROGER, username: 'Roger Rabbit', trigram: 'RRA', workload: 80 },
    { ...base, userId: ACME_USER_JESSICA, username: 'Jessica Rabbit', trigram: 'JRA' },
  ];
}

// ---------------------------------------------------------------------------
// App settings — cinema-tuned
// ---------------------------------------------------------------------------

function buildAcmeAppSettings(): AppSettingsEntity {
  return {
    splitTime: 13,
    userWorkloadPercentage: 90,
    weeksComputation: 4,
    highImpactTaskGoal: 3,
    failureRateGoal: 5,
    qliGoal: 70,
    newCapabilitiesGoal: 40,
    vacationLimitMultiplier: 1.5,
    hourlyBalanceLimitUpper: 0.5,
    hourlyBalanceLimitLower: -0.5,
    hoursToBeDoneByDay: 8,
    timezone: 'America/Los_Angeles',
    country: 'US',
    region: 'CA',
    cardAgingBaseDays: 30,
    disabledModules: [],
    wipLimitPerUser: 3,
  };
}

// ---------------------------------------------------------------------------
// Reminders — a couple of pre-existing ones
// ---------------------------------------------------------------------------

function buildAcmeReminders(): ReminderEntity[] {
  const ts = iso(NOW - ONE_DAY);
  const premiere = ACME_FRIDAY;
  const daysToPremiere = Math.max(1, Math.round((premiere - NOW) / ONE_DAY));
  // Fire the premiere reminder 2 days before the screening (or tomorrow if
  // the screening is very close), whichever keeps it in the future.
  const triggerEpoch = Math.max(NOW + ONE_DAY, premiere - 2 * ONE_DAY);
  return [
    {
      id: 'acme-reminder-premiere',
      userId: ACME_USER_JESSICA,
      taskId: 'acme-movie-somersault',
      title: i18n.t('acme.reminder.premiereTitle', { count: daysToPremiere }),
      description: i18n.t('acme.reminder.premiereDesc'),
      read: false,
      persistent: false,
      triggerDate: iso(triggerEpoch),
      offsetMinutes: 60 * 24,
      snoozeDurationMinutes: 60 * 24,
      originalTriggerDate: iso(triggerEpoch),
      state: 'scheduled',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'acme-reminder-projector',
      userId: ACME_USER_JESSICA,
      taskId: 'acme-side-projector-maintenance',
      title: i18n.t('acme.reminder.projectorTitle'),
      description: i18n.t('acme.reminder.projectorDesc'),
      read: false,
      persistent: false,
      state: 'triggered',
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

// ---------------------------------------------------------------------------
// Pomodoro sessions — a few recent focus sessions
// ---------------------------------------------------------------------------

function buildAcmePomodoroSessions(): PomodoroSession[] {
  const workMs = 25 * 60 * 1000;
  const breakMs = 5 * 60 * 1000;
  const start = NOW - 2 * ONE_DAY;
  return [
    { id: 'acme-pomo-1', taskId: 'acme-sub-somersault-dcp', userId: ACME_USER_JESSICA, startTime: start, endTime: start + workMs, phase: 'work', duration: workMs, completed: true },
    { id: 'acme-pomo-2', taskId: 'acme-sub-somersault-dcp', userId: ACME_USER_JESSICA, startTime: start + workMs, endTime: start + workMs + breakMs, phase: 'short-break', duration: breakMs, completed: true },
    { id: 'acme-pomo-3', taskId: 'acme-side-bookkeeping', userId: ACME_USER_JESSICA, startTime: start + ONE_DAY, endTime: start + ONE_DAY + workMs, phase: 'work', duration: workMs, completed: true },
    { id: 'acme-pomo-4', taskId: 'acme-sub-somersault-box', userId: ACME_USER_EDDIE, startTime: start + ONE_DAY + 2 * 60 * 60 * 1000, endTime: start + ONE_DAY + 2 * 60 * 60 * 1000 + workMs, phase: 'work', duration: workMs, completed: true },
  ];
}

// ---------------------------------------------------------------------------
// QoL survey responses — one filled, two empty
// ---------------------------------------------------------------------------

function buildAcmeQolSurveyResponses(): Record<string, QolSurveyResponseEntity> {
  return {
    [ACME_USER_JESSICA]: {
      'Documentation & access to information': 'Satisfied',
      'Deep work/focus time': 'Satisfied',
      'Planning processes': 'Very satisfied',
      'Cross-team dependencies': 'Neutral',
      'Ease of Delivery (difficulty to implement change)': 'Satisfied',
      'Maintainability of delivered assets': 'Satisfied',
    },
    [ACME_USER_EDDIE]: {},
    [ACME_USER_ROGER]: {},
  };
}

// ---------------------------------------------------------------------------
// Task templates — one cinema-flavoured template
// ---------------------------------------------------------------------------

function buildAcmeTaskTemplates(): TaskTemplate[] {
  return [
    {
      id: 'tpl-acme-screening',
      name: i18n.t('acme.template.name'),
      parentTitle: i18n.t('acme.template.parentTitle'),
      scope: 'workspace',
      children: [
        { title: i18n.t('acme.task.subBoxOffice'), difficulty: 1, category: 'Support' },
        { title: i18n.t('acme.task.subScan'), difficulty: 1, category: 'Support' },
        { title: i18n.t('acme.task.subDcp'), difficulty: 3, category: 'System Operations' },
        { title: i18n.t('acme.template.childAnnounce'), difficulty: 1, category: 'Marketing' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export interface AcmeSampleData {
  schemaVersion: number;
  tasks: TaskEntity[];
  scheduledReminders: ReminderEntity[];
  qolSurveyResponses: Record<string, QolSurveyResponseEntity>;
  fertilizationBoard: FertilizationBoardEntity;
  dreamBoard: DreamBoardEntity;
  salaryBoard: SalaryBoardEntity;
  circles: CircleEntity[];
  frameworks: FrameworkEntity[];
  settings: AppSettingsEntity;
  activeUserId: string;
  allUserSettings: UserSettingsEntity[];
  votes: never[];
  voteResponses: never[];
  voteLoops: never[];
  voteModerators: never[];
  pomodoroSessions: PomodoroSession[];
  taskTemplates: TaskTemplate[];
}

/**
 * Build the full ACME sample dataset.
 *
 * @param activeUserId The UUID of the *current* user (the one who accepted the
 *   modal). The ACME characters keep their stable slug IDs, but the active user
 *   is recorded so the app knows which user to land on after import.
 * @param locale Target language for the example data ('en' | 'fr' | 'de').
 *   All human-readable strings (task titles, circle names, framework content,
 *   board cards, reminders, ...) are resolved in this language. IDs stay
 *   locale-independent. The caller is responsible for switching the live i18n
 *   language to `locale` after import (see ExampleDataModal).
 */
export function buildAcmeSampleData(activeUserId: string, locale: 'en' | 'fr' | 'de' = 'en'): AcmeSampleData {
  const previousLang = i18n.language;
  // i18n.changeLanguage is async (it may fetch the namespace); but the locales
  // are preloaded at init, so the resources are already in memory and the
  // change is effectively synchronous for our purposes. We still await it to
  // be safe, then restore the previous language after building.
  const build = (): AcmeSampleData => ({
    schemaVersion: 4,
    tasks: buildAcmeTasks(),
    scheduledReminders: buildAcmeReminders(),
    qolSurveyResponses: buildAcmeQolSurveyResponses(),
    fertilizationBoard: buildAcmeFertilizationBoard(activeUserId),
    dreamBoard: buildAcmeDreamBoard(activeUserId),
    salaryBoard: buildAcmeSalaryBoard(),
    circles: buildAcmeCircles(),
    frameworks: buildAcmeFrameworks(),
    settings: buildAcmeAppSettings(),
    activeUserId,
    allUserSettings: buildAcmeUserSettings(),
    votes: [],
    voteResponses: [],
    voteLoops: [],
    voteModerators: [],
    pomodoroSessions: buildAcmePomodoroSessions(),
    taskTemplates: buildAcmeTaskTemplates(),
  });

  // If the requested locale is already active, build directly.
  if (i18n.resolvedLanguage === locale || i18n.language === locale) {
    return build();
  }

  // Switch, build, restore. changeLanguage returns a promise but resources are
  // preloaded so the synchronous .t() calls below resolve immediately.
  i18n.changeLanguage(locale);
  const data = build();
  i18n.changeLanguage(previousLang);
  return data;
}