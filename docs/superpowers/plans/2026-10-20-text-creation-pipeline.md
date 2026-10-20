# 文字创作到剧本与分镜实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 从创作需求生成可编辑、可确认的剧本，继而生成结构化分镜，事务性建项目并在编辑器回读，完成真实文字联调。

**Architecture:** 增加独立创作工作台，草稿、版本、确认与运行快照由服务端持有。生成沿用已验证的官方文字任务协议与用量记录，数据库轮询驱动，不依赖浏览器连接。分镜包使用稳定资产 ID，校验通过才允许确认和建项目；人工修改采用版本检查，模型结果不覆盖后续编辑。

**Tech Stack:** Java 17 / Spring Boot / JdbcTemplate / MySQL / React / TypeScript / Vitest。

**Spec:** docs/competition/改造方案与实施计划.md 第七、八、十、十二节；用户 2026-10-20 明确优先文字完整流程，暂不测试图片视频。

## Global Constraints

- 在 Ai-board-competition 当前参赛分支继续，原工程只读；不推送远程。
- 仅使用官方同步目录内启用的文字模型；不调用图片、视频。
- 品牌为 2026 山东省首届大学生 AI 大模型创新传播大赛 · 你的不对我的队。
- 接受的任务与输入快照必须落库；断开浏览器不取消执行；未知上游受理不能自动重发。
- 项目建立必须事务原子、重复请求幂等、按用户隔离；任何校验失败不得留下半套项目。
- 保留确认版本和修改记录；重新生成先形成候选，不能静默覆盖人工修改。
- 默认使用标注的虚构创意案例；无资料时不声称历史事实已核验。

## Review Focus

- 请求超时后的原 UUID 重试、重复点击、并发修改不能重复生成或覆盖。
- 跨用户读取/写入/导出必须拒绝，切换账号不显示旧账号内容。
- 无效 JSON、无效资产引用、镜头总时长不符、模型截断必须保留原始运行结果和错误，不能自动建项目。
- 保存人工修改、重生成与旧版本导入应明确过期关系；已建项目不能被随后更新覆盖。
- 浏览器刷新、服务端重启后已接受任务可追溯，RUNNING 的未知受理不得盲目重发。

### Task 1: 服务端创作与项目转换

**Files:** backend/src/main/java/com/ym/ai_story_studio_server/creation/；backend/src/main/resources/db/migration/V39__text_creation_pipeline.sql；backend/src/test/java/com/ym/ai_story_studio_server/creation/。

**Interfaces:** REST `/api/creation/drafts`、`/{id}`、`/{id}/runs`、`/{id}/confirm`、`/{id}/project`、`/{id}/export`；草稿含 brief、script、storyboard、revision、确认版本；运行含 jobId、stage、inputRevision、output、status、promptVersion。

- [ ] 定义分镜 JSON 契约及校验测试：1–20 镜、15–90 秒、稳定资产 ID、角色/场景/道具引用、时长误差最多10%。
- [ ] 写服务测试并观察失败：落库幂等、权限、输入版本、保存/确认、任务失败/过期结果、重启处理。
- [ ] 实现持久草稿/运行/事件、版本提示词快照、后台执行与确认。
- [ ] 写事务转换测试并观察失败：资产绑定、扩展字段保留、幂等、异常回滚。
- [ ] 实现事务建项目与四 Sheet Excel 导出（扩展列明确保留于创作数据；旧导入兼容前六列）。
- [ ] 运行后端相关和完整单元测试，审查并提交。

### Task 2: 用户端完整创作入口

**Files:** frontend/src/features/creation/；frontend/src/app/router.tsx；frontend/src/app/MainLayout.tsx；frontend/src/features/home/HomePage.tsx。

**Interfaces:** 消费 Task 1 REST；动态文字模型来自现有官方目录；项目入口 `/editor/{id}`。

- [ ] 写 API、状态转换和过期响应测试并观察失败。
- [ ] 实现简报、剧本编辑确认、分镜编辑校验确认、持久运行候选采用、建项目与导出。
- [ ] 正常等待显示加载动画；未知受理保留 UUID 重试，不自动再次生成；脏编辑不被轮询覆盖。
- [ ] 首页和导航增加文字创作入口；真实未开放能力不展示成可用。
- [ ] 执行测试、类型检查、构建及页面验收，审查并提交。

### Task 3: 本机真实文字联调

**Files:** docs/competition/文字剧本分镜完整流程验收记录.md；README.md。

- [ ] 在隔离依赖迁移 V39、构建并重启后端；保留本机秘密配置。
- [ ] 用真实模型依次生成剧本/分镜，人工修改并确认，建项目、回读角色场景道具和镜头；验证刷新与幂等。
- [ ] 下载并核对 Excel，检查无重复项目、无图片视频任务；修复实际发现的阻断问题。
- [ ] 用户端浏览器走通同一流程并留截图；记录真实任务、模型、结果和未完成范围。
- [ ] 完成独立代码审查、必要回归，提交验收记录，报告提交及工作区状态。

此计划交付文字创作纵向流程；知识资料审核后台、全部提示词管理界面、受控外网检索和媒体联调仍按原计划后续推进，不以本轮验收冒充全部 M2/M3 完成。
