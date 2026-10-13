import { describe, expect, it, vi } from 'vitest'

import type { ProjectVO } from '@/shared/types/api'

import { initializeEditorPage } from './editor-page-logic'

const project = (id: number): ProjectVO => ({
  aspectRatio: '16:9',
  createdAt: '2026-06-28T00:00:00Z',
  eraSetting: null,
  folderId: null,
  id,
  name: `项目 ${id}`,
  styleCode: 'default',
  updatedAt: '2026-06-28T00:00:00Z',
})

describe('initializeEditorPage', () => {
  it('rejects non-numeric or missing route ids', async () => {
    const deps = {
      fetchProjectDetail: vi.fn(async (id: number) => project(id)),
      initProject: vi.fn(async () => undefined),
    }

    await expect(initializeEditorPage(undefined, deps)).resolves.toMatchObject({ ok: false })
    await expect(initializeEditorPage('abc', deps)).resolves.toMatchObject({ ok: false })
    await expect(initializeEditorPage('', deps)).resolves.toMatchObject({ ok: false })

    expect(deps.fetchProjectDetail).not.toHaveBeenCalled()
    expect(deps.initProject).not.toHaveBeenCalled()
  })

  it('fetches project detail and editor data in parallel', async () => {
    const deps = {
      fetchProjectDetail: vi.fn(async (id: number) => project(id)),
      initProject: vi.fn(async () => undefined),
    }

    const result = await initializeEditorPage('7', deps)

    expect(result).toEqual({ ok: true, project: project(7), projectId: 7 })
    expect(deps.fetchProjectDetail).toHaveBeenCalledWith(7)
    expect(deps.initProject).toHaveBeenCalledWith(7)
    expect(deps.fetchProjectDetail.mock.invocationCallOrder[0]).toBeDefined()
    expect(deps.initProject.mock.invocationCallOrder[0]).toBeDefined()
  })

  it('surfaces detail fetch failures while starting editor data in parallel', async () => {
    const deps = {
      fetchProjectDetail: vi.fn(async () => {
        throw new Error('project not found')
      }),
      initProject: vi.fn(async () => undefined),
    }

    const result = await initializeEditorPage('99', deps)

    expect(result).toEqual({ ok: false, error: 'project not found' })
    expect(deps.initProject).toHaveBeenCalledWith(99)
  })
})
