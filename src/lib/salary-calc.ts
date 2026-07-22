import type {
  SalaryBoardEntity,
  SalaryBudgetScenario,
  SalaryConfig,
  SalaryDimension,
  SalaryEmployee,
  SalaryEmployeeLevel,
  EmployerAdjustment,
} from './persistence-types';

export interface SalaryComputation {
  /** Base monthly salary at 100% workload (CHF) = indexHourly × hours/week × weeks/month. */
  baseSalary: number;
  /** Sum of dimension steps for this employee (CHF/month). */
  dimensionSteps: number;
  /** Gross monthly salary at 100% workload, after seniority & age compounding (CHF).
   *  Salaire brut mensuel à 100%. */
  gross100: number;
  /** Annual gross salary at 100% workload (CHF). Salaire annuel à 100%. */
  gross100Annual: number;
  /** Hourly rate at 100% workload (CHF/h). Taux horaire à 100%. */
  gross100Hourly: number;
  /** Gross monthly salary WITH 13th (CHF). Salaire mensuel avec 13e.
   *  This is the "brut avec 13ème" shown to the employee. */
  grossMonthlyWith13: number;
  /** Gross annual salary at the employee's workload (CHF). Salaire annuel avec 13e. */
  grossAnnual: number;
  /** Gross monthly salary WITHOUT 13th, pure formula (CHF). Salaire mensuel sans 13e
   *  before any employer adjustments. */
  grossMonthlyPure: number;
  /** Gross monthly salary WITH 13th + complements (CHF) = G6 + adjustments.
   *  This is the "Brut mensuel (ac 13e & compl.)" column. */
  grossMonthlyWith13AndAdjustments: number;
  /** Gross monthly salary WITHOUT 13th (CHF). Salaire mensuel sans 13e = pure + adjustments.
   *  This is the "Brut mensuel" column the employee actually receives each month. */
  grossMonthly: number;
  /** Net monthly salary WITH 13th basis (CHF). Net approximatif. */
  netMonthlyWith13: number;
  /** Net monthly salary WITHOUT 13th (CHF) = netMonthlyWith13 / 13 × 12. */
  netMonthly: number;
  /** Net annual salary (CHF). */
  netAnnual: number;
  /** Annual gross without 13th × 13 (CHF). Salaire annuel sans 13e. */
  grossAnnualWithout13: number;
  /** Total employer cost (gross + employer expense factor) per year (CHF). */
  employerCostAnnual: number;
  /** Total employer cost (gross + employer expense factor) per month (CHF). */
  employerCostMonthly: number;
  /** How many age-bracket increases were triggered. */
  ageBracketSteps: number;
}

export const roundToStep = (value: number, step: number): number => {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
};

/** Round to the nearest 5 centimes (0.05 CHF), matching the golden
 *  standard formula: ROUND(value / 5, 2) * 5. */
export const roundToNickel = (value: number): number => {
  // Use string rounding to avoid floating-point artifacts (3750.45000...01)
  return Math.round((value / 5) * 100) / 100 * 5;
};

export const computeBaseSalary = (config: SalaryConfig): number => {
  return config.indexHourlyWage * config.hoursPerWeek * config.weeksPerMonth;
};

export const computeDimensionSteps = (
  dimensions: SalaryDimension[],
  employee: SalaryEmployee
): number => {
  let sum = 0;
  for (const dim of dimensions) {
    if (dim.affectsSalary === false) continue;
    const level = employee.levels.find(l => l.dimensionId === dim.id)?.level ?? 0;
    const safeLevel = Math.max(0, Math.min(level, dim.maxLevel));
    sum += safeLevel * dim.stepValue;
  }
  return sum;
};

export const ageBracketStepsFor = (age: number, brackets: number[]): number => {
  let steps = 0;
  for (const b of brackets) {
    if (age >= b) steps += 1;
  }
  return steps;
};

