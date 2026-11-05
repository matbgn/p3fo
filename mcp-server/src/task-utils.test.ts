import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRecord } from './task-types.js';
import { renderCommentText } from './comment-text.js';
import { extractTicketNumber, rankTasks, scoreTask, similarityRatio } from './task-search.js';
import { sortTasksByMode } from './task-sorting.js';
import { buildPriorityAudit, buildTaskStats } from './task-audit.js';
import { applyBulkUpdates } from './bulk-update.js';
import { prepareTaskImport } from './import-tasks.js';
import { fetchTasksByIds } from './task-fetch.js';

const makeTask = (overrides: Partial<TaskRecord> & { id: string }): TaskRecord => ({
  title: overrides.id,
  createdAt: 1_700_000_000_000,
  triageStatus: 'Backlog',
  ...overrides,
});

describe('comment rendering', () => {
  it('renders BlockNote JSON as readable text', () => {
    const comment = JSON.stringify([
      { type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: 'Intention du client' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Commander un imprimeur d’étiquettes-gifts.' }],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'État d’avancement du développement' }],
      },
    ]);

    const text = renderCommentText(comment);
    assert.match(text ?? '', /### Intention du client/);
    assert.match(text ?? '', /Commander un imprimeur/);
    assert.match(text ?? '', /- État d’avancement/);
  });

  it('renders nested BlockNote children', () => {
    const comment = JSON.stringify([
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Parent' }],
        children: [
          {
            type: 'bulletListItem',
            content: [{ type: 'text', text: 'Child one' }],
            children: [
              {
                type: 'bulletListItem',
                content: [{ type: 'text', text: 'Grandchild' }],
                children: [],
              },
            ],
          },
          {
            type: 'bulletListItem',
            content: [{ type: 'text', text: 'Child two' }],
            children: [],
          },
        ],
      },
    ]);

    const text = renderCommentText(comment) ?? '';
    assert.match(text, /- Parent/);
    assert.match(text, / {2}- Child one/);
    assert.match(text, / {4}- Grandchild/);
    assert.match(text, / {2}- Child two/);
  });

  it('preserves plain strings and null', () => {
    assert.equal(renderCommentText('plain text'), 'plain text');
    assert.equal(renderCommentText(null), null);
    assert.equal(renderCommentText('   '), null);
  });

  it('returns the raw string for malformed JSON', () => {
    assert.equal(renderCommentText('[not json'), '[not json');
  });
});

describe('task search', () => {
  it('matches exact tickets from titles and zammad ids', () => {
    const titleTicket = makeTask({ id: 'a', title: 'Fix cash balance TaB Ticket#616795' });
    const idTicket = makeTask({ id: 'zammad-6111200', title: 'Anpassungen Preiskategorien' });

    assert.equal(extractTicketNumber(titleTicket), '616795');
    assert.equal(extractTicketNumber(idTicket), '6111200');

    const titleMatch = scoreTask('616795', titleTicket);
    assert.equal(titleMatch?.score, 1);
    assert.equal(titleMatch?.matchedBy, 'ticket');

    const idMatch = scoreTask('zammad-6111200', idTicket);
    assert.equal(idMatch?.score, 1);
    assert.equal(idMatch?.matchedBy, 'ticket');
  });

  it('extracts space-separated ticket numbers', () => {
    const spaced = makeTask({ id: 'spaced', title: 'Ticket  617103' });
    assert.equal(extractTicketNumber(spaced), '617103');

    const scored = scoreTask(
      '617425',
      makeTask({ id: 'space-ticket', title: 'Changer date expiration abo annuel Ticket 617425' }),
    );
    assert.equal(scored?.matchedBy, 'ticket');
    assert.equal(scored?.ticketNumber, '617425');
  });

  it('finds a typo through similarity matching', () => {
    const task = makeTask({ id: 'a', title: 'Bestellung Gutscheinkleber - Drucker Ticket#615792' });
    const match = scoreTask('Gutscheinklebber', task);
    assert.ok(match);
    assert.ok(match!.score >= 0.55);
    assert.equal(match!.matchedBy, 'fuzzy');
  });

  it('ranks exact hits above fuzzy hits and respects limit', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Gutscheinkleber order' }),
      makeTask({ id: 'c', title: 'Unrelated task' }),
    ];
    const { scored, matched } = rankTasks(tasks, 'Gutscheinkleber', { limit: 1 });
    assert.equal(matched, 1);
    assert.equal(scored.length, 1);
    assert.equal(scored[0].task.id, 'a');
  });

  it('scores near-identical strings highly', () => {
    assert.ok(similarityRatio('Gutscheinkleber', 'Gutscheinklebber') > 0.8);
  });

  it('does not dilute exact ticket matches with fuzzy title matches', () => {
    const tasks = [
      makeTask({ id: 'zammad-6111200', title: 'Anpassungen Preiskategorien Ticket#6111200' }),
      makeTask({ id: 'other', title: 'Ticket  617103' }),
    ];
    const { scored, matched } = rankTasks(tasks, '6111200');
    assert.equal(matched, 1);
    assert.equal(scored[0].task.id, 'zammad-6111200');
  });
});

