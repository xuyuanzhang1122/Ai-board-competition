package com.ym.ai_story_studio_server.provider;

import java.util.List;

public record ImageTaskResult(String id, String model, String status, Integer progress,
                              List<ImageGenerationResult.ImageData> images, String errorMessage) {
    public ImageGenerationResult toImageResponse() {
        return new ImageGenerationResult(images == null ? List.of() : images, model);
    }
}
