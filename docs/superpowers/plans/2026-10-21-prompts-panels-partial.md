# 剩余提示词、统一右侧入口与局部重生成实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development. Continue the user's explicitly authorized original plan task by task. Use test-driven development and verification before completion; preserve completed commits and do not repeat approval requests for the original scope.

**Goal:** 完成任务总表 R08 剩余模板迁移、R06 右侧单项入口与 R05 指定镜头局部重生成，逐单元验收提交。

**Architecture:** 沿用 WorkbenchLibraryService 不可变发布、现有 jobs 请求快照、panel-manager-store 与 CreationService 乐观版本及候选采用机制。新能力扩展既有路径，不替换创作数据源，不自动覆盖人工编辑。

**Tech Stack:** Spring Boot/JDBC/MySQL/Flyway；React/TypeScript/Zustand；JUnit/Vitest。

**Spec:** docs/competition/改造方案与实施计划.md §§8.2、9.1–9.4、10.1；docs/competition/项目状态与任务总表.md R05/R06/R08。用户明确要求依次实现、验收并提交。

## Global Constraints

- 仅修改 Ai-board-competition，沿用 feat/competition-m0 独立分支；不修改 ../Ai-board，不推送远程，不提交凭据和生成日志。
- 品牌：2026 山东省首届大学生 AI 大模型创新传播大赛 · 你的不对我的队。
- 声明：本版本仅供参赛展示与评审使用，非正式商业版本。
- 不恢复旧供应商；本轮不启用图片/视频、不发起真实媒体调用。文字功能允许真实验收，费用与用量留痕。
- 每完成独立可验证单元即提交，正文记录用途、验证命令和结果。
- 发布不可变、停用不回退；新任务冻结提示词、变量和实际请求，旧任务不因发布而变化。
- 单项切换保护目标/项目/账号边界；草稿按目标保留；异步结果不可写入另一目标。批量列表与参数按提交时冻结。
- 局部候选只覆盖显式选中且未锁定的镜头；不得修改未选镜头、资产集合、镜头 ID/序号或时长分配。基于完整分镜校验、版本冲突拒绝，采用后清除分镜确认。

## Review Focus

- 前端模板或媒体队列中遗漏的业务拼接；停用后仍暗中使用旧系统预设。
- A/B 面板切换、同名资产不同项目、账号变化的异步污染。
- 单次配置意外成为项目默认，或改变已经确认的批量快照。
- 局部输出增删镜头、伪造引用/资产、改 ID 或时长，覆盖未选人工修改。
- 刷新后重复生成、请求 UUID 携带不同目标、运行期间编辑或锁定变化导致旧候选覆盖。

### Task 1: 剩余提示词迁移

**Files:** WorkbenchLibraryService/受管理模板调用服务、新 Flyway 迁移；资产描述 parser/API；MQConsumer、AiVideoService、默认媒体拼接；旧系统指令与风格预设的必要桥接；相关后端/前端测试。

**Interfaces:** 保留现有核心发布接口和队列快照；新增模板阶段采用相同不可变记录及明确变量和能力约束。前端不再持有业务系统指令，用户输入继续作为数据。具体阶段表和请求 DTO 随实现交付，供后两任务使用现有生成接口。

- [ ] 写并观察失败测试：模板发布替换影响新请求、旧快照不变、停用拒绝、用户自定义历史内容保留、非法变量/能力拒绝；覆盖资产描述及媒体拼接。
- [ ] 盘点剩余模板并迁入发布管理，替换所有清单内运行期业务模板来源；程序安全规则继续代码强制。给出可复核的迁移清单，明确历史数据和纯用户输入。
- [ ] 跑完整相关测试、类型/构建与 scoped lint，自审后提交。迁移用实际隔离 MySQL 验证；媒体协议仅桩验收。

### Task 2: 统一右侧单项入口

**Files:** frontend EditorPage/ShotTable 相关行组件、panel-manager-store、RightPanelManager、图/视频面板及草稿/历史逻辑；相关测试。

**Interfaces:** 沿用 `openPanel('shot-image-generate'|'video-generate',{shotId,shotNo})`、项目资产 `asset-edit`。默认列表恢复其 activeTab；预览入口独立。

- [ ] 写并观察失败测试：行内生成操作打开同一右侧面板，不走单项弹窗；媒体不可用时按钮明确禁用；A/B 草稿与迟到结果隔离；返回保留列表分类，单次模型不改项目默认。
- [ ] 完成入口归一与必要目标草稿保护，保留绑定/大图/播放等非生成弹窗，批量参数冻结不受单项覆盖。
- [ ] 跑用户端全测试、类型/构建、scoped lint，浏览器验证五类入口、返回与不可用状态后提交。

### Task 3: 指定镜头局部重生成

**Files:** creation/CreationTypes、CreationService、新迁移（若需要）、CreationServiceTest；frontend creation types/api/hook/page/编辑器与测试。

**Interfaces:** 新增 POST `/api/creation/drafts/{id}/partial-runs` body `{requestId,revision,model,shotIds,lockedShotIds,instruction}`，返回已有 Run；stage=`STORYBOARD_PARTIAL`。冻结完整现有分镜、简报、已确认剧本及所选/锁定 ID。已有采用接口处理候选；Run.output 为可核对完整分镜候选，只将指定镜头替换回原数据；锁定为请求快照，不改变现有 Board 数据契约。

- [ ] 写并观察失败测试：UUID 幂等/改变目标拒绝、跨用户、空/未知/重复/锁定目标、未确认/过期剧本；输出只准所选镜头、ID/序号/时长/资产/来源校验；旧候选不能覆盖新编辑。
- [ ] 模板 `STORYBOARD_PARTIAL` 返回 `{shots:[完整 Shot 对象]}`；服务端要求输出集合精确匹配选中镜头，合并到冻结原分镜，完整校验后才成为 SUCCEEDED 候选。后台持久 jobs，不自动重复未知受理调用；采用由用户显式触发并保存事件。
- [ ] 页面提供镜头勾选与锁定、局部修改要求、明确目标数，使用现有恢复副本和原 UUID；脏编辑先保存，运行中不可混改提交目标；候选展示/采用沿用既有机制。
- [ ] 跑后端/用户端完整测试、构建；实际文字局部运行验收只改一个镜头、其他人工镜头保留，刷新/幂等/过期拒绝/导出证据验证后提交。

### Task 4: 整体验收、审查与任务总表

- [ ] 分任务独立审查并修复关键/重要问题；最终整体审查关注接口连接与并发/恢复边界。
- [ ] 在隔离 MySQL、端口 13000/13001/18080 验证迁移、管理界面与用户路径；不提交本机配置。
- [ ] 更新原规划勾选、任务总表、模板清单及验收记录；如实记录媒体仍不可用和外网 DNS 边界。文档提交并报告所有关键 commits 与工作区状态。
