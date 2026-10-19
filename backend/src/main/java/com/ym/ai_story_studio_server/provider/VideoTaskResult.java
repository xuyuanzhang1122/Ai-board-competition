package com.ym.ai_story_studio_server.provider;

public record VideoTaskResult(String taskId, String status, Integer progress, String videoUrl, String errorMessage) {
    public String resolvedTaskId() { return taskId; }
    public String resolvedVideoUrl() { return videoUrl; }
}
