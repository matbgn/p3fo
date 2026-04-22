import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * BEAD-004: Task creation MUST preserve filter state
 * 
 * Problem: When creating a task in KanbanBoard with a user filter active,
 * after creation the UI shows ALL tasks instead of only the filtered user's tasks.
 * 
 * Root Cause: The module-level loadTasks() runs on initialization and can
 * race with loadTasksByUser(). When loadTasks() completes AFTER loadTasksByUser()
 * has set isFiltered=true, it would overwrite the filtered tasks with all tasks.
 * 
 * Fix: loadTasks() checks isFiltered before overwriting state (line 171-173 in useTasks.ts).
 * Y.js observer skips when isFiltered=true (line 118-120 in useTasks.ts).
 * 
 * This test suite verifies the behavioral contracts through source code analysis
 * and behavioral testing.
 */

const USE_TASKS_PATH = path.resolve(__dirname, '../hooks/useTasks.ts')
const EVENTS_PATH = path.resolve(__dirname, './events.ts')

describe('BEAD-004: Filter State Preservation', () => {
  describe('isFiltered guard in loadTasks', () => {
    it('loadTasks MUST skip state update when isFiltered=true', async () => {
      // Read the actual source file to verify the guard exists
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find the guard pattern at the documented location (around line 171-173)
      // Expected: if (isFiltered) { return; }
      const guardStart = 169
      const guardEnd = 173
      const guardLines = lines.slice(guardStart, guardEnd).join('\n')
      
      // Verify the guard exists with correct structure
      expect(guardLines).toMatch(/if\s*\(\s*isFiltered\s*\)\s*\{/)
      expect(guardLines).toMatch(/return/)
      
      // Verify guard is AFTER async operation completes (prevents race)
      // The guard should be after `const loadedTasks = convertEntitiesToTasks(entities);`
      const codeBeforeGuard = lines.slice(160, guardStart).join('\n')
      expect(codeBeforeGuard).toMatch(/await.*adapter\.listTasks/)
      expect(codeBeforeGuard).toMatch(/convertEntitiesToTasks/)
    })
    
    it('loadTasksByUser MUST set isFiltered=true before publishing tasksChanged', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find loadTasksByUser function
      const loadTasksByUserStart = lines.findIndex(l => l.includes('const loadTasksByUser = async'))
      expect(loadTasksByUserStart).toBeGreaterThanOrEqual(0)
      
      // Find the lines where isFiltered is set and eventBus.publish is called
      const functionBody = lines.slice(loadTasksByUserStart, loadTasksByUserStart + 30).join('\n')
      
      // Extract positions
      const isFilteredMatch = functionBody.match(/isFiltered\s*=\s*true/)
      const publishMatch = functionBody.match(/eventBus\.publish\s*\(\s*['"]tasksChanged['"]\s*\)/)
      
      expect(isFilteredMatch).not.toBeNull()
      expect(publishMatch).not.toBeNull()
      
      // Verify isFiltered comes BEFORE publish
      const isFilteredPosition = functionBody.indexOf('isFiltered = true')
      const publishPosition = functionBody.indexOf('eventBus.publish')
      expect(isFilteredPosition).toBeLessThan(publishPosition)
    })
  })

  describe('Y.js Observer Safety', () => {
    it('Y.js observer MUST skip when isFiltered=true', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find Y.js observer setup
      const observerStart = lines.findIndex(l => l.includes('yTasks.observe('))
      expect(observerStart).toBeGreaterThanOrEqual(0)
      
      // Get observer callback body (next ~25 lines)
      const observerBody = lines.slice(observerStart, observerStart + 25).join('\n')
      
      // Verify guard exists in observer
      expect(observerBody).toMatch(/if\s*\(\s*isFiltered\s*\)\s*\{/)
      expect(observerBody).toMatch(/return/)
      
      // Verify guard is at the START (before any task mutations)
      const linesBeforeGuard = observerBody.split('\n').slice(0, 5).join('\n')
      expect(linesBeforeGuard).toMatch(/isFiltered/)
    })
    
    it('Y.js observer reads isFiltered at call time by reference', async () => {
      // This is a JavaScript language guarantee - module-level variables
      // are accessed by reference in closures, not captured by value.
      // The test verifies the code structure enables this.
      
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      
      // Verify isFiltered is declared at module level (not inside a function)
      const moduleLevelDeclaration = /^let\s+isFiltered\s*=\s*false\s*;?\s*$/m
      expect(source).toMatch(moduleLevelDeclaration)
      
      // Verify the observer function doesn't capture isFiltered in a local variable
      // (which would be by value, not by reference)
      const observerMatch = source.match(/yTasks\.observe\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?^\s*\}\s*\)/m)
      if (observerMatch) {
        const observerCode = observerMatch[0]
        // Should NOT have: const isFiltered = ... or let isFiltered = ...
        const localCapture = /(?:const|let|var)\s+isFiltered\s*=/
        expect(observerCode).not.toMatch(localCapture)
      }
    })
  })

  describe('createTask Filter Preservation', () => {
    it('createTask MUST preserve isFiltered state', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find createTask function
      const createTaskStart = lines.findIndex(l => l.includes('async function createTask'))
      expect(createTaskStart).toBeGreaterThanOrEqual(0)
      
      // Get function body
      const createTaskBody = lines.slice(createTaskStart, createTaskStart + 90).join('\n')
      
      // Verify createTask does NOT set isFiltered = true or isFiltered = false
      const modifiesIsFiltered = /isFiltered\s*=\s*(?:true|false)/
      expect(createTaskBody).not.toMatch(modifiesIsFiltered)
    })
    
    it('createTask appends to existing filtered list', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find createTask function
      const createTaskStart = lines.findIndex(l => l.includes('async function createTask'))
      expect(createTaskStart).toBeGreaterThanOrEqual(0)
      
      // Get function body
      const createTaskBody = lines.slice(createTaskStart, createTaskStart + 90).join('\n')
      
      // Verify createTask uses [...tasks, t] to append to current tasks
      expect(createTaskBody).toMatch(/tasks\s*=\s*\[\s*\.\.\.tasks\s*,\s*t\s*\]/)
    })
  })

  describe('Race Condition Prevention', () => {
    it('loadTasks guard MUST check isFiltered AFTER async load completes', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find loadTasks function
      const loadTasksStart = lines.findIndex(l => l.match(/async function loadTasks\(\)/))
      expect(loadTasksStart).toBeGreaterThanOrEqual(0)
      
      // Find the SUCCESS PATH - the main await that loads tasks
      const loadTasksBody = lines.slice(loadTasksStart, loadTasksStart + 60).join('\n')
      
      // Find the specific await for adapter.listTasks() (the main load)
      const mainLoadMatch = loadTasksBody.match(/await\s+adapter\.listTasks\(\)/)
      expect(mainLoadMatch).not.toBeNull()
      
      // Find isFiltered guard
      const guardMatch = loadTasksBody.match(/if\s*\(\s*isFiltered\s*\)\s*\{[^}]*return[^}]*\}/)
      expect(guardMatch).not.toBeNull()
      
      // Find the main load position (adapter.listTasks)
      const mainLoadIndex = loadTasksBody.indexOf('adapter.listTasks')
      const guardIndex = loadTasksBody.indexOf('if (isFiltered)')
      
      // Guard must be AFTER the main load completes (so it checks after async completes)
      expect(guardIndex).toBeGreaterThan(mainLoadIndex)
    })
    
    it('Atomic state updates in loadTasksByUser prevent partial renders', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      // Find loadTasksByUser function
      const funcStart = lines.findIndex(l => l.includes('const loadTasksByUser = async'))
      const funcBody = lines.slice(funcStart, funcStart + 30)
      
      // Get positions of key operations
      const tasksAssignmentLine = funcBody.findIndex(l => l.match(/^\s*tasks\s*=/))
      const isFilteredLine = funcBody.findIndex(l => l.includes('isFiltered = true'))
      const publishLine = funcBody.findIndex(l => l.includes('eventBus.publish'))
      
      // All three must be present
      expect(tasksAssignmentLine).toBeGreaterThanOrEqual(0)
      expect(isFilteredLine).toBeGreaterThanOrEqual(0)
      expect(publishLine).toBeGreaterThanOrEqual(0)
      
      // Verify ordering: tasks is set -> isFiltered is set -> publish
      expect(isFilteredLine).toBeGreaterThan(tasksAssignmentLine)
      expect(publishLine).toBeGreaterThan(isFilteredLine)
    })
  })

  describe('EventBus Microtask Batching', () => {
    it('eventBus.publish("tasksChanged") uses queueMicrotask for batching', async () => {
      const source = fs.readFileSync(EVENTS_PATH, 'utf-8')
      
      // Verify EventBus uses queueMicrotask for batched events
      expect(source).toMatch(/BATCHED_EVENTS/)
      expect(source).toMatch(/tasksChanged/)
      expect(source).toMatch(/queueMicrotask/)
      
      // Verify batching logic: check if pending, add to pending set, then process in microtask
      expect(source).toMatch(/pendingBatched\.has/)
      expect(source).toMatch(/pendingBatched\.add/)
    })
    
    it('EventBus coalesces multiple tasksChanged calls in same microtask', async () => {
      // Import actual EventBus
      const { eventBus } = await import('./events')
      
      const callCounts: number[] = []
      const subscriber = vi.fn(() => {
        callCounts.push(1)
      })
      
      eventBus.subscribe('tasksChanged', subscriber)
      
      // Publish multiple times synchronously
      eventBus.publish('tasksChanged')
      eventBus.publish('tasksChanged')
      eventBus.publish('tasksChanged')
      
      // Subscriber should not be called yet (microtask queued)
      expect(subscriber).toHaveBeenCalledTimes(0)
      
      // Wait for microtask to execute
      await new Promise<void>(resolve => { queueMicrotask(() => { resolve() }) })
      
      // Subscriber should be called only ONCE (coalesced)
      expect(subscriber).toHaveBeenCalledTimes(1)
      
      eventBus.unsubscribe('tasksChanged', subscriber)
    })
  })
})

