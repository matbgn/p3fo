import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  initState,
  recordBatch,
  selectNextBatch,
} from '../../src/lib/pl-prioritization';
import {
  decisionsToReach,
  runBtAllPairs,
  runBtEngine,
  runCondorcet,
  type EngineResult,
} from './engines';
import {
  bootstrapMeanCI,
  ci95HalfWidth,
  coefficientOfVariation,
  firstReach,
  kendallTau,
  mean,
  meanPairwiseTau,
  meanTop3Agreement,
  median,
  quantile,
  samplesForHalfWidth,
  sd,
  share,
  tauAtBudget,
  top1Agreement,
  topKPrecision,
  type ConfidenceInterval,
} from './metrics';
import { hashStringToSeed, mulberry32 } from './rng';
import {
  makeWorld,
  type StrengthProfile,
  type UserModel,
} from './synthetic';

type EngineKey = 'bt3' | 'bt2' | 'condorcet' | 'btAllPairs';

const MIN_DECISION_REDUCTION = 0.2;

interface SeedRow {
  seed: number;
  bt3: EngineResult;
  bt2: EngineResult;
  condorcet: EngineResult;
  btAllPairs: EngineResult;
}

interface Aggregate {
  engine: string;
  decisionsMean: number;
  decisionsMedian: number;
  decisionsP5: number;
  decisionsP95: number;
  tauMean: number;
  tauMedian: number;
  tauP5: number;
  tauP95: number;
  inversionsMean: number;
  latentTauMean: number;
  top1Mean: number;
  top3Mean: number;
  batchesMean: number;
  batchesMedian: number;
  pairwiseMean: number;
  engineMsMedian: number;
  engineMsP95: number;
  firstReach95Rate: number;
  firstReach95Median: number | null;
  tauAtBudgets: number[];
  decisionsSd: number;
  decisionsCv: number;
  decisionsCi95HalfWidth: number;
  tauSd: number;
  tauCv: number;
  tauCi95HalfWidth: number;
  firstReachSd: number | null;
  firstReachCv: number | null;
  seedCountForTauHalfWidth01: number | null;
  seedCountForDecisionsHalfWidth5: number | null;
  meanRankFlips: number;
  meanLateRankFlips: number;
  meanStableTail: number;
  top1ChangeRate: number;
  meanLateTop1Changes: number;
  meanTop3Churn: number;
  confidenceGapMean: number;
  tauBelow95Rate: number;
  tauBelow90Rate: number;
  doneRate: number;
  stopReasons: Record<string, number>;
}

interface BootstrapStability {
  iterations: number;
  efficiencyPassRate: number;
  exactnessPassRate: number;
}

interface TestRetestEngine {
  meanTau: number;
  sdTau: number;
  meanPairwiseTau: number | null;
  top1Agreement: number | null;
  top3Agreement: number | null;
  meanDecisions: number;
  sdDecisions: number;
}

interface TestRetestStability {
  replicates: number;
  strengthSeed: number;
  btK3: TestRetestEngine;
  condorcet: TestRetestEngine;
}

interface PairedStats {
  left: EngineKey;
  right: EngineKey;
  deltaDecisions: ConfidenceInterval;
  deltaTau: ConfidenceInterval;
  deltaLatentTau: ConfidenceInterval;
  deltaTauAtBudgets: ConfidenceInterval[];
  deltaFirstReach95: ConfidenceInterval | null;
  breakEvenDecisionCostMedian: number | null;
  breakEvenDecisionCostP5: number | null;
  breakEvenDecisionCostP95: number | null;
  shareLeftFewerDecisions: number;
  shareTauNonInferior: number;
  leftFirstReach95Rate: number;
  rightFirstReach95Rate: number;
  medianFirstReach95Left: number | null;
  medianFirstReach95Right: number | null;
  shareLeftFasterTo95: number;
}

interface VerdictCheck {
  category: 'efficiency' | 'exactness';
  label: string;
  pass: boolean;
  detail: string;
}

interface ScenarioReport {
  strengthProfile: StrengthProfile;
  userModel: UserModel;
  noise: number;
  primary: boolean;
  engines: Record<EngineKey, Aggregate>;
  vsCondorcetBt3: PairedStats;
  vsCondorcetBt2: PairedStats;
  bt3VsBt2: PairedStats;
  verdict: {
    passed: boolean;
    efficiencyPassed: boolean;
    exactnessPassed: boolean;
    checks: VerdictCheck[];
  };
  k2Recommendation: {
    dropBtOnK2Supported: boolean;
    detail: string;
  };
  stability: {
    bootstrap: BootstrapStability;
    testRetest: TestRetestStability | null;
  };
}

interface HarnessArgs {
  n: number;
  k: number;
  seeds: number;
  threshold: number;
  strengthProfiles: StrengthProfile[];
  userModels: UserModel[];
  noiseLevels: number[];
  outDir: string;
  selfTest: boolean;
  stabilityReplicates: number;
  stabilitySeed: number;
}

function engineLabel(key: EngineKey, k: number): string {
  switch (key) {
    case 'bt3':
      return `BT k=${k}`;
    case 'bt2':
      return 'BT k=2';
    case 'condorcet':
      return 'Condorcet all-pairs';
    case 'btAllPairs':
      return 'BT all-pairs control';
  }
}

function parseList<T extends string>(value: string, allowed: readonly T[]): T[] {
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) as T[];
  for (const item of parsed) {
    if (!allowed.includes(item)) {
      throw new Error(`Unsupported value "${item}". Allowed: ${allowed.join(', ')}`);
    }
  }
  return parsed;
}