export const computeSalary = (
  config: SalaryConfig,
  dimensions: SalaryDimension[],
  employee: SalaryEmployee
): SalaryComputation => {
  // Safety: tolerate persisted configs from previous schema versions
  const safeConfig: SalaryConfig = {
    ...config,
    indexHourlyWage: config.indexHourlyWage ?? 0,
    hoursPerWeek: config.hoursPerWeek ?? 0,
    weeksPerMonth: config.weeksPerMonth ?? 4.33333333333333,
    seniorityIncrease: config.seniorityIncrease ?? 0,
    ageIncrease: config.ageIncrease ?? 0,
    ageBrackets: config.ageBrackets ?? [],
    socialChargesRate: config.socialChargesRate ?? 0,
    expenseFactor: config.expenseFactor ?? 1,
    include13thSalary: config.include13thSalary ?? false,
    hoursPerDay: config.hoursPerDay ?? 8,
    daysPerWeek: config.daysPerWeek ?? 5,
    roundingStep: config.roundingStep ?? 5,
    currency: config.currency ?? 'CHF',
  };

  const base = computeBaseSalary(safeConfig);
  const dimSteps = computeDimensionSteps(dimensions, employee);
  const startingPoint = base + dimSteps;

  const ageSteps = ageBracketStepsFor(employee.age, safeConfig.ageBrackets);
  const seniorityFactor = Math.pow(1 + safeConfig.seniorityIncrease, Math.max(0, employee.seniority));
  const ageFactor = Math.pow(1 + safeConfig.ageIncrease, ageSteps);

  // Salaire brut à 100%: ROUND((base + steps) × seniority × age, 0) — gross monthly at 100%
  const gross100 = Math.round(startingPoint * seniorityFactor * ageFactor);
  // Salaire annuel à 100% = brut100 × 12 — annual gross at 100%
  const gross100Annual = gross100 * 12;
  // Taux horaire = brut100 ÷ (21 × 8 × 5) — hourly rate at 100%
  // Note: ROUND(x, 2) then × 5 (not roundToNickel)
  const gross100Hourly = Math.round((gross100 / 21 / 8 / 5) * 100) / 100 * 5;

  const workloadFraction = Math.max(0, employee.workload) / 100;
  // Salaire mensuel avec 13e = ROUND(brut100 × taux) — gross monthly WITH 13th at workload
  const grossMonthlyWith13 = Math.round(gross100 * workloadFraction);
  // Salaire annuel = mensuel13 × 12 — annual gross at workload (with 13th = 13 salaries)
  const grossAnnual = grossMonthlyWith13 * 12;

  // Salaire mensuel sans 13e = ROUND(mensuel13 ÷ 13 × 12, 0.05) — gross monthly WITHOUT 13th (pure formula)
  const grossMonthlyPure = roundToNickel(grossMonthlyWith13 / 13 * 12);
  // Employer adjustments converted to monthly equivalent:
  //  - monthly: amount as-is (per normal month, 12× per year, never 13th)
  //  - semesterly: amount / 6
  //  - annually: amount / 12
  const adjustmentsTotal = (employee.employerAdjustments ?? []).reduce((sum, a) => {
    const monthly = a.frequency === 'semesterly' ? (a.amount || 0) / 6
      : a.frequency === 'annually' ? (a.amount || 0) / 12
      : (a.amount || 0);
    return sum + monthly;
  }, 0);
  const grossMonthly = roundToNickel(grossMonthlyPure + adjustmentsTotal);
  // Gross monthly WITH 13th + complements = G6 + adjustments
  const grossMonthlyWith13AndAdjustments = roundToNickel(grossMonthlyWith13 + adjustmentsTotal);
  // Salaire annuel = (mensuel13 + compléments) × 12 — same basis as gross100Annual
  const grossAnnualWithout13 = roundToNickel(grossMonthlyWith13AndAdjustments * 12);

  // Net computed on the FULL gross with 13th + complements
  const netFactor = 1 - safeConfig.socialChargesRate;
  const grossForNet = grossMonthlyWith13 + adjustmentsTotal;
  const netMonthlyWith13 = roundToNickel(grossForNet * netFactor);
  // Net monthly without 13th = netMonthlyWith13 / 13 × 12
  const netMonthly = roundToNickel(netMonthlyWith13 / 13 * 12);
  const netAnnual = roundToNickel(netMonthly * 13);

  // Coût employeur = salaire annuel × facteur de coût
  
  const expenseFactor = safeConfig.expenseFactor ?? 1;
  const employerCostAnnual = roundToNickel(grossAnnualWithout13 * expenseFactor);
  const employerCostMonthly = roundToNickel(employerCostAnnual / 12);

  return {
    baseSalary: base,
    dimensionSteps: dimSteps,
    gross100: roundToNickel(gross100),
    gross100Annual,
    gross100Hourly,
    grossMonthlyWith13,
    grossAnnual,
    grossMonthlyPure,
    grossMonthlyWith13AndAdjustments,
    grossMonthly,
    netMonthlyWith13,
    netMonthly,
    netAnnual,
    grossAnnualWithout13,
    employerCostMonthly,
    employerCostAnnual,
    ageBracketSteps: ageSteps,
  };
};

