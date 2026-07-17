import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const USE_TASKS_PATH = path.resolve(__dirname, '../hooks/useTasks.ts')

describe('useTasks mutations - updatedAt injection', () => {
  describe('updateTaskInTasks', () => {
    it('should inject updatedAt: Date.now() in updateTaskInTasks', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      const funcStart = lines.findIndex(l => l.includes('const updateTaskInTasks = (taskId: string, updater: (task: Task) => Task)'))
      expect(funcStart).toBeGreaterThanOrEqual(0)
      
      const funcBody = lines.slice(funcStart, funcStart + 15).join('\n')
      
      expect(funcBody).toMatch(/updatedAt\s*:\s*Date\.now\(\)/)
    })
  })

  describe('updateStatus', () => {
    it('should inject updatedAt: Date.now() in updateStatus', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      const funcStart = lines.findIndex(l => l.includes('async function updateStatus(taskId: string, status: TriageStatus)'))
      expect(funcStart).toBeGreaterThanOrEqual(0)
      
      const funcBody = lines.slice(funcStart, funcStart + 60).join('\n')
      
      expect(funcBody).toMatch(/updatedAt\s*:\s*Date\.now\(\)/)
    })
  })

  describe('reparent', () => {
    it('should inject updatedAt: Date.now() when reparenting', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      const funcStart = lines.findIndex(l => l.includes('const reparent = async (taskId: string, newParentId: string | null)'))
      expect(funcStart).toBeGreaterThanOrEqual(0)
      
      const funcBody = lines.slice(funcStart, funcStart + 50).join('\n')
      
      expect(funcBody).toMatch(/updatedAt\s*:\s*Date\.now\(\)/)
    })
  })

  describe('updateUser', () => {
    it('should inject updatedAt: Date.now() when updating user assignment', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      const funcStart = lines.findIndex(l => l.includes('async function updateUser(taskId: string, userId: string | undefined)'))
      expect(funcStart).toBeGreaterThanOrEqual(0)
      
      const funcBody = lines.slice(funcStart, funcStart + 30).join('\n')
      
      expect(funcBody).toMatch(/updatedAt\s*:\s*Date\.now\(\)/)
    })
  })

  describe('updateTitle', () => {
    it('should inject updatedAt: Date.now() when updating title', async () => {
      const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
      const lines = source.split('\n')
      
      const funcStart = lines.findIndex(l => l.includes('const updateTitle = React.useCallback(async (id: string, title: string)'))
      expect(funcStart).toBeGreaterThanOrEqual(0)
      
      const funcBody = lines.slice(funcStart, funcStart + 20).join('\n')
      
      expect(funcBody).toMatch(/updatedAt\s*:\s*Date\.now\(\)/)
    })
  })
})

describe('createTask - subtask metadata inheritance', () => {
  it('should look up parent task when parentId is provided', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('async function createTask'))
    expect(funcStart).toBeGreaterThanOrEqual(0)

    const funcBody = lines.slice(funcStart, funcStart + 30).join('\n')

    // Must look up parent from the tasks array
    expect(funcBody).toMatch(/parentTask/)
    expect(funcBody).toMatch(/tasks\.find/)
  })

  it('should inherit metadata fields from parent using ?? fallback', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('async function createTask'))
    const funcBody = lines.slice(funcStart, funcStart + 30).join('\n')

    // Each inherited field should use parentTask?.field ?? default
    expect(funcBody).toMatch(/parentTask\?\.category/)
    expect(funcBody).toMatch(/parentTask\?\.difficulty/)
    expect(funcBody).toMatch(/parentTask\?\.urgent/)
    expect(funcBody).toMatch(/parentTask\?\.impact/)
    expect(funcBody).toMatch(/parentTask\?\.sprintTarget/)
    expect(funcBody).toMatch(/parentTask\?\.majorIncident/)
    expect(funcBody).toMatch(/parentTask\?\.priority/)
  })

  it('should inherit userId from parent when caller does not pass userId', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('async function createTask'))
    const funcBody = lines.slice(funcStart, funcStart + 30).join('\n')

    // userId should use caller override first, then parent fallback
    expect(funcBody).toMatch(/userId\s*[:=].*userId.*parentTask\?\.userId/)
  })
})

describe('createTask - timer transfer persistence', () => {
  it('should persist timer transfer to DB with adapter.updateTask for child', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('async function createTask'))
    const funcBody = lines.slice(funcStart, funcStart + 80).join('\n')

    // Must call adapter.updateTask for the child after timer transfer
    expect(funcBody).toMatch(/adapter\.updateTask\(t\.id/)
  })

  it('should persist parent timer clearing to DB with adapter.updateTask', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('async function createTask'))
    const funcBody = lines.slice(funcStart, funcStart + 80).join('\n')

    // Must call adapter.updateTask for the parent after timer transfer
    expect(funcBody).toMatch(/adapter\.updateTask\(parentId/)
  })
})

describe('deleteTask - parent children sync', () => {
  it('should sync updated parent to Yjs after child deletion', async () => {
    const source = fs.readFileSync(USE_TASKS_PATH, 'utf-8')
    const lines = source.split('\n')

    const funcStart = lines.findIndex(l => l.includes('const deleteTask = React.useCallback'))
    expect(funcStart).toBeGreaterThanOrEqual(0)

    const funcBody = lines.slice(funcStart, funcStart + 40).join('\n')

    // Must call syncTaskToYjs for the parent after updating its children
    expect(funcBody).toMatch(/syncTaskToYjs.*updatedParent/)
  })
})