function parseArgs(argv: string[]): HarnessArgs {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const args: HarnessArgs = {
    n: 20,
    k: 3,
    seeds: 100,
    threshold: 0.95,
    strengthProfiles: ['even', 'normal'],
    userModels: ['consistent', 'query-normal'],
    noiseLevels: [0, 0.5, 1],
    outDir: resolve('bench/results', `pl-harness-${timestamp}`),
    selfTest: true,
    stabilityReplicates: 0,
    stabilitySeed: 1,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === '--') continue;
    if (!raw.startsWith('--')) continue;
    const [key, inlineValue] = raw.slice(2).split('=');
    const value = inlineValue ?? argv[++i];
    if (value === undefined) throw new Error(`Missing value for --${key}`);

    switch (key) {
      case 'n':
        args.n = Number(value);
        break;
      case 'k':
        args.k = Number(value);
        break;
      case 'seeds':
        args.seeds = Number(value);
        break;
      case 'threshold':
        args.threshold = Number(value);
        break;
      case 'profiles':
        args.strengthProfiles = parseList(value, ['even', 'normal', 'clustered', 'near-ties'] as const);
        break;
      case 'models':
        args.userModels = parseList(value, ['consistent', 'consistent-noisy', 'query-normal', 'query-bt'] as const);
        break;
      case 'noise':
        args.noiseLevels = value.split(',').map((item) => Number(item.trim()));
        break;
      case 'out':
        args.outDir = resolve(value);
        break;
      case 'no-self-test':
        args.selfTest = false;
        break;
      case 'stability-replicates':
        args.stabilityReplicates = Number(value);
        break;
      case 'stability-seed':
        args.stabilitySeed = Number(value);
        break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }

  if (!Number.isInteger(args.n) || args.n < 2) throw new Error('--n must be an integer >= 2');
  if (!Number.isInteger(args.k) || args.k < 2) throw new Error('--k must be an integer >= 2');
  if (!Number.isInteger(args.seeds) || args.seeds < 1) throw new Error('--seeds must be >= 1');
  if (args.noiseLevels.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('--noise must be a comma-separated list of non-negative numbers');
  }
  if (!Number.isInteger(args.stabilityReplicates) || args.stabilityReplicates < 0) {
    throw new Error('--stability-replicates must be an integer >= 0');
  }
  if (!Number.isInteger(args.stabilitySeed)) {
    throw new Error('--stability-seed must be an integer');
  }
  return args;
}

function getResult(row: SeedRow, key: EngineKey): EngineResult {
  return row[key];
}

function aggregateResults(
  rows: SeedRow[],
  key: EngineKey,
  threshold: number,
  budgets: number[],
  k: number,
): Aggregate {
  const results = rows.map((row) => getResult(row, key));
  const decisions = results.map((result) => result.decisions);
  const taus = results.map((result) => result.tau);
  const latentTaus = results.map((result) => result.latentTau);
  const top1s = results.map((result) => result.top1);
  const top3s = results.map((result) => result.top3);
  const batches = results.map((result) => result.batches);
  const pairwise = results.map((result) => result.pairwise);
  const engineMs = results.map((result) => result.engineMs);
  const firstReaches = results
    .map((result) => firstReach(result.trace, threshold))
    .filter((value): value is number => value !== null);
  const stopReasons: Record<string, number> = {};
  for (const result of results) {
    stopReasons[result.stopReason] = (stopReasons[result.stopReason] ?? 0) + 1;
  }
  const tauAtBudgets = budgets.map((budget) =>
    mean(results.map((result) => tauAtBudget(result.trace, budget))),
  );
  const inversions = results.map(
    (result) =>
      ((1 - result.tau) * result.finalOrder.length * (result.finalOrder.length - 1)) / 2,
  );
  const decisionsSd = sd(decisions);
  const tauSd = sd(taus);
  const firstReachSd = firstReaches.length >= 2 ? sd(firstReaches) : null;

  return {
    engine: engineLabel(key, k),
    decisionsMean: mean(decisions),
    decisionsMedian: median(decisions),
    decisionsP5: quantile(decisions, 0.05),
    decisionsP95: quantile(decisions, 0.95),
    tauMean: mean(taus),
    tauMedian: median(taus),
    tauP5: quantile(taus, 0.05),
    tauP95: quantile(taus, 0.95),
    inversionsMean: mean(inversions),
    latentTauMean: mean(latentTaus),
    top1Mean: mean(top1s),
    top3Mean: mean(top3s),
    batchesMean: mean(batches),
    batchesMedian: median(batches),
    pairwiseMean: mean(pairwise),
    engineMsMedian: median(engineMs),
    engineMsP95: quantile(engineMs, 0.95),
    firstReach95Rate: firstReaches.length / results.length,
    firstReach95Median: firstReaches.length > 0 ? median(firstReaches) : null,
    tauAtBudgets,
    decisionsSd,
    decisionsCv: coefficientOfVariation(decisions),
    decisionsCi95HalfWidth: ci95HalfWidth(decisions),
    tauSd,
    tauCv: coefficientOfVariation(taus),
    tauCi95HalfWidth: ci95HalfWidth(taus),
    firstReachSd,
    firstReachCv:
      firstReachSd === null || firstReaches.length === 0
        ? null
        : firstReachSd / Math.abs(mean(firstReaches)),
    seedCountForTauHalfWidth01: samplesForHalfWidth(taus, 0.01),
    seedCountForDecisionsHalfWidth5: samplesForHalfWidth(decisions, 5),
    meanRankFlips: mean(results.map((result) => result.totalRankFlips)),
    meanLateRankFlips: mean(results.map((result) => result.lateRankFlips)),
    meanStableTail: mean(results.map((result) => result.stableTail)),
    top1ChangeRate: mean(results.map((result) => (result.top1Changes > 0 ? 1 : 0))),
    meanLateTop1Changes: mean(results.map((result) => result.lateTop1Changes)),
    meanTop3Churn: mean(results.map((result) => result.top3Churn)),
    confidenceGapMean: mean(results.map((result) => result.confidenceGap)),
    tauBelow95Rate: mean(results.map((result) => (result.tauBelow95 ? 1 : 0))),
    tauBelow90Rate: mean(results.map((result) => (result.tauBelow90 ? 1 : 0))),
    doneRate: mean(results.map((result) => (result.done ? 1 : 0))),
    stopReasons,
  };
}

