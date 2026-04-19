import { describe, it, expect } from 'vitest'
import { taskToEntity, convertEntitiesToTasks } from './task-conversions'
import type { Task } from '@/hooks/useTasks'
import type { TaskEntity } from './persistence-types'

describe('task-conversions', () => {
  describe('updatedAt field', () => {
    describe('taskToEntity', () => {
      it('should convert updatedAt number to ISO string', () => {
        const task: Task = {
          id: 'test-1',
          title: 'Test Task',
          createdAt: 1713945600000,
          triageStatus: 'Backlog',
          updatedAt: 1713945600000,
        }

        const entity = taskToEntity(task)

        expect(entity.updatedAt).toBe('2024-04-24T08:00:00.000Z')
      })

      it('should handle missing updatedAt', () => {
        const task: Task = {
          id: 'test-2',
          title: 'Test Task',
          createdAt: 1713945600000,
          triageStatus: 'Backlog',
        }

        const entity = taskToEntity(task)

        expect(entity.updatedAt).toBeNull()
      })
    })

    describe('convertEntitiesToTasks', () => {
      it('should convert updatedAt ISO string to number', () => {
        const entity: TaskEntity = {
          id: 'test-1',
          title: 'Test Task',
          createdAt: '2024-04-24T08:00:00.000Z',
          triageStatus: 'Backlog',
          urgent: false,
          impact: false,
          majorIncident: false,
          sprintTarget: false,
          difficulty: 1,
          timer: [],
          category: 'General',
          terminationDate: null,
          comment: null,
          durationInMinutes: null,
          priority: null,
          userId: null,
          parentId: null,
          updatedAt: '2024-04-24T08:00:00.000Z',
        }

        const tasks = convertEntitiesToTasks([entity])

        expect(tasks[0].updatedAt).toBe(1713945600000)
      })

      it('should handle missing updatedAt', () => {
        const entity: TaskEntity = {
          id: 'test-2',
          title: 'Test Task',
          createdAt: '2024-04-24T08:00:00.000Z',
          triageStatus: 'Backlog',
          urgent: false,
          impact: false,
          majorIncident: false,
          sprintTarget: false,
          difficulty: 1,
          timer: [],
          category: 'General',
          terminationDate: null,
          comment: null,
          durationInMinutes: null,
          priority: null,
          userId: null,
          parentId: null,
        }

        const tasks = convertEntitiesToTasks([entity])

        expect(tasks[0].updatedAt).toBeUndefined()
      })

      it('should handle null updatedAt', () => {
        const entity: TaskEntity = {
          id: 'test-3',
          title: 'Test Task',
          createdAt: '2024-04-24T08:00:00.000Z',
          triageStatus: 'Backlog',
          urgent: false,
          impact: false,
          majorIncident: false,
          sprintTarget: false,
          difficulty: 1,
          timer: [],
          category: 'General',
          terminationDate: null,
          comment: null,
          durationInMinutes: null,
          priority: null,
          userId: null,
          parentId: null,
          updatedAt: null,
        }

        const tasks = convertEntitiesToTasks([entity])

        expect(tasks[0].updatedAt).toBeUndefined()
      })
    })

    describe('round-trip conversion', () => {
      it('should preserve updatedAt through round-trip conversion', () => {
        const task: Task = {
          id: 'test-rt',
          title: 'Round Trip',
          createdAt: 1713945600000,
          triageStatus: 'WIP',
          updatedAt: 1714032000000,
        }

        const entity = taskToEntity(task)
        const backToTasks = convertEntitiesToTasks([entity])

        expect(backToTasks[0].updatedAt).toBe(1714032000000)
      })
    })
  })
})