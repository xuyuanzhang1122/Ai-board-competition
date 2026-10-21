# 受控头脑风暴、知识审核与提示词管理实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development. Execute the already user-authorized original plan; do not require repeated scope approval. Use test-driven-development, independent review and verification-before-completion.

**Goal:** 完成知识审核、提示词发布及可选择确认大纲的受控头脑风暴，转入既有文字创作流程，实际运行验收并逐单元提交。

**Spec:** docs/competition/改造方案与实施计划.md §§7、10、12；项目状态与任务总表 R03/R04/R08。用户本轮明确授权按原规划逐项实现、验收提交。

**Architecture:** Spring JDBC 持久化资料/审核、提示词版本和头脑风暴运行/工具步骤/大纲确认。任务沿用 AiTextService 与 jobs，不给模型 SQL、Shell 或任意网络权限。用户端新头脑风暴工作台，管理端两个管理入口。独立参赛分支、数据库及端口继续沿用，不动原工程、不推送远程、不测试媒体。

## Global constraints and boundaries

- Brand and disclaimer exactly follow AGENTS.md. 题材面向参赛，受众/渠道不是商业调研前置条件。
- 已审核知识才可作为审核资料使用；编辑清除审核，过期事实不进入已审核检索，传说/演绎分开标注。URL存在不等于事实核实。授权说明单独保存。
- Prompt statuses DRAFT/PUBLISHED/DISABLED; published content immutable, concurrency checked publication, old jobs retain prompt/input snapshot. No silent fallback when required prompt disabled.
- Brainstorm limits: max8 tools, max5 external pages, max2 format repairs, configurable within hard upper bounds. Save each decision, tool result/reference/status/error, never hidden reasoning or credentials. Limits transfer to manual intervention.
- Only allow search_knowledge, web_search, read_page, validate_sources, save_draft, ask_user, finish. Enforce server-side schemas, approved source membership and output bounds. External unapproved pages remain unreviewed.
- External adapter optional configuration; missing key produces explicit unavailable tool evidence, never fabricated data. Reject local/private/metadata URLs, credentials, redirects to private networks; no direct arbitrary fetch in application.
- Persist accepted input/model/prompt; UUID idempotency and revision checks; close page doesn't cancel; unknown accepted upstream work never auto-resubmitted. Restart unknown running work goes to manual reconciliation.
- 2–3 structured outline directions, each editable and selectable. Confirmed outline version/sources copied to a fresh creation brief/materials and linked immutably; repeat handoff same project draft; edits invalidate confirmation; never overwrite human edits.

## Shared API contracts (JSON wrapped in existing Result)

Admin root `/api/admin/workbench`, user approved knowledge `/api/workbench/knowledge?query=`.

Knowledge DTO: `{id,revision,title,content,sourceUrl,sourceOrganization,publishedOn,collectedAt,summary,factType,topics,license,status,reviewNote,reviewedBy,reviewedAt,validUntil}`. String fields use strings (nullable dates ISO YYYY-MM-DD, timestamps ISO/text). factType FACT/LEGEND/FICTION; status DRAFT/APPROVED/REJECTED. POST `/knowledge` and PUT `/knowledge/{id}` same editable fields (PUT includes revision); POST `/knowledge/{id}/review` `{revision,status,reviewNote}` APPROVED/REJECTED. GET returns array, query bounded, at most100.

Prompt DTO `{stage,version,content,variables,capability,status,changeNote,authorId,createdAt,publishedVersion}`. GET `/prompts`; POST `/prompts` `{stage,content,variables,capability,changeNote}` creates immutable DRAFT; POST `/prompts/{stage}/{version}/status` `{status,expectedPublishedVersion}` publishes or disables with concurrency check. Stages include BRAINSTORM/SCRIPT/STORYBOARD and migrated runtime business prompts. Service class `workbench.WorkbenchLibraryService`, `published(String stage)` returns Prompt record; `approvedKnowledge(String query)` returns List<Knowledge> records. All write service methods enforce AdminContext.

