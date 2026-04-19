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