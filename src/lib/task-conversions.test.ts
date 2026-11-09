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

  describe('dueTime', () => {
    const baseEntity = (overrides: Partial<TaskEntity>): TaskEntity => ({
      id: 'due-1',
      title: 'Due task',
      createdAt: '2024-04-24T08:00:00.000Z',
      triageStatus: 'Ready',
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
      ...overrides,
    })

    it('treats a date-only deadline (local midnight) as all-day', () => {
      const dueDate = new Date(2026, 10, 9);
      const [task] = convertEntitiesToTasks([
        baseEntity({ dueDate: dueDate.toISOString(), dueTime: null }),
      ]);

      expect(task.dueTime).toBeNull();
      expect(task.dueDate).toBe(dueDate.getTime());
    })

    it('derives dueTime from a legacy due timestamp', () => {
      const dueDate = new Date(2026, 10, 9, 17, 0);
      const [task] = convertEntitiesToTasks([
        baseEntity({ dueDate: dueDate.toISOString() }),
      ]);

      expect(task.dueTime).toBe('17:00');
      expect(task.dueDate).toBe(dueDate.getTime());
    })

    it('derives dueTime from a timed timestamp even when storage has null', () => {
      const dueDate = new Date(2026, 10, 9, 17, 0);
      const [task] = convertEntitiesToTasks([
        baseEntity({ dueDate: dueDate.toISOString(), dueTime: null }),
      ]);

      expect(task.dueTime).toBe('17:00');
      expect(task.dueDate).toBe(dueDate.getTime());
    })

    it('round-trips dueDate and dueTime', () => {
      const dueDate = new Date(2026, 10, 9, 17, 0).getTime();
      const task: Task = {
        id: 'due-rt',
        title: 'Due round trip',
        createdAt: 1713945600000,
        triageStatus: 'Ready',
        dueDate,
        dueTime: '17:00',
      };

      const entity = taskToEntity(task);
      const [back] = convertEntitiesToTasks([entity]);

      expect(entity.dueTime).toBe('17:00');
      expect(back.dueTime).toBe('17:00');
      expect(back.dueDate).toBe(dueDate);
    })
  })
})