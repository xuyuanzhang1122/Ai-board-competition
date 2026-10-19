# Server-owned toolbox conversation reconstruction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Replace the current toolbox chat with a screenshot-grounded conversation UI whose tasks, messages and results survive closing/reopening the browser.

**Architecture:** The application server owns sessions, messages, frozen conversational context and durable jobs. POST atomically saves an idempotent message pair and a pending job; a bounded background worker executes persisted jobs without browser participation. Browser polls the durable session detail and can stop observing without canceling execution. Model discovery uses only the new official client. No text monetary quota, all supplier usage retained; no image/video supplier calls until account access is ready.

**Tech Stack:** Existing Java17/Spring/MySQL/JdbcTemplate/jobs and React/TypeScript/Lucide/CSS. No new external task service or replacement repository.

## Binding requirements and rulings

- User explicitly requests wholesale chat rebuild; old Lobe ChatList/ChatComposer/store layout are retired where they cannot reproduce the four provided ChatGPT screenshots.
- Match page structure: slim collapsible rail, restrained white canvas, centered blank-state composer, readable conversation column, right user bubble, unboxed assistant text, fixed bottom composer after messages, inline image task card with real status and result. Use project branding, no ChatGPT/OpenAI logo impersonation.
- Progress must reflect actual server data; never invent percentages such as 33/88 when upstream provides none. Image UI can be implemented while image execution remains explicitly unavailable.
- Browser closes, navigation and session changes do not cancel a server task. On reload, use URL session identity and server messages; no localStorage conversation JSON as authority.
- Text generation context must include server-saved previous user/assistant turns; client cannot supply assistant history.
- Durable request ID per send; retries return same job/messages. A server restart must not silently resubmit an upstream call that may have been accepted. Pending tasks can resume; uncertain running tasks require explicit failure/reconciliation.
- Preserve original ../Ai-board, isolate ports/data/queues, keep credentials/logs ignored. Each verified unit committed with validation.

## Shared HTTP contract (normal Result envelope)

Base `/api/toolbox/chat` (authenticated current user).

- GET `/sessions` -> `Session[]`; POST `/sessions` `{title?:string}` -> `Session`.
- GET `/sessions/{id}` -> `{session:Session,messages:Message[]}`.
- POST `/sessions/{id}/messages` `{clientRequestId:string,type:'TEXT'|'IMAGE'|'VIDEO',model:string,content:string,aspectRatio?:string}` -> `{userMessage:Message,assistantMessage:Message,jobId:number}`; fast acceptance, no long supplier response dependency.
- POST `/messages/{id}/cancel` -> `Message` (only assistant task; canceled observation does not mean supplier refunded/stopped).
- DELETE `/sessions/{id}` -> success, soft delete session, retain task audit.
- Session `{id:number,title:string,createdAt:string,updatedAt:string}`.
- Message `{id:number,role:'USER'|'ASSISTANT',type:'TEXT'|'IMAGE'|'VIDEO',content:string,model:string|null,jobId:number|null,status:'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'|'CANCELED',resultUrl:string|null,errorMessage:string|null,createdAt:string}`.
- Old `/toolbox/sessions` may remain for historical data but new UI never overwrites authoritative messages with `conversationsJson`.

## Tasks

- [ ] A (primary): complete official dynamic catalog, unrestricted text audit, model sync/admin-write concurrency safeguards; tests; immutable JAR deployment and official live checks.
- [ ] B (backend implementer): new durable chat controller/service/schema and server worker; ownership/idempotency/context/pending recovery tests; no paid test calls or runtime restarts; commit only owned backend files.
- [ ] C (frontend implementer): rebuild toolbox route/page/components/state around shared contract and supplied screenshots; proper responsive layout, session restoration, real task cards and disabled unimplemented media capability; tests/typecheck/build; remove obsolete chat components that are no longer used; commit only owned frontend files.
- [ ] D (primary + reviewers): verify spec and quality of B/C, integrate any necessary provider conversation support, run full suites and browser checks (empty state, real conversation, switching/reload and browser close/reopen during an accepted task), compare screenshots, verify media cannot call suppliers, update acceptance docs and commit.

Use independent source-file ownership to avoid cross-agent edits. Primary owns OfficialTextProvider/OfficialModelCatalog/registry/budget and admin UI; backend implementer owns new chat files and AiTextService/TextTaskSnapshot/TextGenerationProvider; frontend implementer owns toolbox and route/layout files but not shared model constants or admin files.
