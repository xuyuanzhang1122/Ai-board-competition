# Final integration fix wave

Scope: close the single P2 in final-integration-review.md. No frontend, old SCRIPT/STORYBOARD stage, provider or documentation changes.

Implementation: CreationService now receives the existing ManagedPromptRenderer bean. Its partial endpoint builds one frozen context containing brief, confirmedScript, storyboard, selected shot IDs, locked shot IDs and instruction. Each context value is JSON serialized for the renderer; the original full context remains the unchanged structured user ChatTurn. The system ChatTurn uses the renderer's single-pass output. The creation run stores that same Rendered.version rather than looking up publication again. Original run body/request evidence remains unchanged. Disabled publication lookup still fails before queue acceptance.

Regression: CreationServiceTest.partialQueueRendersPublishedVariablesOnceAndFreezesOriginalInput publishes a legal custom template containing all six placeholders, accepts a real CreationService.partial job through real AiTextService queue acceptance, and persists the resulting textSnapshot through a stubbed JobMapper into isolated H2. It asserts the complete rendered system turn, selected/locked contexts, literal user braces/$/backslashes, structured user input and original request evidence. It publishes a replacement, verifies new jobs use the new version/output, disables it, and verifies old job snapshots/input evidence remain unchanged and new acceptance is rejected. Exactly two jobs are inserted; both provider execution methods are verified never called, and executor dispatch fails the test if attempted.

TDD evidence: focused CreationServiceTest initially failed 1 of 18 tests because the system snapshot contained literal {{brief}}, {{shotIds}}, {{instruction}}, etc. After the narrow production change the focused 18 tests pass. During test authoring a JsonNode numeric-kind expectation and a duplicate local variable were corrected; no production check was bypassed. Initial Maven invocation without repository settings failed offline repository-ID resolution; the proper existing backend/settings.xml invocation below succeeds.

Verification from repository root with bundled Java 17/Maven 3.9.9:

- `JAVA_HOME="$PWD/.superpowers/tools/jdk-17.0.20.1+1/Contents/Home" .superpowers/tools/apache-maven-3.9.9/bin/mvn -o -B -ntp -f backend/pom.xml -s backend/settings.xml -Dmaven.repo.local="$PWD/.superpowers/m2" '-Dtest=*Test' test`: Maven summary 234 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS. Private log final-fix-java.log.
- Same command with `-DskipTests package`: BUILD SUCCESS; packaged backend jar refreshed. Private log final-fix-package.log.
- `git diff --check`: passed.

No provider request, migration, database outside in-memory test fixtures, generated asset, remote operation or sibling-repository modification. Only backend production source and its test are staged; this report and logs remain ignored/private. Root owns packaged-backend restart and final scoped review.
