package com.ym.ai_story_studio_server.creation;

import java.util.List;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

public final class CreationTypes {
    private CreationTypes() {}
    public record Source(String id, String title, String url, String license) {}
    public record Brief(String theme, String audience, String channel, String goal, @JsonDeserialize(using=StrictNumbers.IntValue.class) int duration,
                        String aspectRatio, String materials, List<Source> sources) {}
    public record Asset(String id, String type, String name, String description) {}
    public record Shot(String id, @JsonDeserialize(using=StrictNumbers.IntValue.class) int no, @JsonDeserialize(using=StrictNumbers.IntValue.class) int duration, String visual, String narration, String dialogue,
                       String shotSize, String cameraMovement, List<String> characters, String scene,
                       List<String> props, String imagePrompt, String videoPrompt, List<String> sourceIds) {}
    public record Board(@JsonDeserialize(using=StrictNumbers.IntValue.class) int version, String title, List<Asset> assets, List<Shot> shots, List<String> reviewNotes) {}
    public record Body(Brief brief, String script, int scriptVersion, boolean scriptConfirmed,
                       Board storyboard, int boardScriptVersion, boolean boardConfirmed) {}
    public record Run(long id, String stage, String status, long inputRevision, String model, long jobId,
                      String output, String error, int promptVersion, boolean applied) {}
    public record Draft(long id, long revision, String title, Body body, Long projectId, List<Run> runs) {}
    public record Create(String requestId, Brief brief) {}
    public record Save(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, Brief brief, String script, Board storyboard) {}
    public record Generate(String requestId, @JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, String stage, String model) {}
    public record Confirm(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, String stage) {}
    public record Adopt(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision) {}
    public record ProjectRequest(@JsonDeserialize(using=StrictNumbers.LongValue.class) long revision, String requestId) {}
    public record ProjectResult(long projectId) {}
}