export const computeAllSalaries = (
  board: SalaryBoardEntity
): Array<{ employee: SalaryEmployee; computation: SalaryComputation }> => {
  return board.employees
    .filter(e => !e._simHidden)
    .map(employee => ({
    employee,
    computation: computeSalary(board.config, board.dimensions, employee),
  }));
};

export const aggregateSalaries = (
  board: SalaryBoardEntity
): {
  totalGrossMonthly: number;
  totalGrossMonthlyWith13AndAdjustments: number;
  totalGrossAnnual: number;
  totalNetMonthly: number;
  totalNetMonthlyWith13: number;
  totalNetAnnual: number;
  totalEmployerCostMonthly: number;
  totalEmployerCostAnnual: number;
  headcount: number;
  fte: number;
} => {
  const rows = computeAllSalaries(board);
  let totalGrossMonthly = 0;
  let totalGrossMonthlyWith13AndAdjustments = 0;
  let totalGrossAnnual = 0;
  let totalNetMonthly = 0;
  let totalNetMonthlyWith13 = 0;
  let totalNetAnnual = 0;
  let totalEmployerCostMonthly = 0;
  let totalEmployerCostAnnual = 0;
  let fte = 0;
  for (const { employee, computation } of rows) {
    totalGrossMonthly += computation.grossMonthly;
    totalGrossMonthlyWith13AndAdjustments += computation.grossMonthlyWith13AndAdjustments;
    totalGrossAnnual += computation.grossAnnualWithout13;
    totalNetMonthly += computation.netMonthly;
    totalNetMonthlyWith13 += computation.netMonthlyWith13;
    totalNetAnnual += computation.netAnnual;
    totalEmployerCostMonthly += computation.employerCostMonthly;
    totalEmployerCostAnnual += computation.employerCostAnnual;
    fte += employee.workload / 100;
  }
  return {
    totalGrossMonthly: roundToNickel(totalGrossMonthly),
    totalGrossMonthlyWith13AndAdjustments: roundToNickel(totalGrossMonthlyWith13AndAdjustments),
    totalGrossAnnual: roundToNickel(totalGrossAnnual),
    totalNetMonthly: roundToNickel(totalNetMonthly),
    totalNetMonthlyWith13: roundToNickel(totalNetMonthlyWith13),
    totalNetAnnual: roundToNickel(totalNetAnnual),
    totalEmployerCostMonthly: roundToNickel(totalEmployerCostMonthly),
    totalEmployerCostAnnual: roundToNickel(totalEmployerCostAnnual),
    headcount: board.employees.filter(e => !e._simHidden).length,
    fte: Math.round(fte * 100) / 100,
  };
};

