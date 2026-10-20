import type { ReactNode } from 'react'

import type { Board, Brief, Shot } from './types'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="creation-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function BriefEditor({
  brief,
  onChange,
}: {
  brief: Brief
  onChange: (value: Brief) => void
}) {
  const text = (
    key: 'theme' | 'audience' | 'channel' | 'goal' | 'materials',
    label: string,
    max: number,
  ) => (
    <Field label={label}>
      <textarea
        maxLength={max}
        rows={key === 'materials' ? 4 : 2}
        value={brief[key]}
        onChange={(event) => onChange({ ...brief, [key]: event.target.value })}
      />
    </Field>
  )
  return (
    <div className="creation-stack">
      <p className="creation-hint">
        默认案例为纯虚构创意。来源由创作者填写，未经审核；涉及事实和授权时请自行核对并记录。
      </p>
      {text('theme', '创作主题', 500)}
      <div className="creation-grid">
        {text('audience', '受众', 200)}
        {text('channel', '传播渠道', 100)}
      </div>
      {text('goal', '传播目标', 500)}
      <div className="creation-grid">
        <Field label="目标时长（15–90 秒）">
          <input
            max={90}
            min={15}
            type="number"
            value={brief.duration}
            onChange={(event) => onChange({ ...brief, duration: Number(event.target.value) })}
          />
        </Field>
        <Field label="画幅">
          <select
            value={brief.aspectRatio}
            onChange={(event) => onChange({ ...brief, aspectRatio: event.target.value })}
          >
            {['16:9', '9:16', '1:1', '21:9'].map((ratio) => (
              <option key={ratio}>{ratio}</option>
            ))}
          </select>
        </Field>
      </div>
      {text('materials', '参考资料与创意说明', 12000)}
      <details>
        <summary>来源与授权记录（{brief.sources.length}）</summary>
        <div className="creation-stack">
          {brief.sources.map((source, index) => (
            <fieldset className="creation-subcard" key={index}>
              <legend>来源 {index + 1}</legend>
              {(
                [
                  ['id', '稳定 ID'],
                  ['title', '来源标题'],
                  ['url', '网址（可选）'],
                  ['license', '授权与核验说明（可选）'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    value={source[key] ?? ''}
                    onChange={(event) =>
                      onChange({
                        ...brief,
                        sources: brief.sources.map((entry, i) =>
                          i === index ? { ...entry, [key]: event.target.value } : entry,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({ ...brief, sources: brief.sources.filter((_, i) => i !== index) })
                }
              >
                删除来源
              </button>
            </fieldset>
          ))}
          <button
            disabled={brief.sources.length >= 20}
            type="button"
            onClick={() =>
              onChange({
                ...brief,
                sources: [
                  ...brief.sources,
                  {
                    id: `source_${crypto.randomUUID().slice(0, 8)}`,
                    title: '',
                    url: '',
                    license: '',
                  },
                ],
              })
            }
          >
            添加来源
          </button>
        </div>
      </details>
    </div>
  )
}

export function StoryboardEditor({
  board,
  onChange,
}: {
  board: Board
  onChange: (value: Board) => void
}) {
  const updateShot = (index: number, patch: Partial<Shot>) =>
    onChange({
      ...board,
      shots: board.shots.map((shot, i) => (i === index ? { ...shot, ...patch } : shot)),
    })
  const reference = (
    shot: Shot,
    index: number,
    key: 'characters' | 'props' | 'scene',
    type: string,
    label: string,
  ) => (
    <Field label={label}>
      <select
        multiple={key !== 'scene'}
        value={key === 'scene' ? shot.scene : shot[key]}
        onChange={(event) =>
          updateShot(index, {
            [key]:
              key === 'scene'
                ? event.target.value
                : Array.from(event.target.selectedOptions, (option) => option.value),
          })
        }
      >
        {key === 'scene' && <option value="">选择场景</option>}
        {board.assets
          .filter((asset) => asset.type === type)
          .map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {asset.id}
            </option>
          ))}
      </select>
    </Field>
  )
  return (
    <div className="creation-stack">
      <Field label="分镜标题">
        <input
          maxLength={128}
          value={board.title}
          onChange={(event) => onChange({ ...board, title: event.target.value })}
        />
      </Field>
      <p className="creation-hint">
        {board.shots.length} 镜 · 共 {board.shots.reduce((total, shot) => total + shot.duration, 0)}{' '}
        秒。总时长须在简报目标的 ±10% 内。多选框可按住 Ctrl / Command 选择多个引用。
      </p>
      <details>
        <summary>角色 / 场景 / 道具资产（{board.assets.length}）</summary>
        <div className="creation-stack">
          {board.assets.map((asset, index) => (
            <fieldset className="creation-subcard" key={asset.id}>
              <legend>
                {asset.type} · {asset.id}
              </legend>
              <Field label="名称">
                <input
                  value={asset.name}
                  onChange={(event) =>
                    onChange({
                      ...board,
                      assets: board.assets.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="描述">
                <textarea
                  rows={2}
                  value={asset.description}
                  onChange={(event) =>
                    onChange({
                      ...board,
                      assets: board.assets.map((entry, i) =>
                        i === index ? { ...entry, description: event.target.value } : entry,
                      ),
                    })
                  }
                />
              </Field>
            </fieldset>
          ))}
          <p className="creation-hint">
            新增、删除资产或调整稳定 ID，请使用下方高级 JSON，同时维护镜头引用。
          </p>
        </div>
      </details>
      {board.shots.map((shot, index) => (
        <fieldset className="creation-subcard creation-stack" key={shot.id}>
          <legend>
            镜头 {shot.no} · {shot.id}
          </legend>
          <div className="creation-grid">
            <Field label="时长（秒）">
              <input
                max={90}
                min={1}
                type="number"
                value={shot.duration}
                onChange={(event) => updateShot(index, { duration: Number(event.target.value) })}
              />
            </Field>
            <Field label="景别">
              <input
                value={shot.shotSize}
                onChange={(event) => updateShot(index, { shotSize: event.target.value })}
              />
            </Field>
            <Field label="运镜">
              <input
                value={shot.cameraMovement}
                onChange={(event) => updateShot(index, { cameraMovement: event.target.value })}
              />
            </Field>
          </div>
          {(
            [
              ['visual', '画面'],
              ['narration', '旁白'],
              ['dialogue', '对白'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea
                maxLength={4000}
                rows={2}
                value={shot[key] ?? ''}
                onChange={(event) => updateShot(index, { [key]: event.target.value })}
              />
            </Field>
          ))}
          <div className="creation-grid">
            {reference(shot, index, 'characters', 'CHARACTER', '角色')}
            {reference(shot, index, 'scene', 'SCENE', '场景')}
            {reference(shot, index, 'props', 'PROP', '道具')}
          </div>
        </fieldset>
      ))}
      {board.reviewNotes.length > 0 && (
        <div className="creation-notice">
          <strong>待复核项</strong>
          <ul>
            {board.reviewNotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