describe('board sorting', () => {
  it('puts actionable cards before blocked/backlog cards', () => {
    const blocked = makeTask({ id: 'blocked', triageStatus: 'Blocked', priority: 1 });
    const ready = makeTask({ id: 'ready', triageStatus: 'Ready', priority: 100 });
    const backlog = makeTask({ id: 'backlog', triageStatus: 'Backlog', priority: 10 });

    const sorted = sortTasksByMode([backlog, blocked, ready], 'plan').map((task) => task.id);
    assert.deepEqual(sorted, ['ready', 'blocked', 'backlog']);
  });

  it('treats null priority as 0 like the app', () => {
    const high = makeTask({ id: 'high', priority: 1 });
    const low = makeTask({ id: 'low', priority: 9 });
    const none = makeTask({ id: 'none', priority: null });

    const sorted = sortTasksByMode([none, low, high], 'priority').map((task) => task.id);
    assert.deepEqual(sorted, ['none', 'high', 'low']);
  });

  it('does not order two deadline tasks by deadline date', () => {
    const earlyDeadline = makeTask({
      id: 'early-deadline',
      priority: 5,
      terminationDate: 1_000,
      createdAt: 5_000,
    });
    const lateDeadline = makeTask({
      id: 'late-deadline',
      priority: 5,
      terminationDate: 9_000,
      createdAt: 1_000,
    });

    const sorted = sortTasksByMode([earlyDeadline, lateDeadline], 'kanban').map((task) => task.id);
    assert.deepEqual(sorted, ['late-deadline', 'early-deadline']);
  });
});

describe('task audit', () => {
  const tasks = [
    makeTask({ id: 'null', priority: null, userId: 'u1', category: 'General' }),
    makeTask({ id: 'zero', priority: 0, userId: 'u1', category: 'Admin' }),
    makeTask({ id: 'dup-a', priority: 5, userId: 'u1', category: 'Admin' }),
    makeTask({ id: 'dup-b', priority: 5, userId: 'u1', category: 'Admin' }),
    makeTask({ id: 'dup-other', priority: 5, userId: 'u2', category: 'Support' }),
    makeTask({ id: 'unassigned', priority: 2, userId: null, category: 'Admin' }),
  ];

  it('counts null/zero priorities, duplicates, General, unassigned', () => {
    const stats = buildTaskStats(tasks, { now: 1_700_000_000_000 + 1000 });
    assert.equal(stats.scanned, 6);
    assert.equal(stats.priority.null, 1);
    assert.equal(stats.priority.zero, 1);
    assert.equal(stats.priority.duplicateGroups, 1);
    assert.equal(stats.priority.duplicateTasks, 2);
    assert.equal(stats.category.general, 1);
    assert.equal(stats.assignment.unassigned, 1);
  });

  it('scopes duplicates by user and parent', () => {
    const audit = buildPriorityAudit(tasks, { now: 1_700_000_000_000 + 1000 });
    assert.equal(audit.duplicates.length, 1);
    assert.equal(audit.duplicates[0].userId, 'u1');
    assert.equal(audit.duplicates[0].priority, 5);
    assert.equal(audit.duplicates[0].taskCount, 2);
    assert.equal(audit.summary.priority.duplicateGroups, 1);
  });

  it('marks duplicate groups as truncated when their task list is capped', () => {
    const audit = buildPriorityAudit(tasks, {
      now: 1_700_000_000_000 + 1000,
      limitPerSection: 1,
    });
    assert.equal(audit.truncated.duplicates, true);
  });

  it('reports stale non-terminal tasks', () => {
    const old = makeTask({ id: 'old', triageStatus: 'Backlog', updatedAt: 1_000_000 });
    const fresh = makeTask({ id: 'fresh', triageStatus: 'Backlog', updatedAt: 1_700_000_000_000 });
    const audit = buildPriorityAudit([old, fresh], {
      now: 1_700_000_000_000,
      staleDays: 90,
    });
    assert.equal(audit.summary.stale.count, 1);
    assert.equal(audit.staleTasks[0].id, 'old');
  });

  it('uses the full snapshot for orphan detection when tasks are filtered', () => {
    const parent = makeTask({ id: 'parent', title: 'Parent', userId: 'u1' });
    const child = makeTask({ id: 'child', title: 'Child', parentId: 'parent', userId: 'u1' });

    const withSnapshot = buildPriorityAudit([child], {
      knownTaskIds: [parent.id, child.id],
    });
    assert.equal(withSnapshot.orphanedChildren.length, 0);

    const withoutSnapshot = buildPriorityAudit([child]);
    assert.equal(withoutSnapshot.orphanedChildren.length, 1);
  });
});

