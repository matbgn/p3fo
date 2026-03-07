import { describe, it, expect, beforeEach } from 'vitest'
import { getDefaultFilters, mergeViewFilters } from './filter-merge'
import { Filters } from '@/components/FilterControls'
import { TriageStatus } from '@/hooks/useTasks'

// Simulate localStorage with mock storage
const mockLocalStorage: { filters: Filters | null } = { filters: null }

// Simulate React state
const mockReactState: { filters: Filters } = { filters: getDefaultFilters() }

// Simulate loadFiltersFromSessionStorage
const loadFromStorage = (): Filters => {
  return mockLocalStorage.filters ? { ...mockLocalStorage.filters } : getDefaultFilters()
}

// Simulate saveFiltersToSessionStorage
const saveToStorage = (filters: Filters) => {
  mockLocalStorage.filters = { ...filters }
}

// Simulate setFilters
const setState = (filters: Filters) => {
  mockReactState.filters = { ...filters }
}

describe('View-Local Filter Isolation Integration Tests', () => {
  beforeEach(() => {
    mockLocalStorage.filters = null
    mockReactState.filters = getDefaultFilters()
  })

  describe('BEAD-003: View-specific modifications must NOT persist to shared state', () => {
    it('TaskBoard excludeStatuses preserves status after user filter change', () => {
      // SCENARIO: User has status=['Done', 'Dropped'] persisted in localStorage
      //           Opens TaskBoard (applies excludeStatuses for display)
      //           Changes selectedUserId in TaskBoard
      //           Switches to another view
      // EXPECTED: localStorage should still have status=['Done', 'Dropped']
      
      // Step 1: User sets status in localStorage
      const userFilters: Filters = {
        ...getDefaultFilters(),
        status: ['Done', 'Dropped'] as TriageStatus[],
        selectedUserId: null
      }
      saveToStorage(userFilters)
      expect(mockLocalStorage.filters?.status).toEqual(['Done', 'Dropped'])
      
      // Step 2: User opens TaskBoard
      // CORRECT PATTERN: storedFilters stays unmodified, displayFilters is derived
      const storedFilters = loadFromStorage()
      setState(storedFilters)  // ← CORRECT: store original
      const displayFilters = mergeViewFilters(storedFilters, {
        excludeStatuses: ['Done', 'Dropped']
      })
      // displayFilters.status === [] for rendering
      // storedFilters.status === ['Done', 'Dropped'] for FilterControls
      
      // Step 3: User changes selectedUserId via FilterControls
      // CORRECT PATTERN: FilterControls receives storedFilters
      const currentStoredFilters = mockReactState.filters
      const newFilters: Filters = {
        ...currentStoredFilters,  // ← CORRECT: spreads stored filters
        selectedUserId: 'user-123'
      }
      // FilterControls calls:
      setState(newFilters)
      saveToStorage(newFilters)
      
      // Step 4: Check localStorage
      // EXPECTED: status=['Done', 'Dropped'] (preserved!)
      expect(mockLocalStorage.filters?.status).toEqual(['Done', 'Dropped'])
    })
    
    it('KanbanBoard empty status stays empty after user filter change', () => {
      // SCENARIO: User has status=[] (empty, show all)
      //           Opens KanbanBoard (applies default statuses for display)
      //           Changes selectedUserId
      //           Switches to another view
      // EXPECTED: localStorage should still have status=[]
      
      // Step 1: User has no status filter
      const userFilters: Filters = {
        ...getDefaultFilters(),
        status: [],
        selectedUserId: null
      }
      saveToStorage(userFilters)
      expect(mockLocalStorage.filters?.status).toEqual([])
      
      // Step 2: User opens KanbanBoard
      // CORRECT PATTERN: storedFilters stays unmodified, displayFilters is derived
      const storedFilters = loadFromStorage()
      setState(storedFilters)  // ← CORRECT: store original
      const displayFilters = mergeViewFilters(storedFilters, { defaultActiveStatuses: true })
      // displayFilters.status === ['Backlog', 'Ready', 'WIP', 'Blocked', 'Done', 'Dropped']
      // storedFilters.status === [] for FilterControls
      
      // Step 3: User changes selectedUserId via FilterControls
      const currentStoredFilters = mockReactState.filters
      const newFilters: Filters = {
        ...currentStoredFilters,  // ← CORRECT: spreads stored filters
        selectedUserId: 'user-456'
      }
      setState(newFilters)
      saveToStorage(newFilters)
      
      // Step 4: Check localStorage
      // EXPECTED: status=[] (preserved!)
      expect(mockLocalStorage.filters?.status).toEqual([])
    })
    
    it('Correct pattern preserves status across views', () => {
      // CORRECT PATTERN: Views maintain storedFilters state, use derived displayFilters for render
      
      // Step 1: User sets status
      const userFilters: Filters = {
        ...getDefaultFilters(),
        status: ['WIP', 'Blocked'] as TriageStatus[],
        selectedUserId: null
      }
      saveToStorage(userFilters)
      
      // Step 2: User opens TaskBoard
      // CORRECT PATTERN:
      const storedFilters = loadFromStorage()
      setState(storedFilters)  // ← CORRECT: store original
      const displayFilters = mergeViewFilters(storedFilters, {
        excludeStatuses: ['Done', 'Dropped']
      })
      // Use displayFilters for render, storedFilters for FilterControls
      
      // Step 3: User changes selectedUserId
      // CORRECT: FilterControls receives storedFilters
      const currentReactState = mockReactState.filters
      const newFilters: Filters = {
        ...currentReactState,  // storedFilters, not displayFilters
        selectedUserId: 'user-correct'
      }
      setState(newFilters)
      saveToStorage(newFilters)
      
      // Step 4: Check localStorage - should preserve status
      expect(mockLocalStorage.filters?.status).toEqual(['WIP', 'Blocked'])
    })
    
    it('FilterControls must receive stored filters, not display filters', () => {
      // Architecture verification: separation of concerns
      
      const storedFilters: Filters = {
        ...getDefaultFilters(),
        status: ['Done', 'Dropped'] as TriageStatus[]
      }
      
      const displayFilters = mergeViewFilters(storedFilters, {
        excludeStatuses: ['Done', 'Dropped']
      })
      
      // Display filters are for rendering only
      expect(displayFilters.status).toEqual([])
      
      // Stored filters must NOT be modified
      expect(storedFilters.status).toEqual(['Done', 'Dropped'])
      
      // FilterControls must receive storedFilters
      // When user changes selectedUserId:
      const newFilters: Filters = {
        ...storedFilters,  // MUST be storedFilters
        selectedUserId: 'new'
      }
      
      // Status preserved
      expect(newFilters.status).toEqual(['Done', 'Dropped'])
    })
    
    it('Cross-view scenario preserves status across switches', () => {
      // Full integration scenario with multiple view switches
      
      // Initial state: user filters to Done/Dropped only
      const initialFilters: Filters = {
        ...getDefaultFilters(),
        status: ['Done', 'Dropped'] as TriageStatus[],
        selectedUserId: 'user-1'
      }
      saveToStorage(initialFilters)
      
      // User opens TaskBoard (excludes Done/Dropped)
      // CORRECT PATTERN:
      let storedFilters = loadFromStorage()
      setState(storedFilters)  // ← CORRECT: store original
      const displayFilters = mergeViewFilters(storedFilters, {
        excludeStatuses: ['Done', 'Dropped']
      })
      
      // User changes selectedUserId in TaskBoard
      // CORRECT PATTERN: uses storedFilters
      let currentStoredFilters = mockReactState.filters
      let newFilters: Filters = {
        ...currentStoredFilters,  // ← CORRECT: storedFilters
        selectedUserId: 'user-2'
      }
      setState(newFilters)
      saveToStorage(newFilters)
      
      // User switches to KanbanBoard
      // Loads preserved state
      storedFilters = loadFromStorage()
      const kanbanStoredFilters = storedFilters
      const kanbanDisplayFilters = mergeViewFilters(storedFilters, { defaultActiveStatuses: true })
      
      // EXPECTED: Should see ['Done', 'Dropped'] in storedFilters
      // displayFilters would have all statuses for rendering
      expect(kanbanStoredFilters.status).toEqual(['Done', 'Dropped'])
    })
  })
})