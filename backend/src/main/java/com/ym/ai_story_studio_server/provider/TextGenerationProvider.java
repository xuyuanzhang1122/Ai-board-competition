package com.ym.ai_story_studio_server.provider;

/** Text-only contract; callers never depend on a supplier's response DTO. */
public interface TextGenerationProvider {
    void validateModelConfiguration(String model);

    void validateRequest(String prompt, String model, Integer maxTokens, Double temperature, Double topP);

    TextGenerationResult generateText(String prompt, String model, Integer maxTokens,
                                      Double temperature, Double topP);
}
