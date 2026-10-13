# 生成任务跨刷新恢复 — 实现计划（派 Codex/Kimi）

## 问题（用户报告）
触发生成后不小心关闭浏览器 → 重新打开 → 任务"跑丢"：图片/视频/资产画像不再出现。用户三类生成（角色/场景/道具画像、分镜图、视频）都要覆盖。

## 根因（已定位）
前端的"刷新恢复"机制（`store.ts` 的 `activeJobs` + `resumeActiveJobs` + `pollActiveJobs`）**只覆盖分镜图和视频**，资产画像（角色/场景/道具）完全没纳入：

- `isShotGenerationJobType`（`frontend/src/features/editor/store.ts:236`）只认 `BATCH_GEN_SHOT_IMG` / `SINGLE_SHOT_IMAGE` / `BATCH_GEN_VIDEO` / `SINGLE_SHOT_VIDEO`。
- 资产的后端 jobType 是 `BATCH_GEN_CHAR_IMG` / `BATCH_GEN_SCENE_IMG` / `BATCH_GEN_PROP_IMG`（`backend/.../BatchGenerationService.java:303/366/470`）——被 resume 直接跳过。
- `batchGenerateCharacters` / `batchGenerateScenes`（`store.ts:283/302`）以及单个 `generateCharacterImage` / `generateSceneImage`（`store.ts:585/602`）**都没有把 job 注册进 `activeJobs`**，不像 `batchGenerateShots`/`batchGenerateVideos`（`store.ts:315/340`）会注册。
- **资产画像还有第二条提交路径绕过 store**：资产编辑面板 `useAssetGeneration.ts` 直接调 `generationApi.generateSingleCharacter/Scene/Prop`，`isGenerating` 只是 `useState`（`useAssetGeneration.ts:421`）——关标签页即丢，且从没进过 `activeJobs`。

### 结论
- **后端不丢**：资产/图/视频都是持久化 `Job`，RabbitMQ worker 独立于浏览器完成并落库。所以结果没真丢——是前端刷新后不再追踪、也不再重取，导致缩略图不出现。
- **丢失窗口**：重新打开时该 job 仍在跑。若打开时 job 已完成，`fetchCharacters/Scenes/Props`/`fetchShots` 本来就能取到——所以问题只在"打开时还在生成中"。
- 非终态：`PENDING`/`RUNNING`；终态：`SUCCEEDED`/`COMPLETED`/`FAILED`/`CANCELED`（后端已确认，resume 查 RUNNING+PENDING 够用）。

## 目标
所有生成 job（角色/场景/道具画像、分镜图、视频），无论从哪条路径提交（store 批量、store 单个、资产编辑面板单个），刷新/重开后都能被重新追踪，终态时自动重取对应数据，结果不再"丢"。**核心改动全在前端**（后端已持久化）。

---

## 改动清单（全部 `frontend/src/features/editor/`，除非注明）

### 1. 泛化 job 种类
`store.ts`：
- `ActiveGenerationJob.kind` 从 `'image' | 'video'` 扩为 `'shot-image' | 'video' | 'character' | 'scene' | 'prop'`（保留语义清晰；`image` 改名 `shot-image` 避免歧义，全量替换引用）。
- 把 `isShotGenerationJobType` 换成 `classifyGenerationJobType(jobType: string): ActiveGenerationJob['kind'] | null`，覆盖全部 7 个 jobType：
  - `BATCH_GEN_VIDEO` / `SINGLE_SHOT_VIDEO` → `video`
  - `BATCH_GEN_SHOT_IMG` / `SINGLE_SHOT_IMAGE` → `shot-image`
  - `BATCH_GEN_CHAR_IMG` → `character`
  - `BATCH_GEN_SCENE_IMG` → `scene`
  - `BATCH_GEN_PROP_IMG` → `prop`
  - 其他（`PARSE_TEXT`/`EXPORT_ZIP`…）→ `null`
  - 注：`components/panels/generation-history.ts` 已有 `classifyGenerationJob`（只分 image/video，用于历史过滤），二者用途不同，**不要合并**，但可放同一工具文件并复用 jobType 常量，避免字符串散落。
- 单个资产生成端点复用 `BATCH_GEN_*_IMG`（1 个 target），**实现前先确认** `generateSingleCharacter/Scene/Prop` 返回的 jobType 字符串确实是这几个（读后端 `/projects/{id}/generate/character/{cid}` 对应 service 方法）；若是别的（如 `SINGLE_CHAR_IMG`）则在 `classifyGenerationJobType` 补上。