export const formatCurrency = (value: number, currency = 'CHF'): string => {
  // Match golden standard: 2 decimals always (e.g. "CHF 4 836.00", "CHF 3 750.45")
  const safe = Number.isFinite(value) ? value : 0;
  return `${currency} ${safe.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ---------- Budget ----------

export interface BudgetComputation {
  revenues: number;
  charges: number;
  reserve: number;
  /** Total cost = charges + reserve (+ brutto salaries in manual mode).
   *  This is what gets subtracted from revenues to get the balance. */
  totalCost: number;
  /** Balance = revenues − totalCost. Positive = surplus, negative = deficit. */
  balance: number;
  /** Whether the budget is balanced (balance >= 0). */
  isBalanced: boolean;
}

export const computeBudget = (
  board: SalaryBoardEntity,
  scenario: SalaryBudgetScenario
): BudgetComputation => {
  const totals = aggregateSalaries(board);
  const step = board.config.roundingStep ?? 5;

  // Two exclusive modes:
  //  - 'manual':        charges = non-salary costs entered by user (rent, lab, etc.).
  //                     Total cost = charges + reserve + brutto salaries.
  //                     Balance = revenues − (charges + reserve + brutto).
  //  - 'expenseFactor': charges = brutto annual × expenseFactor (covers salaries + employer costs).
  //                     Total cost = charges + reserve.
  //                     Balance = revenues − (charges + reserve).
  let charges: number;
  let totalCost: number;
  if (scenario.chargesMode === 'expenseFactor') {
    const factor = scenario.expenseFactorOverride ?? board.config.expenseFactor ?? 1;
    // Charges (frais) = overhead only (brut × (factor - 1)) + reserve
    charges = roundToNickel(totals.totalGrossAnnual * (factor - 1)) + scenario.reserve;
    // Total cost = salaires bruts + frais (always adds up)
    totalCost = totals.totalGrossAnnual + charges;
  } else {
    charges = scenario.charges;
    totalCost = charges + scenario.reserve + totals.totalGrossAnnual;
  }

  const balance = scenario.revenues - totalCost;

  return {
    revenues: roundToNickel(scenario.revenues),
    charges: roundToNickel(charges),
    reserve: roundToNickel(scenario.reserve),
    totalCost: roundToNickel(totalCost),
    balance: roundToNickel(balance),
    isBalanced: balance >= 0,
  };
};

// ---------- Single-shot simulator ----------
// Reuses computeSalary on a transient employee derived from slider/level inputs.

export const simulateSalary = (
  config: SalaryConfig,
  dimensions: SalaryDimension[],
  inputs: {
    workload: number;
    age: number;
    seniority: number;
    levels: SalaryEmployeeLevel[];
    employerAdjustments?: EmployerAdjustment[];
  }
): SalaryComputation => {
  const employee: SalaryEmployee = {
    id: 'sim',
    name: 'Simulation',
    workload: inputs.workload,
    age: inputs.age,
    seniority: inputs.seniority,
    levels: inputs.levels,
    employerAdjustments: inputs.employerAdjustments ?? [],
  };
  return computeSalary(config, dimensions, employee);
};

// ---------- Projection table ----------
// Builds projection rows: for a given profile, simulate the salary
// progression across N future years. Each year: seniority +1, age +1; if the
// employee crosses an age bracket threshold, an ageIncrease step is added.

export interface ProjectionRow {
  year: number;
  age: number;
  seniority: number;
  gross100: number;
  gross100Annual: number;
  gross100Hourly: number;
  grossMonthlyWith13: number;
  grossMonthlyPure: number;
  grossMonthlyWith13AndAdjustments: number;
  grossMonthly: number;
  grossAnnualWithout13: number;
  netMonthlyWith13: number;
  netMonthly: number;
  employerCostAnnual: number;
  /** Cumulative age-bracket steps reached so far. */
  ageBracketSteps: number;
}

export const buildProjection = (
  config: SalaryConfig,
  dimensions: SalaryDimension[],
  employee: SalaryEmployee,
  years: number
): ProjectionRow[] => {
  const rows: ProjectionRow[] = [];
  for (let y = 0; y <= years; y++) {
    const projectedEmployee: SalaryEmployee = {
      ...employee,
      age: employee.age + y,
      seniority: employee.seniority + y,
    };
    const computation = computeSalary(config, dimensions, projectedEmployee);
    rows.push({
      year: y,
      age: projectedEmployee.age,
      seniority: projectedEmployee.seniority,
      gross100: computation.gross100,
      gross100Annual: computation.gross100Annual,
      gross100Hourly: computation.gross100Hourly,
      grossMonthlyWith13: computation.grossMonthlyWith13,
      grossMonthlyPure: computation.grossMonthlyPure,
      grossMonthlyWith13AndAdjustments: computation.grossMonthlyWith13AndAdjustments,
      grossMonthly: computation.grossMonthly,
      grossAnnualWithout13: computation.grossAnnualWithout13,
      netMonthlyWith13: computation.netMonthlyWith13,
      netMonthly: computation.netMonthly,
      employerCostAnnual: computation.employerCostAnnual,
      ageBracketSteps: computation.ageBracketSteps,
    });
  }
  return rows;
};

// Golden-standard defaults for the transparent salary system

// Used as a starting point when no board exists.
export const DEFAULT_SALARY_CONFIG: SalaryConfig = {
  indexHourlyWage: 24.59,
  hoursPerWeek: 40,
  weeksPerMonth: 4.33333333333333,
  seniorityIncrease: 0.01,
  ageIncrease: 0.05,
  ageBrackets: [25, 35, 45, 55, 65],
  socialChargesRate: 0.1202,
  expenseFactor: 1.80,
  include13thSalary: false,
  hoursPerDay: 8,
  daysPerWeek: 5,
  roundingStep: 5,
  currency: 'CHF',
  label: 'Système de salaires transparents',
};

export const DEFAULT_SALARY_BUDGET_SCENARIOS: SalaryBudgetScenario[] = [
  {
    id: 'min',
    name: 'Min (revenus min − charges max)',
    revenues: 2_111_600,
    charges: 1_063_000,
    reserve: 100_000,
    chargesMode: 'manual',
  },
  {
    id: 'intermediate',
    name: 'Intermédiaire',
    revenues: 2_709_000,
    charges: 950_000,
    reserve: 100_000,
    chargesMode: 'manual',
  },
  {
    id: 'max',
    name: 'Max (revenus max − charges min)',
    revenues: 3_315_400,
    charges: 841_500,
    reserve: 100_000,
    chargesMode: 'manual',
  },
];

export const DEFAULT_SALARY_DIMENSIONS: SalaryDimension[] = [
  {
    id: 'expertise',
    name: 'Expertise',
    stepValue: 390,
    maxLevel: 6,
    color: '#729FCF',
    affectsSalary: true,
    levelDescriptions: [
      "Aucune expertise dans la fonction principale. Apprenti ou changement de carrière radical.",
      "Connaissances de base, débutant. Capable de travailler sous supervision.",
      "Maîtrise du rôle principal, autonome. Bonne capacité à acquérir le savoir-faire de l'équipe.",
      "Personne de référence (expert) dans un ou plusieurs domaines. Source d'information pour les collègues.",
      "Pionnier-ère qui mène des recherches, élabore des preuves de concept et apporte de nouvelles connaissances.",
      "Niveau Maîtrise de l'ensemble de l'architecture. Expertise exceptionnelle reconnue dans l'organisation.",
      "Crée de nouveaux modèles d'organisation et d'outils largement utilisés par les équipes internes ou externes à l'entreprise. Référence reconnue dans le domaine.",
    ],
  },
  {
    id: 'impact',
    name: 'Impact',
    stepValue: 390,
    maxLevel: 6,
    color: '#FACC15',
    affectsSalary: true,
    levelDescriptions: [
      "Mobilise davantage de ressources que de résultats. En formation, besoin de soutien.",
      "Impact limité, principalement individuel.",
      "Impact occasionnel sur les collègues ou d'autres sous-systèmes.",
      "Pilier de l'équipe, impact sur l'ensemble du cercle.",
      "Impact étendu à d'autres domaines de l'organisation. Influenceur transversal.",
      "Impact indéniable sur l'ensemble de l'entreprise à court terme.",
      "Impact à long terme et portée étendue. Représente l'organisation à l'extérieur.",
    ],
  },
];

export const createDefaultSalaryBoard = (): SalaryBoardEntity => ({
  config: { ...DEFAULT_SALARY_CONFIG },
  dimensions: DEFAULT_SALARY_DIMENSIONS.map(d => ({ ...d, levelDescriptions: [...(d.levelDescriptions ?? [])] })),
  employees: [],
  budget: {
    scenarios: [],
    activeScenarioId: undefined,
  },
  updatedAt: new Date().toISOString(),
});