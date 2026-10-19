package com.ym.ai_story_studio_server.provider;

import java.util.List;

/** Normalized data for existing asset storage; no supplier response DTO crosses this boundary. */
public record ImageGenerationResult(List<ImageData> data, String model) {
    public record ImageData(String url, String revisedPrompt) {}
}