### 2. 统一注册入口
`store.ts` 新增 action：
```
registerGenerationJob(jobId: number, kind: ActiveGenerationJob['kind'], targetIds: number[] = [])
```
按 jobId 去重后 append 到 `activeJobs`。所有提交点改为调用它：
- `batchGenerateShots`（`'shot-image'`, request.targetIds）——把现有内联注册重构成调用它。
- `batchGenerateVideos`（`'video'`, request.targetIds）——同上。
- `batchGenerateCharacters`（`'character'`, request.targetIds）——新增。
- `batchGenerateScenes`（`'scene'`, request.targetIds）——新增。
- `batchGenerateProps`（`'prop'`）——**若 store 里存在**（先确认；道具批量后端有 `BATCH_GEN_PROP_IMG`，但前端 store 可能只走面板）。
- `generateShotImage` / `generateVideo` / `generateCharacterImage` / `generateSceneImage`（+ `generatePropImage` 若有）单个生成——注册 `targetIds:[id]`。
- **资产编辑面板**：`useAssetGeneration.ts` 在 `generationApi.generateSingleCharacter/Scene/Prop`（及 `createProjectAsset` 触发生成）拿到 `jobId` 后，调 store 的 `registerGenerationJob(jobId, kind, [assetId])`。这是最关键的一根"补线"——面板路径此前完全不进 store。注意 `useAssetGeneration` 是依赖注入风格，需把该 action 通过 deps 传入（对齐现有 deps 模式，别直接 import store 破坏可测性）。

### 3. resumeActiveJobs（`store.ts:947`）
- 把 `isShotGenerationJobType` 调用换成 `classifyGenerationJobType`，让 RUNNING/PENDING 的**所有种类** job 都被恢复（当前把资产种类丢了）。`shotIds` 恢复后仍为 `[]`。

### 4. pollActiveJobs（`store.ts:789`）终态处理按 kind 分流
终态完成时，按 `kind` 重取对应数据：
- `shot-image` / `video`：维持现状——有 targetIds 走 `refreshShots(ids)`（定点刷新），恢复来的（无 targetIds）回退 `fetchShots()`。
- `character` → `Promise.all([fetchCharacters(), fetchShots()])`
- `scene` → `Promise.all([fetchScenes(), fetchShots()])`
- `prop` → `Promise.all([fetchProps(), fetchShots()])`
- **为何资产也要 `fetchShots()`**：分镜里资产缩略图（绑定 tile 的 `shot.characters[].thumbnailUrl` 等）来自 shot 的 join，只 `fetchCharacters` 不刷新分镜里的缩略图。资产列表/面板则靠 `fetchCharacters/Scenes/Props` 更新。
- 失败态：`shot-image`/`video` 仍按现有逻辑把对应 shot cell 标 `FAILED`；资产种类没有 shot cell 可标，只 `notifier.error(errorMessage)`。
- 保留现有"终态但 fetch 失败则把成功 job 留在 activeJobs 下轮重试"的容错。

### 5. 轮询驱动
`useStoryboardPolling(shots, activeJobCount, pollActiveJobs)` 已由 `activeJobs.length` 驱动，天然通用。确认编辑器打开时它一直挂载（在 `StoryboardTable`，OK）。无需改。

---

## 测试（`editor-store.test.ts` 已有 job 相关用例可参照）
1. `resumeActiveJobs` 能恢复资产 job（`BATCH_GEN_CHAR_IMG`/`SCENE`/`PROP`）——之前会被丢掉。
2. `pollActiveJobs`：资产 job 终态 → 调 `fetchCharacters`(/Scenes/Props) **且** `fetchShots`，而不只是 `fetchShots`。
3. `registerGenerationJob` 去重、各提交点都注册（含面板路径 mock）。
4. 单个生成也注册 job。
5. `classifyGenerationJobType` 全 7 类映射 + null 用例。
6. 面板 `useAssetGeneration` 提交后调用注入的 `registerGenerationJob`（在 `asset-edit-generation.test.ts` 补 deps mock 断言）。

## 验收
- `npx tsc --noEmit` / `npx eslint` / `npx vitest run` 全绿。
- 真机 smoke（需 :8080 + 账号 + 项目）：触发角色画像生成 → 生成中途刷新/关重开 → 完成后缩略图自动出现（不再需要手动再刷一次）。分镜图、视频同样验证。

---

## 分期
- **Stage A（本计划核心，必须）**：上面 1–5，消除"结果丢失"。全前端。
- **Stage B（可选 UX，另开）**：跨刷新的资产"生成中"指示器。当前资产 `isGenerating` 只是面板 local state，刷新后无处显示 spinner。要做需：后端在 job 上暴露 target 资产 id（好让前端在具体 tile 上盖 spinner），或前端加一个全局"N 个资产生成中"轻量角标（恢复来的 job 无 targetIds，无法定位到具体资产）。**建议先不做**，Stage A 已保证结果不丢。
- **可选后端 parity（另开）**：若希望视频 cell 刷新后也显示 GENERATING（分镜图靠后端 `findGeneratingShotImageIds` 做到了，视频可能没有对等来源），需后端加对等的"视频生成中"状态源。非必须。

## 注意
- 遵守铁则：后端冻结，本计划**核心是纯前端**，Stage B/parity 若真要动后端另行确认。
- 别引入死代码；`isShotGenerationJobType` 改名后全量替换，旧引用清干净。
