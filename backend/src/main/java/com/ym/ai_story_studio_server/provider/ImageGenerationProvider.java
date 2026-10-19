package com.ym.ai_story_studio_server.provider;

import java.util.List;

/** Supplier-independent image boundary. Implementations own capability validation and cost admission. */
public interface ImageGenerationProvider {
    String validateImageConfiguration(String model, String aspectRatio);
    boolean supportsAsyncImageTask(String model);
    default ImageGenerationResult generateImage(String prompt, String model, String aspectRatio, List<String> references) {
        return generateImage(prompt, model, aspectRatio, references, null, null, null, null);
    }
    ImageGenerationResult generateImage(String prompt, String model, String aspectRatio, List<String> references,
                                        String quality, String outputFormat, String background, Integer count);
    ImageTaskResult submitImageTask(String prompt, String model, String aspectRatio, List<String> references);
    ImageTaskResult queryImageTask(String taskId);
    String uploadReferenceImage(byte[] content, String fileName, String contentType);
}
