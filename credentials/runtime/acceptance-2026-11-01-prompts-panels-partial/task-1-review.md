# Task 1 independent review

Verdict: **Changes requested** — two important correctness findings. No critical or additional minor findings.

Reviewed scoped commit `b7f2226`, requirements in `task-1-brief.md`, implementation report, and supplied `review-1341c39..b7f2226.diff`. Root-owned creation/partial work and V46 were excluded. No product source, Git index, or HEAD changes; no broad test reruns or actual model/media calls.

## Important

### 1. [P2] Reject unusable variable declarations before publishing them

- Primary location: `backend/src/main/java/com/ym/ai_story_studio_server/workbench/WorkbenchLibraryService.java:276–278`.
- Related runtime contract: `backend/src/main/java/com/ym/ai_story_studio_server/workbench/ManagedPromptRenderer.java:22–24`; endpoint supplies both keys at `AssetDescriptionController.java:31–32`.
- `validateVariables` accepts any subset of the allowed keys, and `validatePlaceholders` accepts a template that only uses that subset. Publication then succeeds without checking that the declared keys match the fixed map supplied by the stage's callers. The renderer, however, requires exact set equality. For example, publishing `ASSET_SCENE_DESCRIPTION` content `Describe: {{sourceText}}`, variables `sourceText`, capability `TEXT` succeeds, immediately disables the previous version, and makes every subsequent real endpoint request fail with `提示词变量不匹配`, because the endpoint always supplies `assetName` and `sourceText`.
- Independently reproduced against the compiled classes with fresh H2 V40/V45 tables: version 2 was created and published successfully; rendering the actual endpoint variable map failed as above. No provider was involved.
- Fix: establish one consistent contract. Either require the full stage variable set during creation/publication, or allow the renderer to receive the stage's complete context and select declared variables. Add a focused publication-to-real-caller regression for omitted variables so an accepted publication cannot break the stage.

### 2. [P2] Resolve selected single-shot reference assets before freezing their URLs

- Primary location: `backend/src/main/java/com/ym/ai_story_studio_server/service/BatchGenerationService.java:692–695`.
- Related behavior: `backend/src/main/java/com/ym/ai_story_studio_server/workbench/MediaPromptSnapshots.java:30` and `:62–66`.
- The single-shot path now converts the selected character/prop objects directly into URL/label pairs and discards their IDs. When a selected thumbnail is null, blank, or a placeholder, snapshot rendering drops it; `forTarget` does not run the project/library fallback when explicit references were supplied. Previously the removed `MQConsumer.buildLabeledVideoReferences` resolved missing/placeholder character and prop thumbnails by their IDs. The frontend still sends truthy placeholder URLs (`video-generation.ts:60–66`), so a character with a project placeholder and a valid library portrait loses its reference on this path even though batch video correctly resolves it. The loss is frozen into the accepted snapshot and cannot be repaired by the consumer.
- Independently reproduced using one H2 project with a character placeholder and valid library portrait: bound references were `[person.png, scene.png]`, while the equivalent explicit single-shot references became `[scene.png]`.
- Fix: preserve selected IDs until server-side project/library lookup resolves their valid URLs, then deduplicate/filter/freeze them. Add single-shot coverage for placeholder/null character and prop thumbnails with valid fallback images; retain the explicit selection rather than silently adding all bound assets.

## Confirmed scope compliance

- New asset-description requests check project existence, deletion and ownership before rendering/provider execution; invalid type is rejected. Actual template/version/variables/model/configured parameters are audited before generation through the existing independent audit transaction.
- New media snapshots capture rendered prompt, templates, parameters and ordered references before queue dispatch. MQ consumers load saved values; missing legacy snapshots fail closed. Explicit custom shot-image input still passes through the managed stage and cannot bypass disable.
- Capability mismatch and unknown declared placeholders are rejected. Rendering replaces template tokens once and preserves braces within user data.
- Legacy system-template reads resolve publication, omit disabled versions, and leave user templates/history unchanged. Existing update/delete methods reject system rows. Style reads use publication status and content rather than mutable legacy `enabled`/prefix values.
- Migration and inventory document the new stages, historical preservation, unavailable-media boundary, and reported isolated MySQL/full-suite evidence. Existing broad test results were treated as supplied verification evidence rather than rerun.

## Review verification

A temporary Java source file outside the repository ran two focused checks against `backend/target/classes`, the existing local dependencies, and a fresh in-memory H2 database. It loaded V40/V45, reproduced both findings, exited 0, and was removed with its temporary directory. No persistent database, network, model provider, product file, index or HEAD mutation occurred. Only this requested ignored review report was written.
