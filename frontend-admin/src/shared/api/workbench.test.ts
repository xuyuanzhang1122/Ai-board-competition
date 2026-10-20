import { AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, TOKEN_KEY } from './client'
import { workbenchApi } from './workbench'

const original = api.defaults.adapter
let token = 'session-a'
beforeEach(() => {
  token = 'session-a'
  vi.stubGlobal('localStorage', { getItem: (key: string) => (key === TOKEN_KEY ? token : null) })
})
afterEach(() => {
  api.defaults.adapter = original
  vi.unstubAllGlobals()
})
describe('workbench API contract', () => {
  it('sends revision and nullable dates unchanged to knowledge writes', async () => {
    api.defaults.adapter = async (config) => {
      expect(config.url).toBe('/admin/workbench/knowledge/7')
      expect(JSON.parse(config.data)).toMatchObject({
        revision: 4,
        publishedOn: null,
        validUntil: '2027-01-01',
      })
      return {
        config,
        data: { code: 200, data: { id: 7, revision: 5 }, message: '' },
        headers: new AxiosHeaders(),
        status: 200,
        statusText: 'OK',
      }
    }
    await expect(
      workbenchApi('session-a').updateKnowledge(7, {
        revision: 4,
        title: '事实',
        content: '内容',
        sourceUrl: '',
        sourceOrganization: '',
        publishedOn: null,
        summary: '',
        factType: 'FACT',
        topics: '',
        license: '',
        validUntil: '2027-01-01',
      }),
    ).resolves.toMatchObject({ revision: 5 })
  })
  it('creates immutable draft and publishes with observed published version', async () => {
    const requests: unknown[] = []
    api.defaults.adapter = async (config) => {
      requests.push([config.url, JSON.parse(config.data)])
      return {
        config,
        data: {
          code: 200,
          data: { stage: 'BRAINSTORM', version: 3, status: 'DRAFT' },
          message: '',
        },
        headers: new AxiosHeaders(),
        status: 200,
        statusText: 'OK',
      }
    }
    const client = workbenchApi('session-a')
    await expect(
      client.createPrompt({
        stage: 'BRAINSTORM',
        content: '内容',
        variables: 'brief',
        capability: 'TEXT',
        changeNote: '改进',
      }),
    ).resolves.toMatchObject({ version: 3 })
    await client.promptStatus('BRAINSTORM', 3, 'PUBLISHED', 2)
    expect(requests).toEqual([
      [
        '/admin/workbench/prompts',
        {
          stage: 'BRAINSTORM',
          content: '内容',
          variables: 'brief',
          capability: 'TEXT',
          changeNote: '改进',
        },
      ],
      [
        '/admin/workbench/prompts/BRAINSTORM/3/status',
        { status: 'PUBLISHED', expectedPublishedVersion: 2 },
      ],
    ])
  })
  it('rejects old-session requests and suppresses late responses', async () => {
    const client = workbenchApi('session-a')
    token = 'session-b'
    await expect(client.listPrompts()).rejects.toThrow('登录状态已改变')
    token = 'session-a'
    api.defaults.adapter = async (config) => {
      token = 'session-b'
      return {
        config,
        data: { code: 200, data: [], message: '' },
        headers: new AxiosHeaders(),
        status: 200,
        statusText: 'OK',
      }
    }
    await expect(client.listPrompts()).rejects.toThrow('登录状态已改变')
  })
})