function pairedStats(
  rows: SeedRow[],
  left: EngineKey,
  right: EngineKey,
  threshold: number,
  budgets: number[],
): PairedStats {
  const leftResults = rows.map((row) => getResult(row, left));
  const rightResults = rows.map((row) => getResult(row, right));

  const deltaDecisions = leftResults.map((result, index) => result.decisions - rightResults[index].decisions);
  const deltaTau = leftResults.map((result, index) => result.tau - rightResults[index].tau);
  const deltaLatentTau = leftResults.map(
    (result, index) => result.latentTau - rightResults[index].latentTau,
  );

  const deltaTauAtBudgets = budgets.map((budget) => {
    const diffs = leftResults.map(
      (result, index) =>
        tauAtBudget(result.trace, budget) - tauAtBudget(rightResults[index].trace, budget),
    );
    return bootstrapMeanCI(diffs, `${left}-${right}-budget-${budget}`);
  });

  const breakEvenValid = mean(leftResults.map((result) => result.decisions)) <
    mean(rightResults.map((result) => result.decisions));
  const breakEven = leftResults
    .map((result, index) => (result.decisions > 0 ? rightResults[index].decisions / result.decisions : null))
    .filter((value): value is number => value !== null);

  const firstReachPairs = leftResults
    .map((result, index) => ({
      left: firstReach(result.trace, threshold),
      right: firstReach(rightResults[index].trace, threshold),
    }))
    .filter(
      (pair): pair is { left: number; right: number } =>
        pair.left !== null && pair.right !== null,
    );
  const firstReachDiffs = firstReachPairs.map((pair) => pair.left - pair.right);

  return {
    left,
    right,
    deltaDecisions: bootstrapMeanCI(deltaDecisions, `${left}-${right}-decisions`),
    deltaTau: bootstrapMeanCI(deltaTau, `${left}-${right}-tau`),
    deltaLatentTau: bootstrapMeanCI(deltaLatentTau, `${left}-${right}-latent-tau`),
    deltaTauAtBudgets,
    deltaFirstReach95:
      firstReachDiffs.length > 0
        ? bootstrapMeanCI(firstReachDiffs, `${left}-${right}-first-reach`)
        : null,
    breakEvenDecisionCostMedian:
      breakEvenValid && breakEven.length > 0 ? median(breakEven) : null,
    breakEvenDecisionCostP5:
      breakEvenValid && breakEven.length > 0 ? quantile(breakEven, 0.05) : null,
    breakEvenDecisionCostP95:
      breakEvenValid && breakEven.length > 0 ? quantile(breakEven, 0.95) : null,
    shareLeftFewerDecisions: share(deltaDecisions, (value) => value < 0),
    shareTauNonInferior: share(deltaTau, (value) => value >= -0.02),
    leftFirstReach95Rate: firstReachPairs.length / rows.length,
    rightFirstReach95Rate: firstReachPairs.length / rows.length,
    medianFirstReach95Left:
      firstReachPairs.length > 0 ? median(firstReachPairs.map((pair) => pair.left)) : null,
    medianFirstReach95Right:
      firstReachPairs.length > 0 ? median(firstReachPairs.map((pair) => pair.right)) : null,
    shareLeftFasterTo95:
      firstReachPairs.length > 0
        ? share(
            firstReachDiffs,
            (value) => value <= 0,
          )
        : 0,
  };
}

function bootstrapVerdictStability(
  rows: SeedRow[],
  threshold: number,
  budgets: number[],
  seedKey: string,
  iterations = 1000,
): BootstrapStability {
  const rng = mulberry32(hashStringToSeed(`verdict:${seedKey}`));
  const midBudget = budgets[1] ?? Math.round((budgets[budgets.length - 1] ?? 1) / 2);
  let efficiencyPass = 0;
  let exactnessPass = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample: SeedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      sample.push(rows[Math.floor(rng() * rows.length)]);
    }
    const bt = sample.map((row) => row.bt3);
    const cond = sample.map((row) => row.condorcet);

    const ratio = mean(bt.map((result) => result.decisions)) /
      mean(cond.map((result) => result.decisions));
    const deltaTau = mean(bt.map((result, index) => result.tau - cond[index].tau));
    const breakEven = bt
      .map((result, index) =>
        result.decisions > 0 ? cond[index].decisions / result.decisions : null,
      )
      .filter((value): value is number => value !== null);
    const breakEvenMedian = breakEven.length > 0 ? median(breakEven) : 0;
    const deltaBudget = mean(
      bt.map(
        (result, index) =>
          tauAtBudget(result.trace, midBudget) - tauAtBudget(cond[index].trace, midBudget),
      ),
    );
    const firstDiffs = bt
      .map((result, index) => {
        const left = firstReach(result.trace, threshold);
        const right = firstReach(cond[index].trace, threshold);
        return left !== null && right !== null ? left - right : null;
      })
      .filter((value): value is number => value !== null);
    const firstReachPass = firstDiffs.length === 0 || mean(firstDiffs) <= 0;

    const efficiency =
      ratio <= 1 - MIN_DECISION_REDUCTION &&
      breakEvenMedian >= 1.2 &&
      deltaBudget >= -0.02 &&
      firstReachPass;
    if (efficiency) efficiencyPass++;
    if (deltaTau >= -0.03) exactnessPass++;
  }

  return {
    iterations,
    efficiencyPassRate: efficiencyPass / iterations,
    exactnessPassRate: exactnessPass / iterations,
  };
}

function aggregateReplicates(results: EngineResult[]): TestRetestEngine {
  const taus = results.map((result) => result.tau);
  const orders = results.map((result) => result.finalOrder);
  return {
    meanTau: mean(taus),
    sdTau: sd(taus),
    meanPairwiseTau: meanPairwiseTau(orders),
    top1Agreement: top1Agreement(orders),
    top3Agreement: meanTop3Agreement(orders),
    meanDecisions: mean(results.map((result) => result.decisions)),
    sdDecisions: sd(results.map((result) => result.decisions)),
  };
}

