/**
 * Tests for staffStore - Staff management state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStaffStore } from './staffStore'

vi.mock('../services/api', () => ({
  staffAPI: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { staffAPI } from '../services/api'

describe('staffStore', () => {
  beforeEach(() => {
    useStaffStore.setState({
      staff: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  it('should fetch staff and populate state', async () => {
    const apiStaff = [
      {
        id: 1, email: 'waiter@demo.com', first_name: 'Carlos', last_name: 'Lopez',
        phone: '1234567890', dni: '12345678', hire_date: '2024-01-01',
        is_active: true, created_at: '2024-01-01',
        branch_roles: [{ branch_id: 1, role: 'WAITER' }],
      },
    ]
    vi.mocked(staffAPI.list).mockResolvedValueOnce(apiStaff)

    await useStaffStore.getState().fetchStaff()
    const state = useStaffStore.getState()

    expect(state.staff).toHaveLength(1)
    expect(state.staff[0].first_name).toBe('Carlos')
    expect(state.staff[0].id).toBe('1')
    expect(state.staff[0].branch_id).toBe('1')
    expect(state.staff[0].role_id).toBe('WAITER')
    expect(state.isLoading).toBe(false)
  })

  it('should add staff locally with auto-generated id', () => {
    const newStaff = useStaffStore.getState().addStaff({
      branch_id: '1',
      role_id: 'WAITER',
      first_name: 'Ana',
      last_name: 'Garcia',
      email: 'ana@demo.com',
      phone: '5551234',
      dni: '33456789',
      hire_date: '2024-06-01',
      is_active: true,
    })

    const state = useStaffStore.getState()
    expect(state.staff).toHaveLength(1)
    expect(newStaff.first_name).toBe('Ana')
    expect(newStaff.id).toBeTruthy()
    expect(newStaff.branch_roles).toEqual([{ branch_id: '1', role: 'WAITER' }])
  })

  it('should filter staff by branch including multi-branch roles', () => {
    useStaffStore.setState({
      staff: [
        {
          id: 's1', branch_id: '1', role_id: 'WAITER', first_name: 'A', last_name: 'B',
          email: 'a@b.com', phone: '', dni: '', hire_date: '', is_active: true,
          branch_roles: [{ branch_id: '1', role: 'WAITER' }, { branch_id: '2', role: 'WAITER' }],
          created_at: '', updated_at: '',
        },
        {
          id: 's2', branch_id: '3', role_id: 'KITCHEN', first_name: 'C', last_name: 'D',
          email: 'c@d.com', phone: '', dni: '', hire_date: '', is_active: true,
          branch_roles: [{ branch_id: '3', role: 'KITCHEN' }],
          created_at: '', updated_at: '',
        },
      ],
    })

    // Staff s1 has branch_roles for branch 2, so it should be included
    const branch2Staff = useStaffStore.getState().getStaffByBranch('2')
    expect(branch2Staff).toHaveLength(1)
    expect(branch2Staff[0].id).toBe('s1')

    const branch3Staff = useStaffStore.getState().getStaffByBranch('3')
    expect(branch3Staff).toHaveLength(1)
    expect(branch3Staff[0].id).toBe('s2')
  })

  it('should delete staff member', () => {
    useStaffStore.setState({
      staff: [
        { id: 's1', branch_id: '1', role_id: 'WAITER', first_name: 'A', last_name: 'B', email: 'a@b.com', phone: '', dni: '', hire_date: '', is_active: true, branch_roles: [], created_at: '', updated_at: '' },
        { id: 's2', branch_id: '1', role_id: 'KITCHEN', first_name: 'C', last_name: 'D', email: 'c@d.com', phone: '', dni: '', hire_date: '', is_active: true, branch_roles: [], created_at: '', updated_at: '' },
      ],
    })

    useStaffStore.getState().deleteStaff('s1')
    const state = useStaffStore.getState()

    expect(state.staff).toHaveLength(1)
    expect(state.staff[0].id).toBe('s2')
  })
})
