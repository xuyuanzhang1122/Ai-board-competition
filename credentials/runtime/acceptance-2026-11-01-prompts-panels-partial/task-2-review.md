# Task 2 independent review

Reviewed source commit `6f2cd51` against `a705e43`, the Task 2 brief, implementation report, and supplied diff. Follow-up `96946fd` only untracks the private report. No source/index changes, provider calls, or broad verification reruns were made. Root-owned documentation changes were excluded.

## Verdicts

- **Spec compliance: changes required.** Five entry routes, independent previews, return category, disabled media state, single-target model isolation, and normal nonempty A/B drafts are implemented. Empty description drafts and live account transitions leave two gaps in the binding draft/scope requirements.
- **Code quality: changes required.** The dependency guard and scoped leases cover the main async continuation boundaries, and managed panel keys correctly force remounts on ordinary target changes. The remaining scope and draft-state issues below should be fixed before accepting Task 2.

Reported verification is 342 passing tests plus type check, build, scoped lint and diff check. Root additionally verified the five unavailable generation states, image/video routing without generation modals, image quantities 2/1/2 across A/B/A, return to the props tab, description retention on an ordinary asset switch, and row/list character entry equivalence. Those checks do not cover the two transitions below.

## Critical findings

None found.

## Important findings

### 1. [P2] Preserve an intentionally empty description draft across remounts

Location: `frontend/src/features/editor/components/panels/asset-edit/useAssetDescriptionParser.ts:134-156`.

`usePanelDraft` correctly restores an empty string, but `editedRef` derives draft existence from `Boolean(aiDescription)`. Open an asset with an existing description, delete the whole description, visit another target and return: the restored empty string makes `editedRef` false, so `runDescriptionParse` runs and returns `input.existingDescription`, replacing the user's cleared draft. This affects props as well as scenes/characters when an existing description exists. With no existing description, a cleared character/scene draft can instead trigger another automatic text request and refill. This directly violates retaining the target's description draft through A/B navigation.

Persist an explicit edited/draft-present flag (or expose draft presence separately from its value), including when the value is `''`; only parse when there is no user draft or on explicit retry. Add a mounted A → B → A regression for a cleared description and assert no automatic parse dispatch.

### 2. [P1] Clear or reload editor-owned data on a live account switch before opening a new scoped panel

Location: `frontend/src/features/editor/components/RightPanelManager.tsx:63-68`; related `frontend/src/features/editor/store.ts:715-752` and `frontend/src/features/editor/EditorPage.tsx:68-96`.

The new account listener resets navigation and remounts the panel, but leaves `useEditorStore`'s shots/assets/local image history loaded for the previous account. A cross-tab A → B credential change can keep a nonempty token throughout; `RequireAuth` therefore keeps EditorPage mounted, and its initialization effect has no account dependency. The default panel then renders A's cached assets under B. Opening one seeds a B-keyed description draft from A's `existingDescription`; local image records can also be returned from the still-loaded A history. Changing browser-storage key names alone does not isolate this in-memory data. Even explicitly calling `initProject` for the same numeric project does not clear local history when B has no stored entry: clearing only occurs for a changed project ID and `loadLocalImageHistory` retains the prior map when the key is absent.

Handle the identity transition at the editor-data ownership boundary: synchronously invalidate/clear the prior account's project data and active jobs, then require a fresh authorized project load (or return to the project list) before rendering target actions. Track the loaded owner alongside the project, and replace local history with an empty map when that owner's storage key is absent. Add a live nonempty-token A → B regression proving no prior asset/description/history is visible or copied into B's drafts.

## Minor findings

No additional independent minor findings. The new draft regression uses server rendering, which cannot exercise the parser effect/remount failure in finding 1; the targeted mounted regression requested there addresses the material test gap.

## Scope observations

- Ordinary target navigation remounts via the managed panel key; account/project values additionally key the manager subtree.
- Lease checks suppress late UI/history continuations, while the proxy guards subsequent dependency calls and promise resolution boundaries. Already accepted backend requests remain outside frontend cancellation guarantees.
- No batch-payload or model-default persistence changes were found in this patch, and no restoration of the retired upstream media path was found.