function runTestRetest(
  args: HarnessArgs,
  profile: StrengthProfile,
  model: UserModel,
  noise: number,
): TestRetestStability {
  const btResults: EngineResult[] = [];
  const condResults: EngineResult[] = [];

  for (let responseSeed = 1; responseSeed <= args.stabilityReplicates; responseSeed++) {
    const btWorld = makeWorld(
      args.n,
      args.stabilitySeed,
      profile,
      model,
      noise,
      args.stabilitySeed,
      responseSeed,
    );
    btResults.push(runBtEngine(btWorld, args.k, `bt-k${args.k}-retest`));

    const condWorld = makeWorld(
      args.n,
      args.stabilitySeed,
      profile,
      model,
      noise,
      args.stabilitySeed,
      responseSeed,
    );
    condResults.push(runCondorcet(condWorld, responseSeed, 'condorcet-retest'));
  }

  return {
    replicates: args.stabilityReplicates,
    strengthSeed: args.stabilitySeed,
    btK3: aggregateReplicates(btResults),
    condorcet: aggregateReplicates(condResults),
  };
}

function evaluateScenario(
  profile: StrengthProfile,
  model: UserModel,
  noise: number,
  engines: Record<EngineKey, Aggregate>,
  vsCondorcetBt3: PairedStats,
  vsCondorcetBt2: PairedStats,
  bt3VsBt2: PairedStats,
  threshold: number,
  budgets: number[],
  rows: SeedRow[],
  testRetest: TestRetestStability | null,
): ScenarioReport {
  const primary = model === 'consistent' && noise <= 0.5;
  const decisionRatio = engines.bt3.decisionsMean / engines.condorcet.decisionsMean;
  const midBudget = budgets[1] ?? Math.round(budgets[budgets.length - 1] / 2);
  const checks: VerdictCheck[] = [
    {
      category: 'efficiency',
      label: `BT k=3 uses at least ${(MIN_DECISION_REDUCTION * 100).toFixed(0)}% fewer decisions than full Condorcet`,
      pass: decisionRatio <= 1 - MIN_DECISION_REDUCTION,
      detail: `${engines.bt3.decisionsMean.toFixed(1)} vs ${engines.condorcet.decisionsMean.toFixed(1)} decisions (${(
        (1 - decisionRatio) * 100
      ).toFixed(1)}% fewer)`,
    },
    {
      category: 'exactness',
      label: 'BT k=3 accuracy is non-inferior to Condorcet (95% CI lower bound of Δτ >= -0.03)',
      pass: vsCondorcetBt3.deltaTau.lower >= -0.03,
      detail: `Δτ = ${vsCondorcetBt3.deltaTau.mean.toFixed(4)} [${vsCondorcetBt3.deltaTau.lower.toFixed(
        4,
      )}, ${vsCondorcetBt3.deltaTau.upper.toFixed(4)}]`,
    },
    {
      category: 'efficiency',
      label: 'BT k=3 remains faster even if a batch decision costs 20% more',
      pass: (vsCondorcetBt3.breakEvenDecisionCostMedian ?? 0) >= 1.2,
      detail:
        vsCondorcetBt3.breakEvenDecisionCostMedian === null
          ? 'n/a (BT k=3 does not use fewer decisions than Condorcet in this scenario)'
          : `break-even decision cost ratio = ${fmt(
              vsCondorcetBt3.breakEvenDecisionCostMedian,
              2,
            )}x`,
    },
    {
      category: 'efficiency',
      label: `BT k=3 τ is non-inferior at the ${midBudget}-decision budget (95% CI lower bound of Δτ >= -0.02)`,
      pass: (vsCondorcetBt3.deltaTauAtBudgets[1]?.lower ?? -1) >= -0.02,
      detail: `Δτ@${midBudget} = ${fmt(
        vsCondorcetBt3.deltaTauAtBudgets[1]?.mean ?? null,
        4,
      )} [${fmt(vsCondorcetBt3.deltaTauAtBudgets[1]?.lower ?? null, 4)}, ${fmt(
        vsCondorcetBt3.deltaTauAtBudgets[1]?.upper ?? null,
        4,
      )}]`,
    },
    {
      category: 'efficiency',
      label: `BT k=3 reaches τ >= ${threshold} earlier than partial Condorcet (paired 95% CI of Δdecisions < 0)`,
      pass:
        vsCondorcetBt3.deltaFirstReach95 === null ||
        vsCondorcetBt3.deltaFirstReach95.upper < 0,
      detail:
        vsCondorcetBt3.deltaFirstReach95 === null
          ? `n/a: no paired seed reached τ>=${threshold}; the fixed-budget check above covers convergence instead`
          : `Δdecisions to τ>=${threshold}: ${fmt(
              vsCondorcetBt3.deltaFirstReach95.mean,
              1,
            )} [${fmt(vsCondorcetBt3.deltaFirstReach95.lower, 1)}, ${fmt(
              vsCondorcetBt3.deltaFirstReach95.upper,
              1,
            )}], median ${vsCondorcetBt3.medianFirstReach95Left ?? 'n/a'} vs ${
              vsCondorcetBt3.medianFirstReach95Right ?? 'n/a'
            }`,
    },
  ];

  const k2DropSupported =
    vsCondorcetBt2.deltaTau.lower < -0.03 || vsCondorcetBt2.shareTauNonInferior < 0.8;
  const efficiencyPassed = checks
    .filter((check) => check.category === 'efficiency')
    .every((check) => check.pass);
  const exactnessPassed = checks
    .filter((check) => check.category === 'exactness')
    .every((check) => check.pass);
  const bootstrap = bootstrapVerdictStability(
    rows,
    threshold,
    budgets,
    `${profile}:${model}:${noise}`,
  );

  return {
    strengthProfile: profile,
    userModel: model,
    noise,
    primary,
    engines,
    vsCondorcetBt3,
    vsCondorcetBt2,
    bt3VsBt2,
    verdict: {
      passed: efficiencyPassed && exactnessPassed,
      efficiencyPassed,
      exactnessPassed,
      checks,
    },
    stability: {
      bootstrap,
      testRetest,
    },
    k2Recommendation: {
      dropBtOnK2Supported: k2DropSupported,
      detail: k2DropSupported
        ? `BT k=2 is not non-inferior to Condorcet: Δτ = ${vsCondorcetBt2.deltaTau.mean.toFixed(
            4,
          )} [${vsCondorcetBt2.deltaTau.lower.toFixed(4)}, ${vsCondorcetBt2.deltaTau.upper.toFixed(
            4,
          )}], non-inferior seeds = ${(vsCondorcetBt2.shareTauNonInferior * 100).toFixed(1)}%`
        : `BT k=2 is statistically non-inferior to Condorcet: Δτ = ${vsCondorcetBt2.deltaTau.mean.toFixed(
            4,
          )} [${vsCondorcetBt2.deltaTau.lower.toFixed(4)}, ${vsCondorcetBt2.deltaTau.upper.toFixed(
            4,
          )}]`,
    },
  };
}

