# Task 1 scoped re-review

Verdict: **Approved** for fix commit `22ebf70` (`cdd5d20..22ebf70`). Both prior important findings are **ADDRESSED**. No new critical or important breakage found in the fix diff.

## Prior findings

1. **ADDRESSED — published variable subsets agree with caller context.** `ManagedPromptRenderer.render` now requires the caller context to contain every declared variable rather than equal the declared set. The asset-description endpoint's fixed `assetName`/`sourceText` map can therefore render a published `sourceText` subset. Missing declared values and capability mismatches still fail; creation still validates allowed declarations and requires template placeholders to be declared. Full caller context remains in the immutable rendered evidence. The new publication-to-render regression uses the actual endpoint map shape, asserts successful subset interpolation and retained context, and checks missing declared input rejection.

2. **ADDRESSED — selected single-shot references resolve before freezing.** `generateSingleShotVideo` retains each selected character/prop ID long enough to call `selectedReference` before `prepareMedia`, Job creation, snapshot persistence and dispatch. The helper always scopes the selected project row by ID and project, keeps a usable explicit URL, and otherwise uses the shared project → library → character-ready-asset resolution. The explicit list remains the input to `forTarget`; it does not expand into all bound characters/props. Existing filtering/deduplication and reference ordering then run before snapshot freezing. The added H2 assertions cover placeholder character/library fallback, null prop/library fallback, selected labels and foreign-project rejection; the service regression checks the resolved selected list passed to snapshot preparation.

## Boundary checks

- Disabled prompt stages still fail through `library.published`; the renderer change does not bypass publication or capability checks.
- Production image/video availability is unchanged. `UnavailableMediaProvider` still rejects validation and generation; the single-shot entry point still validates its video model first. The fix adds no provider implementation, enable switch, fallback provider or network call.
- Frontend filtering of absent thumbnails and existing scene/shot-reference behavior are outside this fix; no new important regression from the three production-file changes was identified.

## Verification and limits

Read the two prior findings, latest fix report, supplied fix diff, and surrounding renderer, publication validation, snapshot, single-shot caller, frontend request mapping and unavailable-provider code. Inspected the added focused regressions. This is a source-level re-review: no tests were rerun and no model/media/provider requests were made. The report's full-suite result is supplied evidence, not independently rerun verification. No product code, Git index or HEAD changes; only this requested review report was written. Root-owned creation/editor work was excluded.
