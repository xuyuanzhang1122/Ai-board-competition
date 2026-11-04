# Task 1 report

Status: COMPLETE. Scoped commit b7f2226 (30 Task1 files). Maven released to root.

Working tree after commit contains only root-owned creation/partial files, V46 and plan changes; no unfinished Task1 source files.

## Scope

V45 migrates asset descriptions, shot/character/scene/prop images, video body/reference usage, video style prefixes, historic system prompt_templates and style_presets. See docs/competition/剩余提示词迁移验收记录.md for exact stages/variables/capabilities and residual classification.

- Asset-description endpoint enforces project ownership/type before model access and retains actual rendered template/version/variables/model/configured parameters in independent execution audit.
- Batch jobs render all inputs before creating the Job and persist media_prompt_snapshots per target before broker dispatch. MQ and AiVideoService consume only saved rendered requests; publishing/disabling later cannot rewrite accepted evidence. Missing legacy media snapshots fail closed.
- Default frontend business instructions removed. Explicit custom image content remains literal template input and is retained; cannot bypass stage disable. Existing user/history rows remain untouched.
- Legacy system/style reads resolve current immutable publication; disabled is omitted, no historical fallback. Old AsyncBatchTaskService removed after no callers/tests found. Media availability unchanged.
- STORYBOARD_PARTIAL variable case added at root request; feature/migration owned by Task3.

## Verification

- task1-all-java-reviewed.log: '*Test' full suite 231 pass, 0 failures/errors. Earlier all-java failure was root-owned CreationServiceTest.partialCandidateChangesOnlyChosenShotAndInvalidatesBoardConfirmation, fixed by root and rerun green.
- User frontend full suite 48 files /324 pass; admin4 files/12 pass; both builds pass. Existing bundle size/dynamic-import warnings remain.
- Scoped ESLint all changed editor files + admin PromptManage passes. git diff --check passes.
- Real isolated MySQL schema ai_board_competition_task1_20261027_100534: V1→V44, seeded historic system/user/enabled+disabled style rows, V45 migration, publication/new request/old snapshot/disable/preservation assertions, Flyway validation PASS. task1-mysql.log. Standalone classpath logging warnings only. No provider calls.
- Meaningful RED failures recorded for media capability, placeholder interpolation, frontend raw input, acceptance ordering, reference placeholder/order, custom-disable bypass and published style enable state before fixes.

## Concerns / exact boundaries

- Media remains unavailable; only stub protocol was exercised. No paid or real image/video/text calls.
- Old media messages with no acceptance snapshot refuse execution. Re-submit explicitly if wanted; historical results/prompts retained.
- Code-level schema/tool/safety rules, including brainstorm GUARD, remain code. Editable creation/topics sample briefs are user-input data. No remaining runtime default prefix/buildParsePrompt/resolveStylePromptPrefix source found in backend/src/main/java and frontend/src.
- This '*Test' suite excludes '*Tests' Spring startup test. Root owns subsequent package/start/runtime acceptance.
- Root-owned creation/partial files and plan edits remain uncommitted by this task; do not stage them with Task1.

## Review fix round 1 — 2026-10-30
Commit 22ebf70 addresses both important findings. Renderer accepts full caller context containing the declared subset and still rejects missing values. Single-shot characters/props preserve selected IDs until project/library resolution; caller URL used only when usable, ownership checked by scoped lookup. H2 regression exercises placeholder/null library fallbacks and foreign project rejection; service regression captures the actual frozen references. Watched red: publication render variable mismatch and captured placeholder/null URLs. Offline full Java *Test suite passed233, zero failures/errors/skips; no provider calls. Full output review-fixes-java.log.

Final acceptance-java.log Maven summary explicitly confirms233 tests; prior root filename-filter count231 undercounted the selected set.
