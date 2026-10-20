package com.ym.ai_story_studio_server.brainstorm;

import com.ym.ai_story_studio_server.creation.CreationTypes.Brief;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.ym.ai_story_studio_server.creation.StrictNumbers;
import java.util.List;

public final class BrainstormTypes {
    private BrainstormTypes() {}
    public record Direction(String id, String title, String angle, String keyMessage, List<String> beats,
                            String emotion, String callToAction, List<String> sourceIds, List<String> reviewNotes) {}
    public record Outline(List<Direction> directions, String selectedId, String selectionReason) {}
    public record Step(long id, String tool, String status, String inputSummary, JsonNode result, String createdAt) {}
    public record Run(long id, String status, long inputRevision, String model, int promptVersion,
                      String error, Outline output, List<Step> steps) {}
    public record Draft(long id, long revision, Brief brief, Outline outline, boolean confirmed, Long creationDraftId, List<Run> runs) {}
    public record Create(String requestId, Brief brief) {}
    public record Save(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, Brief brief, Outline outline) {}
    public record Generate(String requestId, @JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, String model) {}
    public record Revision(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision) {}
    public record Handoff(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, String requestId) {}
    public record CreationResult(long draftId) {}
    public record Decision(String tool, JsonNode arguments) {}
}