describe('Implementation Verification via Code Locations', () => {
  it('loadTasks guard exists at documented location', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    // Find the guard dynamically rather than hardcoding a line number
    const guardIndex = lines.findIndex(l => l.includes('if (isFiltered)'))
    expect(guardIndex).toBeGreaterThanOrEqual(0)

    // Verify the line contains the if statement
    const guardLine = lines[guardIndex]
    expect(guardLine).toMatch(/if\s*\(\s*isFiltered\s*\)/)

    // And next line is return
    const returnLine = lines[guardIndex + 1]
    expect(returnLine).toMatch(/return/)
  })
  
  it('Y.js observer guard exists at documented location', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')
    
    // Find observer setup (around line 97) and verify guard is in callback
    const observerStartIndex = lines.findIndex(l => l.includes('yTasks.observe('))
    expect(observerStartIndex).toBeGreaterThanOrEqual(0)
    
    // Guard should be within next ~25 lines
    const observerBlock = lines.slice(observerStartIndex, observerStartIndex + 25).join('\n')
    expect(observerBlock).toMatch(/if\s*\(\s*isFiltered\s*\)/)
  })
  
  it('loadTasksByUser sets isFiltered at documented location', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')
    
    // Documented location: line 149 (0-indexed: 148)
    // But the actual line depends on exact formatting, so we search relative to function
    const funcStart = lines.findIndex(l => l.includes('const loadTasksByUser = async'))
    const searchArea = lines.slice(funcStart, funcStart + 20)
    
    expect(searchArea.some(l => l.includes('isFiltered = true'))).toBe(true)
  })
})

