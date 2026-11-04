# Task 3 independent review

Reviewed commit range `b7f2226..cdd5d20`, the Task 3 brief/report, and the changed interfaces needed to assess request recovery, frozen merge validation, ownership and stale-candidate adoption. No code or index changes; no broad suites rerun. Existing Java/frontend/build and real-provider evidence were supplied by the implementer and were not independently rerun.

## Important — allow unlocking a stale board

`frontend/src/features/creation/CreationPage.tsx:323` and `frontend/src/features/creation/PartialRegeneration.tsx:16` apply generation prerequisites to the fieldset containing the persistent lock checkboxes. Reproduction: lock a shot; save a change to the script or brief while retaining the board; confirm the script. `boardScriptVersion !== scriptVersion` remains true, so every unlock checkbox is disabled. Full-board generation is also disabled by the nonempty locks at `CreationPage.tsx:294`, and partial generation correctly rejects the stale board. The normal regeneration flow is therefore blocked until the user makes an unrelated board edit or calls the API directly. An unavailable language model similarly disables lock management unnecessarily.

Separate lock-management availability from partial-generation availability. Lock changes should still require a saved/current draft and no busy, uncertain or running operation, but should not require a confirmed/current script, current board-script version or available language model. Keep those generation prerequisites on the target/instruction/generate controls. Add a regression covering lock → script edit/save/confirm → unlock → full generation enabled.

## Remaining assessment

No other actionable correctness finding in scope. The draft ownership check precedes lock/partial/evidence access; partial retries compare the original complete request before scheduling; draft row locking serializes acceptance; frozen selected-shot merge preserves unselected shots, assets, numbering and timing and then invokes full validation; revision changes reject adoption after lock/manual edits; submitted partial requests reuse the existing persisted uncertain-request recovery path.

**Verdict: changes requested for the important UI workflow issue above.**