describe('task fetching', () => {
  it('fetches only the requested ids', async () => {
    const requested: string[] = [];
    let listCalled = false;
    const client = {
      async getTaskById(id: string) {
        requested.push(id);
        return { id, title: id };
      },
      async getTasks() {
        listCalled = true;
        return { data: [], total: 0 };
      },
    } as never;

    const tasks = await fetchTasksByIds(client, ['a', 'b', 'a']);
    assert.deepEqual(requested.sort(), ['a', 'b']);
    assert.equal(listCalled, false);
    assert.equal(tasks.length, 2);
  });

  it('does not fall back to a full scan for large id sets', async () => {
    const requested: string[] = [];
    let listCalled = false;
    const client = {
      async getTaskById(id: string) {
        requested.push(id);
        return { id, title: id };
      },
      async getTasks() {
        listCalled = true;
        return { data: [], total: 0 };
      },
    } as never;

    const ids = Array.from({ length: 150 }, (_, index) => `id-${index}`);
    const tasks = await fetchTasksByIds(client, ids);

    assert.equal(tasks.length, 150);
    assert.equal(requested.length, 150);
    assert.equal(listCalled, false);
  });
});

describe('bulk updates', () => {
  const tasks = [
    makeTask({ id: 'a', priority: 10, triageStatus: 'Backlog' }),
    makeTask({ id: 'b', priority: 20, triageStatus: 'Backlog' }),
  ];

  function fakeClient() {
    const calls = { bulk: 0, update: 0 };
    return {
      calls,
      client: {
        async bulkUpdateTaskPriorities() { calls.bulk++; },
        async updateTask() { calls.update++; return {}; },
      } as never,
    };
  }

  it('previews without writing by default', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { priority: 5 } },
    ]);

    assert.equal(result.dryRun, true);
    assert.equal(result.applied, 0);
    assert.equal(result.results[0].changes?.priority.from, 10);
    assert.equal(result.results[0].changes?.priority.to, 5);
    assert.equal(calls.bulk, 0);
    assert.equal(calls.update, 0);
  });

  it('uses the bulk priority endpoint for priority-only batches', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { priority: 5 } },
      { id: 'b', patch: { priority: null } },
    ], { dryRun: false });

    assert.equal(result.applied, 2);
    assert.equal(calls.bulk, 1);
    assert.equal(calls.update, 0);
  });

  it('uses updateTask for mixed field changes', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { triageStatus: 'Ready', urgent: true } },
    ], { dryRun: false });

    assert.equal(result.applied, 1);
    assert.equal(calls.bulk, 0);
    assert.equal(calls.update, 1);
  });

  it('blocks writes when a patch is invalid and stopOnError is true', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { category: 'NotARealCategory' } },
    ], { dryRun: false });

    assert.equal(result.applied, 0);
    assert.match(result.results[0].error ?? '', /not a known P3FO category/);
    assert.equal(calls.update, 0);
  });

  it('treats an undefined priority as an empty patch', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { priority: undefined } },
    ], { dryRun: false });

    assert.equal(result.applied, 0);
    assert.match(result.results[0].error ?? '', /patch is empty/);
    assert.equal(calls.bulk, 0);
    assert.equal(calls.update, 0);
  });

  it('does not report unattempted items as applied after stopOnError', async () => {
    const three = [...tasks, makeTask({ id: 'c', priority: 30, triageStatus: 'Backlog' })];
    let updateCalls = 0;
    const client = {
      async bulkUpdateTaskPriorities() {},
      async updateTask() {
        updateCalls++;
        if (updateCalls === 2) throw new Error('boom');
        return {};
      },
    } as never;

    const result = await applyBulkUpdates(client, three, [
      { id: 'a', patch: { triageStatus: 'Ready' } },
      { id: 'b', patch: { triageStatus: 'Ready' } },
      { id: 'c', patch: { triageStatus: 'Ready' } },
    ], { dryRun: false, stopOnError: true });

    assert.equal(result.applied, 1);
    assert.equal(result.failed, 2);
    assert.equal(result.results.find((entry) => entry.id === 'b')?.ok, false);
    assert.match(result.results.find((entry) => entry.id === 'c')?.error ?? '', /not attempted/);
  });

  it('does not report valid items as applied when another item fails before writing', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { triageStatus: 'Ready' } },
      { id: 'missing', patch: { triageStatus: 'Ready' } },
    ], { dryRun: false, stopOnError: true });

    assert.equal(result.applied, 0);
    assert.equal(result.failed, 2);
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].error ?? '', /not attempted/);
    assert.equal(calls.update, 0);
    assert.equal(calls.bulk, 0);
  });

  it('rejects duplicate ids instead of aliasing per-item results', async () => {
    const { client, calls } = fakeClient();
    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { triageStatus: 'Ready' } },
      { id: 'a', patch: { category: 'NotARealCategory' } },
    ], { dryRun: false, stopOnError: false });

    assert.equal(calls.update, 1);
    assert.equal(result.applied, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.results[1].ok, false);
    assert.match(result.results[1].error ?? '', /duplicate task id/);
  });

  it('stops mixed updates when the priority batch fails and stopOnError is true', async () => {
    let updateCalls = 0;
    const client = {
      async bulkUpdateTaskPriorities() { throw new Error('bulk failed'); },
      async updateTask() { updateCalls++; return {}; },
    } as never;

    const result = await applyBulkUpdates(client, tasks, [
      { id: 'a', patch: { priority: 5 } },
      { id: 'b', patch: { triageStatus: 'Ready' } },
    ], { dryRun: false, stopOnError: true });

    assert.equal(updateCalls, 0);
    assert.equal(result.applied, 0);
    assert.match(result.results.find((entry) => entry.id === 'a')?.error ?? '', /bulk failed/);
    assert.match(result.results.find((entry) => entry.id === 'b')?.error ?? '', /not attempted/);
  });
});