function selfTest(): void {
  const perfect = kendallTau(['a', 'b', 'c'], ['a', 'b', 'c']);
  const reversed = kendallTau(['c', 'b', 'a'], ['a', 'b', 'c']);
  if (perfect !== 1 || reversed !== -1) {
    throw new Error(`Metric self-test failed: perfect=${perfect}, reversed=${reversed}`);
  }

  const world = makeWorld(5, 42, 'even', 'consistent', 0);
  const condorcet = runCondorcet(world, 42);
  if (Math.abs(condorcet.tau - 1) > 1e-9) {
    throw new Error(`Condorcet self-test failed: tau=${condorcet.tau}`);
  }
  const bt3 = runBtEngine(world, 3, 'self-test-bt3');
  if (bt3.tau < 0.9) {
    throw new Error(`BT k=3 self-test failed: tau=${bt3.tau}`);
  }

  const worldA = makeWorld(20, 7, 'normal', 'consistent', 0.5);
  const worldB = makeWorld(20, 7, 'normal', 'consistent', 0.5);
  const runA = runBtEngine(worldA, 3, 'determinism-a');
  const runB = runBtEngine(worldB, 3, 'determinism-b');
  if (
    runA.decisions !== runB.decisions ||
    Math.abs(runA.tau - runB.tau) > 1e-12 ||
    runA.finalOrder.join(',') !== runB.finalOrder.join(',')
  ) {
    throw new Error('Determinism self-test failed: same seed produced different results');
  }

  const batchWorld = makeWorld(3, 11, 'even', 'consistent', 0);
  let state = initState(batchWorld.tasks, 3);
  const batch = selectNextBatch(state);
  if (!batch) throw new Error('Batch decomposition self-test failed: no batch');
  const ids = batch.tasks.map((task) => task.id);
  const ordered = batchWorld.order(ids);
  state = recordBatch(state, ordered[0], ordered[2], ids);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const wins = state.winMatrix[ordered[i]]?.[ordered[j]] ?? 0;
      if (wins < 1) {
        throw new Error(
          `Batch decomposition self-test failed: ${ordered[i]} should beat ${ordered[j]}`,
        );
      }
    }
  }

  const budgetTrace = [
    { cumulativeDecisions: 1, tau: 0.1 },
    { cumulativeDecisions: 2, tau: 0.9 },
  ];
  if (firstReach(budgetTrace, 0.8) !== 2) {
    throw new Error('firstReach self-test failed');
  }
}

function withoutTrace(result: EngineResult): Omit<EngineResult, 'trace'> {
  const { trace: _trace, ...rest } = result;
  return rest;
}

function fmt(value: number | null, digits = 2): string {
  return value === null ? 'n/a' : value.toFixed(digits);
}