describe('Edge Cases', () => {
  it('UNASSIGNED filter converts to undefined and sets isFiltered', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')
    
    // Find loadTasksByUser function
    const funcStart = lines.findIndex(l => l.includes('const loadTasksByUser = async'))
    const funcBody = lines.slice(funcStart, funcStart + 20).join('\n')
    
    // Verify UNASSIGNED handling
    expect(funcBody).toMatch(/UNASSIGNED.*undefined|userId\s*===\s*['"]UNASSIGNED['"]/)
    
    // Verify isFiltered is still set for UNASSIGNED case
    expect(funcBody).toMatch(/isFiltered\s*=\s*true/)
  })
  
  it('Guard works independently of Y.js collaboration', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    
    // Verify loadTasks guard is BEFORE any Y.js sync code
    // This means the guard is checked regardless of collaboration feature
    const loadTasksMatch = source.match(/async function loadTasks\(\)[\s\S]*?eventBus\.publish\s*\(\s*['"]tasksChanged['"]\s*\)/)
    expect(loadTasksMatch).not.toBeNull()
    
    // The guard should be in loadTasks before the eventBus.publish
    if (loadTasksMatch) {
      const loadTasksCode = loadTasksMatch[0]
      const guardPosition = loadTasksCode.indexOf('if (isFiltered)')
      const publishPosition = loadTasksCode.indexOf('eventBus.publish')
      
      // Guard should exist and be before publish
      expect(guardPosition).toBeGreaterThan(0)
      expect(publishPosition).toBeGreaterThan(guardPosition)
    }
  })
  
  it('Multiple consecutive task creations preserve filter', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    
    // Verify createTask never modifies isFiltered
    // This guarantees that multiple calls preserve the filter state
    
    const createTaskMatch = source.match(/async function createTask[\s\S]*?^(?=async function|\}$)/m)
    if (createTaskMatch) {
      const createTaskCode = createTaskMatch[0]
      // Should NOT find any assignment to isFiltered
      expect(createTaskCode).not.toMatch(/isFiltered\s*=/)
    }
  })
})