describe('task import validation', () => {
  const existing: TaskRecord[] = [makeTask({ id: 'existing', title: 'Existing' })];

  it('generates missing ids and defaults', () => {
    const prepared = prepareTaskImport([
      { title: 'New task', createdAt: 1_700_000_000_000 },
    ], existing);

    assert.equal(prepared.errors.length, 0);
    assert.equal(prepared.created, 1);
    assert.equal(prepared.updated, 0);
    assert.match(String(prepared.normalized[0].id), /^[0-9a-f-]{36}$/i);
    assert.equal(prepared.normalized[0].triageStatus, 'Backlog');
    assert.equal(prepared.normalized[0].priority, null);
  });

  it('accepts null priority and warns on zero', () => {
    const prepared = prepareTaskImport([
      { title: 'Null priority', priority: null },
      { title: 'Zero priority', priority: 0 },
    ], existing);

    assert.equal(prepared.errors.length, 0);
    assert.equal(prepared.normalized.length, 2);
    assert.ok(prepared.warnings.some((warning) => /priority is 0/.test(warning)));
  });

  it('rejects unknown categories and warns on General', () => {
    const prepared = prepareTaskImport([
      { title: 'Bad category', category: 'Nope' },
      { title: 'General category', category: 'General' },
    ], existing);

    assert.ok(prepared.errors.some((error) => /not a known P3FO category/.test(error)));
    assert.ok(prepared.warnings.some((warning) => /General/.test(warning)));
  });

  it('detects duplicate priorities and parent cycles', () => {
    const prepared = prepareTaskImport([
      { id: 'a', title: 'A', priority: 5, userId: 'u1' },
      { id: 'b', title: 'B', priority: 5, userId: 'u1' },
      { id: 'c', title: 'C', parentId: 'd' },
      { id: 'd', title: 'D', parentId: 'c' },
    ], existing);

    assert.ok(prepared.warnings.some((warning) => /duplicate priority 5/.test(warning)));
    assert.ok(prepared.errors.some((error) => /parent cycle/.test(error)));
  });

  it('keeps valid rows and reports rejected ones', () => {
    const prepared = prepareTaskImport([
      { title: 'Valid' },
      { title: '', category: 'Nope' },
    ], existing);

    assert.equal(prepared.normalized.length, 1);
    assert.equal(prepared.rejected, 1);
    assert.ok(prepared.errors.length > 0);
  });

  it('merges partial imports over existing tasks instead of wiping fields', () => {
    const parent = makeTask({ id: 'parent', title: 'Parent' });
    const existingTask = makeTask({
      id: 'existing',
      title: 'Existing',
      triageStatus: 'WIP',
      priority: 5,
      userId: 'u1',
      parentId: 'parent',
      timer: [{ startTime: 1, endTime: 2 }],
      comment: 'keep me',
      category: 'Support',
    });

    const prepared = prepareTaskImport([
      { id: 'existing', title: 'Renamed' },
    ], [parent, existingTask]);

    assert.equal(prepared.errors.length, 0);
    assert.equal(prepared.updated, 1);
    const task = prepared.normalized[0];
    assert.equal(task.title, 'Renamed');
    assert.equal(task.triageStatus, 'WIP');
    assert.equal(task.priority, 5);
    assert.equal(task.userId, 'u1');
    assert.equal(task.parentId, 'parent');
    assert.deepEqual(task.timer, [{ startTime: 1, endTime: 2 }]);
    assert.equal(task.comment, 'keep me');
    assert.equal(task.category, 'Support');
  });

  it('rejects a task whose parent does not exist and cascades to children', () => {
    const prepared = prepareTaskImport([
      { id: 'parent', title: 'Parent', parentId: 'missing' },
      { id: 'child', title: 'Child', parentId: 'parent' },
    ], existing);

    assert.ok(prepared.errors.some((error) => /parent missing does not exist/.test(error)));
    assert.ok(
      prepared.errors.some(
        (error) => /child.*blocked by invalid ancestor parent/.test(error),
      ),
    );
    assert.equal(prepared.normalized.length, 0);
  });

  it('normalizes a blank parentId to null', () => {
    const prepared = prepareTaskImport([
      { title: 'Blank parent', parentId: '' },
    ], existing);

    assert.equal(prepared.errors.length, 0);
    assert.equal(prepared.normalized[0].parentId, null);
  });

  it('scopes duplicate priorities by the effective merged user', () => {
    const a = makeTask({ id: 'a', title: 'A', userId: 'u1', priority: 5 });
    const b = makeTask({ id: 'b', title: 'B', userId: 'u2', priority: 5 });

    const differentUsers = prepareTaskImport([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ], [a, b]);
    assert.equal(differentUsers.errors.length, 0);
    assert.ok(!differentUsers.warnings.some((warning) => /duplicate priority/.test(warning)));

    const sameUser = prepareTaskImport([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ], [a, { ...b, userId: 'u1' }]);
    assert.ok(sameUser.warnings.some((warning) => /duplicate priority 5/.test(warning)));
  });
});