function renderMarkdown(reports: ScenarioReport[], args: HarnessArgs): string {
  const lines: string[] = [];
  const totalPairs = (args.n * (args.n - 1)) / 2;
  const budgets = [0.25, 0.5, 0.75, 1].map((fraction) =>
    Math.max(1, Math.round(totalPairs * fraction)),
  );
  lines.push('# Plackett-Luce / Bradley-Terry harness report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Configuration');
  lines.push('');
  lines.push('```');
  lines.push(`items (n)        = ${args.n}`);
  lines.push(`batch size (k)   = ${args.k}`);
  lines.push(`seeds            = ${args.seeds}`);
  lines.push(`tau threshold    = ${args.threshold}`);
  lines.push(`strength profiles= ${args.strengthProfiles.join(', ')}`);
  lines.push(`user models      = ${args.userModels.join(', ')}`);
  lines.push(`noise levels     = ${args.noiseLevels.join(', ')}`);
  lines.push('```');
  lines.push('');
  lines.push('Definitions: a *decision* is one click (K=2: one click per pair; K=3: highest + lowest = 2 clicks).');
  lines.push('The *break-even decision cost* is Condorcet decisions / BT decisions: if it is 2.0, a K=3 click may cost twice as much as a Condorcet click and BT still wins on time.');
  lines.push('The *partial Condorcet* first-reach is the earliest point in the all-pairs trace where τ >= threshold; it is an optimistic lower bound for Condorcet because it ignores that pure Condorcet must still finish all pairs.');
  lines.push('');

  for (const report of reports) {
    lines.push(
      `## ${report.strengthProfile} / ${report.userModel} / noise=${report.noise}${
        report.primary ? ' (primary)' : ''
      }`,
    );
    lines.push('');
    lines.push(
      `| Engine | Decisions mean (median, p5–p95) | τ mean (p5) | Inversions | top-1 | top-3 | Batches | Pairwise | First τ≥${args.threshold} (rate / median) | Engine ms (median / p95) |`,
    );
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const key of ['condorcet', 'bt2', 'bt3', 'btAllPairs'] as EngineKey[]) {
      const aggregate = report.engines[key];
      lines.push(
        `| ${aggregate.engine} | ${fmt(aggregate.decisionsMean, 1)} (${fmt(
          aggregate.decisionsMedian,
          1,
        )}, ${fmt(aggregate.decisionsP5, 1)}–${fmt(aggregate.decisionsP95, 1)}) | ${fmt(
          aggregate.tauMean,
          3,
        )} (${fmt(aggregate.tauP5, 3)}) | ${fmt(aggregate.inversionsMean, 1)} | ${fmt(
          aggregate.top1Mean,
          3,
        )} | ${fmt(aggregate.top3Mean, 3)} | ${fmt(aggregate.batchesMean, 1)} | ${fmt(
          aggregate.pairwiseMean,
          1,
        )} | ${(
          aggregate.firstReach95Rate * 100
        ).toFixed(1)}% / ${fmt(aggregate.firstReach95Median, 1)} | ${fmt(
          aggregate.engineMsMedian,
          1,
        )} / ${fmt(aggregate.engineMsP95, 1)} |`,
      );
    }
    lines.push('');
    lines.push('τ at fixed decision budgets (mean over seeds):');
    lines.push('');
    lines.push(`| Engine | ${budgets.map((budget) => `${budget} decisions`).join(' | ')} |`);
    lines.push(`|---|${budgets.map(() => '---:').join('|')}|`);
    for (const key of ['condorcet', 'bt2', 'bt3', 'btAllPairs'] as EngineKey[]) {
      lines.push(
        `| ${report.engines[key].engine} | ${report.engines[key].tauAtBudgets
          .map((value) => fmt(value, 3))
          .join(' | ')} |`,
      );
    }
    lines.push('');
    lines.push('Stop reasons:');
    for (const key of ['condorcet', 'bt2', 'bt3', 'btAllPairs'] as EngineKey[]) {
      const reasons = Object.entries(report.engines[key].stopReasons)
        .map(([reason, count]) => `${reason}=${count}`)
        .join(', ');
      lines.push(`- ${report.engines[key].engine}: ${reasons || 'n/a'}`);
    }
    lines.push('');
    lines.push('Paired comparisons (same seeds):');
    lines.push('');
    lines.push(
      `| Comparison | Δ decisions [95% CI] | Δτ [95% CI] | Break-even cost (median, p5–p95) | BT fewer decisions | τ non-inferior | First τ≥${args.threshold}: BT vs Condorcet (median) | BT faster to τ≥${args.threshold} |`,
    );
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const paired of [report.vsCondorcetBt3, report.vsCondorcetBt2, report.bt3VsBt2]) {
      lines.push(
        `| ${engineLabel(paired.left, args.k)} vs ${engineLabel(paired.right, args.k)} | ${fmt(
          paired.deltaDecisions.mean,
          1,
        )} [${fmt(paired.deltaDecisions.lower, 1)}, ${fmt(paired.deltaDecisions.upper, 1)}] | ${fmt(
          paired.deltaTau.mean,
          4,
        )} [${fmt(paired.deltaTau.lower, 4)}, ${fmt(paired.deltaTau.upper, 4)}] | ${fmt(
          paired.breakEvenDecisionCostMedian,
          2,
        )} (${fmt(paired.breakEvenDecisionCostP5, 2)}–${fmt(
          paired.breakEvenDecisionCostP95,
          2,
        )}) | ${(paired.shareLeftFewerDecisions * 100).toFixed(1)}% | ${(
          paired.shareTauNonInferior * 100
        ).toFixed(1)}% | ${fmt(paired.medianFirstReach95Left, 1)} vs ${fmt(
          paired.medianFirstReach95Right,
          1,
        )} | ${(paired.shareLeftFasterTo95 * 100).toFixed(1)}% |`,
      );
    }
    lines.push('');
    lines.push('Verdict:');
    lines.push(
      `- Efficiency claim: ${report.verdict.efficiencyPassed ? 'PASS' : 'FAIL'} (fewer decisions / faster to high τ)`,
    );
    lines.push(
      `- Exactness claim: ${report.verdict.exactnessPassed ? 'PASS' : 'FAIL'} (final τ not materially worse than exhaustive Condorcet)`,
    );
    for (const check of report.verdict.checks) {
      lines.push(
        `  - ${check.pass ? 'PASS' : 'FAIL'} [${check.category}] — ${check.label}: ${check.detail}`,
      );
    }
    lines.push('');
    lines.push('Stability across seeds:');
    lines.push('');
    lines.push(
      '| Engine | Decisions SD (CV) | τ SD (CV) | 95% CI half-width (dec / τ) | Seeds for τ half-width 0.01 | First-reach SD (CV) |',
    );
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const key of ['condorcet', 'bt2', 'bt3', 'btAllPairs'] as EngineKey[]) {
      const aggregate = report.engines[key];
      lines.push(
        `| ${aggregate.engine} | ${fmt(aggregate.decisionsSd, 1)} (${fmt(
          aggregate.decisionsCv,
          3,
        )}) | ${fmt(aggregate.tauSd, 4)} (${fmt(aggregate.tauCv, 3)}) | ${fmt(
          aggregate.decisionsCi95HalfWidth,
          1,
        )} / ${fmt(aggregate.tauCi95HalfWidth, 4)} | ${fmt(
          aggregate.seedCountForTauHalfWidth01,
          0,
        )} | ${fmt(aggregate.firstReachSd, 1)} (${fmt(aggregate.firstReachCv, 3)}) |`,
      );
    }
    lines.push('');
    lines.push('Convergence / stop stability:');
    lines.push('');
    lines.push(
      '| Engine | Rank flips total / late | Stable tail (steps) | Top-1 change rate / late | Top-3 churn | Confidence gap | Stop τ<0.95 |',
    );
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const key of ['condorcet', 'bt2', 'bt3', 'btAllPairs'] as EngineKey[]) {
      const aggregate = report.engines[key];
      lines.push(
        `| ${aggregate.engine} | ${fmt(aggregate.meanRankFlips, 1)} / ${fmt(
          aggregate.meanLateRankFlips,
          1,
        )} | ${fmt(aggregate.meanStableTail, 1)} | ${(
          aggregate.top1ChangeRate * 100
        ).toFixed(1)}% / ${fmt(aggregate.meanLateTop1Changes, 2)} | ${fmt(
          aggregate.meanTop3Churn,
          1,
        )} | ${fmt(aggregate.confidenceGapMean, 3)} | ${(
          aggregate.tauBelow95Rate * 100
        ).toFixed(1)}% |`,
      );
    }
    lines.push('');
    const bootstrap = report.stability.bootstrap;
    const bootstrapEfficiencyStable = bootstrap.efficiencyPassRate >= 0.95;
    const bootstrapExactnessStable = bootstrap.exactnessPassRate >= 0.95;
    lines.push(
      `Bootstrap verdict stability (${bootstrap.iterations} resamples of point-estimate checks): efficiency PASS ${(
        bootstrap.efficiencyPassRate * 100
      ).toFixed(1)}% (${bootstrapEfficiencyStable ? 'STABLE' : 'FRAGILE'}), exactness PASS ${(
        bootstrap.exactnessPassRate * 100
      ).toFixed(1)}% (${bootstrapExactnessStable ? 'STABLE' : 'FRAGILE'}).`,
    );
    if (report.stability.testRetest) {
      const retest = report.stability.testRetest;
      lines.push('');
      lines.push(
        `Test-retest (strength/user seed ${retest.strengthSeed} fixed, ${retest.replicates} different response seeds):`,
      );
      lines.push('');
      lines.push(
        '| Engine | τ vs target mean (SD) | Pairwise τ across replicates | Top-1 agreement | Top-3 agreement | Decisions mean (SD) |',
      );
      lines.push('|---|---:|---:|---:|---:|---:|');
      for (const [label, engine] of [
        ['Condorcet all-pairs', retest.condorcet],
        [`BT k=${args.k}`, retest.btK3],
      ] as const) {
        lines.push(
          `| ${label} | ${fmt(engine.meanTau, 4)} (${fmt(engine.sdTau, 4)}) | ${fmt(
            engine.meanPairwiseTau,
            4,
          )} | ${fmt(engine.top1Agreement, 3)} | ${fmt(
            engine.top3Agreement,
            3,
          )} | ${fmt(engine.meanDecisions, 1)} (${fmt(engine.sdDecisions, 1)}) |`,
        );
      }
      const btPair = retest.btK3.meanPairwiseTau;
      const condPair = retest.condorcet.meanPairwiseTau;
      const retestStable =
        btPair === null ||
        (condPair === null ? btPair >= 0.75 : btPair >= condPair - 0.02);
      lines.push('');
      lines.push(
        `Test-retest stability: ${retestStable ? 'PASS' : 'FAIL'} (BT k=${args.k} pairwise τ ${
          btPair === null ? 'n/a' : btPair.toFixed(4)
        } vs Condorcet ${condPair === null ? 'n/a' : condPair.toFixed(4)}; criterion BT >= Condorcet - 0.02).`,
      );
    }
    lines.push('');
    lines.push(`K=2 decision: ${report.k2Recommendation.detail}`);
    lines.push('');
  }

  const primaryReports = reports.filter((report) => report.primary);
  const verdictReports = primaryReports.length > 0 ? primaryReports : reports;
  const scope =
    primaryReports.length > 0
      ? 'every primary scenario'
      : 'every exploratory scenario (no consistent-user primary scenario was selected)';
  const allEfficiency =
    verdictReports.length > 0 &&
    verdictReports.every((report) => report.verdict.efficiencyPassed);
  const allExactness =
    verdictReports.length > 0 &&
    verdictReports.every((report) => report.verdict.exactnessPassed);
  const maxExtraInversions = verdictReports.length
    ? Math.max(
        ...verdictReports.map(
          (report) => report.engines.bt3.inversionsMean - report.engines.condorcet.inversionsMean,
        ),
      )
    : 0;
  lines.push('## Overall verdict');
  lines.push('');
  if (allEfficiency && allExactness) {
    lines.push(
      `PASS: in ${scope}, BT k=3 used at least ${(MIN_DECISION_REDUCTION * 100).toFixed(0)}% fewer decisions than full Condorcet, was non-inferior in final τ and at the mid decision budget, stayed faster under a 20% batch-decision cost premium, and reached τ≥${args.threshold} earlier than partial Condorcet (or had no seed reach the threshold, in which case the fixed-budget check governs).`,
    );
  } else if (allEfficiency) {
    lines.push(
      `EFFICIENCY SUPPORTED, EXACTNESS TRADE-OFF: in ${scope}, BT k=3 used far fewer decisions and had better τ at the mid decision budget than exhaustive Condorcet. Final τ was lower in at least one scenario (on average at most ${maxExtraInversions.toFixed(
        1,
      )} extra inversion(s) out of ${totalPairs} pairs), so the data supports a faster-but-not-exactly-equal claim, not strict final-ranking equality.`,
    );
  } else {
    lines.push(
      'FAIL: at least one scenario did not show an efficiency advantage. The harness does not support the claim that BT k=3 is an improvement over pure Condorcet under these conditions.',
    );
  }
  const minBootstrapEfficiency = reports.length
    ? Math.min(...reports.map((report) => report.stability.bootstrap.efficiencyPassRate))
    : 0;
  const minBootstrapExactness = reports.length
    ? Math.min(...reports.map((report) => report.stability.bootstrap.exactnessPassRate))
    : 0;
  const retestValues = reports
    .map((report) => report.stability.testRetest?.btK3.meanPairwiseTau)
    .filter((value): value is number => typeof value === 'number');
  const minRetest = retestValues.length ? Math.min(...retestValues) : null;
  const retestDeltas = reports
    .map((report) => {
      const bt = report.stability.testRetest?.btK3.meanPairwiseTau;
      const cond = report.stability.testRetest?.condorcet.meanPairwiseTau;
      return typeof bt === 'number' && typeof cond === 'number' ? bt - cond : null;
    })
    .filter((value): value is number => typeof value === 'number');
  const minRetestDelta = retestDeltas.length ? Math.min(...retestDeltas) : null;
  const stabilityStable =
    minBootstrapEfficiency >= 0.95 &&
    minBootstrapExactness >= 0.95 &&
    (minRetestDelta === null || minRetestDelta >= -0.02);
  lines.push('');
  lines.push(
    `Stability (all tested scenarios): worst bootstrap efficiency pass rate = ${(
      minBootstrapEfficiency * 100
    ).toFixed(1)}%; worst exactness pass rate = ${(
      minBootstrapExactness * 100
    ).toFixed(1)}%; test-retest pairwise τ minimum = ${
      minRetest === null ? 'n/a' : minRetest.toFixed(3)
    }; worst BT−Condorcet Δ = ${
      minRetestDelta === null ? 'n/a' : minRetestDelta.toFixed(3)
    } — ${stabilityStable ? 'STABLE' : 'STABILITY CONCERN'}.`,
  );
  lines.push('');
  lines.push(
    'Note: this is a simulation under explicitly stated user models. It cannot prove a claim about all real users; it can falsify the claim and quantify the effect under the tested models.',
  );
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) selfTest();

  const totalPairs = (args.n * (args.n - 1)) / 2;
  const budgets = [0.25, 0.5, 0.75, 1].map((fraction) =>
    Math.max(1, Math.round(totalPairs * fraction)),
  );
  const reports: ScenarioReport[] = [];
  const perSeed: Array<{
    strengthProfile: StrengthProfile;
    userModel: UserModel;
    noise: number;
    seed: number;
    engines: Record<EngineKey, Omit<EngineResult, 'trace'>>;
    firstReach95: Record<EngineKey, number | null>;
  }> = [];

  for (const profile of args.strengthProfiles) {
    for (const model of args.userModels) {
      for (const noise of args.noiseLevels) {
        const rows: SeedRow[] = [];
        for (let seed = 1; seed <= args.seeds; seed++) {
          const makeFreshWorld = () => makeWorld(args.n, seed, profile, model, noise);
          const bt3 = runBtEngine(makeFreshWorld(), args.k, `bt-k${args.k}`);
          const bt2 = runBtEngine(makeFreshWorld(), 2, 'bt-k2');
          const condorcet = runCondorcet(makeFreshWorld(), seed, 'condorcet');
          const btAllPairs = runBtAllPairs(makeFreshWorld(), seed, 'bt-allpairs');
          const row: SeedRow = { seed, bt3, bt2, condorcet, btAllPairs };
          rows.push(row);

          perSeed.push({
            strengthProfile: profile,
            userModel: model,
            noise,
            seed,
            engines: {
              bt3: withoutTrace(bt3),
              bt2: withoutTrace(bt2),
              condorcet: withoutTrace(condorcet),
              btAllPairs: withoutTrace(btAllPairs),
            },
            firstReach95: {
              bt3: decisionsToReach(bt3, args.threshold),
              bt2: decisionsToReach(bt2, args.threshold),
              condorcet: decisionsToReach(condorcet, args.threshold),
              btAllPairs: decisionsToReach(btAllPairs, args.threshold),
            },
          });
        }

        const engines: Record<EngineKey, Aggregate> = {
          bt3: aggregateResults(rows, 'bt3', args.threshold, budgets, args.k),
          bt2: aggregateResults(rows, 'bt2', args.threshold, budgets, args.k),
          condorcet: aggregateResults(rows, 'condorcet', args.threshold, budgets, args.k),
          btAllPairs: aggregateResults(rows, 'btAllPairs', args.threshold, budgets, args.k),
        };
        const testRetest =
          args.stabilityReplicates > 0
            ? runTestRetest(args, profile, model, noise)
            : null;
        const report = evaluateScenario(
          profile,
          model,
          noise,
          engines,
          pairedStats(rows, 'bt3', 'condorcet', args.threshold, budgets),
          pairedStats(rows, 'bt2', 'condorcet', args.threshold, budgets),
          pairedStats(rows, 'bt3', 'bt2', args.threshold, budgets),
          args.threshold,
          budgets,
          rows,
          testRetest,
        );
        reports.push(report);

        console.log(
          [
            `${profile}/${model}/noise=${noise}`,
            `BT k=3: ${engines.bt3.decisionsMean.toFixed(0)} decisions, τ=${engines.bt3.tauMean.toFixed(3)}`,
            `Condorcet: ${engines.condorcet.decisionsMean.toFixed(0)} decisions, τ=${engines.condorcet.tauMean.toFixed(3)}`,
            `BT k=2: ${engines.bt2.decisionsMean.toFixed(0)} decisions, τ=${engines.bt2.tauMean.toFixed(3)}`,
            `verdict=${report.verdict.passed ? 'PASS' : 'FAIL'}`,
          ].join(' | '),
        );
      }
    }
  }

  const markdown = renderMarkdown(reports, args);
  const summary = {
    generatedAt: new Date().toISOString(),
    config: args,
    scenarios: reports,
    perSeed,
  };

  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(args.outDir, 'report.md'), markdown);

  console.log('');
  console.log(markdown);
  console.log(`Wrote ${join(args.outDir, 'report.md')}`);
  console.log(`Wrote ${join(args.outDir, 'summary.json')}`);
}

main();
