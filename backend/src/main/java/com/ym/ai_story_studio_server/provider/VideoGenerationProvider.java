package com.ym.ai_story_studio_server.provider;

import java.util.List;

/** Supplier-independent video boundary; querying an old task must not select a former upstream. */
public interface VideoGenerationProvider {
    void validateVideoModel(String model);
    int resolveVideoDuration(String model, Integer duration);
    boolean supportsMultipleReferenceImages(String model);
    VideoTaskResult createVideo(String prompt, String model, String aspectRatio, Integer seconds,
                                String size, List<String> references);
    VideoTaskResult queryTaskStatus(String taskId);
    VideoContentResult downloadVideoContent(VideoTaskResult task);
}
