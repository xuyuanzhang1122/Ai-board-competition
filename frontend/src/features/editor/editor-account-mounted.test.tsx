// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

import { useUserStore } from '@/shared/store/user'
import type { ProjectCharacterVO } from '@/shared/types/api'

import { characterApi, jobApi,propApi, sceneApi, shotApi } from './api'
import { usePanelDraft, usePanelTarget } from './components/panels/usePanelTarget'
import { EditorPage } from './EditorPage'
import { useProjectStore } from './project-store'
import { useEditorStore } from './store'

function AccountDraft({ asset }: { asset: ProjectCharacterVO }) {
    const target = usePanelTarget('account-mounted-regression', asset.id)
    const [description] = usePanelDraft(target.key, 'description', asset.description)
    return <span>{description}</span>
  }

vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@lobehub/ui', () => ({ Button: ({ children }: PropsWithChildren) => <button>{children}</button> }))
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), Link: ({ children }: PropsWithChildren) => <span>{children}</span> }))
vi.mock('./components/ProjectNameEditor', () => ({ ProjectNameEditor: () => null }))
vi.mock('./components/RightPanelManager', () => ({ RightPanelManager: () => null }))
vi.mock('./components/dialogs/AssetVersionModal', () => ({ AssetVersionModal: () => null }))
vi.mock('./components/dialogs/ModelConfigModal', () => ({ ModelConfigModal: () => null }))
vi.mock('./components/export/ExportModal', () => ({ ExportModal: () => null }))
vi.mock('./components/export/ExportProgressModal', () => ({ ExportProgressModal: () => null }))
vi.mock('./components/storyboard/StoryboardTable', () => ({ StoryboardTable: () => {
  const characters = useEditorStore((state) => state.characters)
  const userId = useUserStore((state) => state.userId)
  return <div>{characters.map((asset) => <AccountDraft asset={asset} key={`${userId}:${asset.id}`} />)}</div>
} }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('clears A assets/history synchronously and reloads a still-mounted editor for nonempty B credentials', async () => {
  useUserStore.setState({ userId: 1, token: 'session-A' })
  useEditorStore.getState().reset()
  const a = { id: 11, displayName: 'A角色', description: 'A私有描述', thumbnailUrl: null } as Awaited<ReturnType<typeof characterApi.getProjectCharacters>>[number]
  let finishB!: (value: typeof a[]) => void
  vi.spyOn(characterApi, 'getProjectCharacters').mockResolvedValueOnce([a]).mockImplementationOnce(() => new Promise((resolve) => { finishB = resolve }))
  vi.spyOn(sceneApi, 'getProjectScenes').mockResolvedValue([])
  vi.spyOn(propApi, 'getProjectProps').mockResolvedValue([])
  vi.spyOn(shotApi, 'getProjectShots').mockResolvedValue([])
  vi.spyOn(jobApi, 'getUserJobs').mockResolvedValue({ records: [] } as never)
  vi.spyOn(useProjectStore.getState(), 'fetchProjectDetail').mockImplementation(async () => {
    const project = { id: 7, name: '授权项目' } as Awaited<ReturnType<ReturnType<typeof useProjectStore.getState>['fetchProjectDetail']>>
    useProjectStore.getState().setCurrentProject(project)
    return project
  })
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<EditorPage />))
    expect(container.textContent).toContain('A私有描述')
    await act(async () => useEditorStore.setState({ localImageHistory: { character_11: [{ id: 1, url: 'https://test/A.png' } as never] } }))
    await act(async () => {
      localStorage.setItem('token', 'session-B')
      localStorage.setItem('user_id', '2')
      window.dispatchEvent(new StorageEvent('storage', { key: 'token' }))
      expect(useEditorStore.getState().characters).toEqual([])
      expect(useEditorStore.getState().localImageHistory).toEqual({})
      expect(useProjectStore.getState().currentProject).toBeNull()
    })
    expect(container.textContent).not.toContain('A私有描述')
    expect(characterApi.getProjectCharacters).toHaveBeenCalledTimes(2)
    await act(async () => finishB([{ ...a, description: 'B授权描述' }]))
    expect(container.textContent).toContain('B授权描述')
    expect(useEditorStore.getState().localImageHistory).toEqual({})
  } finally {
    await act(async () => root.unmount())
    vi.restoreAllMocks()
  }
})