Brainstorm root `/api/brainstorms` GET list, POST create `{requestId,brief}` where brief is CreationTypes.Brief. GET `/{id}` returns `{id,revision,brief,outline,confirmed,creationDraftId,runs}`. outline nullable `{directions:[{id,title,angle,keyMessage,beats:[string],emotion,callToAction,sourceIds:[string],reviewNotes:[string]}],selectedId,selectionReason}`. Each knowledge snapshot source ID `knowledge-<id>-v<revision>`; external source IDs stable per run.

PUT `/{id}` `{revision,brief,outline}` saves human edits, invalidates confirmation. POST `/{id}/runs` `{requestId,revision,model}` returns run; POST `/{id}/runs/{runId}/adopt` `{revision}`; POST `/{id}/confirm` `{revision}`; POST `/{id}/creation` `{revision,requestId}` returns `{draftId}`; GET `/{id}/export` JSON evidence. Run DTO `{id,status,inputRevision,model,promptVersion,error,output,steps}` output is outline or null. Step `{id,tool,status,inputSummary,result,createdAt}` includes MODEL plus tools, bounded result. User owns all requests. API internal details may be added compatibly; no field shape changes without notifying coordinator.

## Tasks

### Task 1: Knowledge and prompt backend
- [x] RED→GREEN tests for review invalidation, stale edits, expiry, authorization, immutable prompts and publication conflicts.
- [x] V40 migration plus library service/controllers, seeded existing creation prompts, creation lookup switched to published version; snapshot semantics preserved.
- [x] Inventory other runtime business prompts, migrate active text prompts where feasible in this unit, record exact residual media templates rather than claim all migrated.
- [x] Full Java unit suite, commit with evidence.

### Task 2: Admin management UI
- [x] Separate knowledge editor/review page and versioned prompt editor/publish/disable/history page; route/nav additions.
- [x] API/state tests first, conflict/error retention, no unsaved edits overwritten on refresh.
- [x] Tests, typecheck/build/lint, commit. Depends only shared API contract; backend may be developed independently.

### Task 3: Controlled brainstorm backend
- [x] V41 tables, owned revision/idempotency, persisted worker using existing jobs and provider snapshots.
- [x] White-listed structured decisions and tools; approved knowledge, bounded external adapter, source validation, 2–3 directions, human confirmation and idempotent creation handoff/export.
- [x] RED→GREEN for invalid tool/limit/citation, restart/unknown acceptance, stale adoption, cross-user access, handoff and immutable snapshots. Full tests and commit.

### Task 4: Brainstorm UI and integration
- [x] Account-session-bound API, recovery UUID, server polling; brief and outline editing, selected direction/reason and confirmation; step evidence and JSON export, route to creation.
- [x] Main toolbox entry labeled 头脑风暴, historical conversation remains readable under original text chat entry.
- [x] API/state/components tests, test/build/typecheck/lint, commit.

### Task 5: Review and real acceptance
- [x] Independent review, repair important findings with regressions.
- [x] Isolated migrations/restart; admin knowledge edit/review and prompt publish; user knowledge filtering and permission rejection.
- [x] Real text brainstorm, tool evidence, choose/edit/confirm outline, handoff and script continuity; refresh/idempotency/export. No media calls.
- [x] Update original task register and acceptance evidence with exact scope, commands/counts, commits and remaining tasks. Commit; report honest final state.

## Completion evidence (2026-10-21)

本次优先功能基础实现与真实文字链路验收已完成。详见 docs/competition/受控头脑风暴与审核提示词验收记录.md 及原任务总表。独立交叉检查与主代理复核发现的问题已修复并补回归；中断后收尾由主代理完成，不声称中断后的全部改动另经第二位审查者复核。

实际 MySQL 迁移至 V44；Java *Test 213、用户端320、管理端12通过。外网实际服务调用遇本机保留地址DNS，安全阻断有证据，成功页面读取未验收。资产描述前端模板、媒体拼接与旧预设迁移仍明确留在原总表 R08/M4；项目整体未完成。
