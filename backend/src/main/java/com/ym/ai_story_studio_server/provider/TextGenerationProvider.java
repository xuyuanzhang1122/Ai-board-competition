package com.ym.ai_story_studio_server.provider;

/** Text-only contract; callers never depend on a supplier's response DTO. */
public interface TextGenerationProvider {
    record ChatTurn(String role, String content) {}

    /** Existing providers support only a single user turn until they implement structured history. */
    default TextGenerationResult generateConversation(java.util.List<ChatTurn> messages, String model,
            Integer maxTokens, Double temperature, Double topP) {
        if (messages == null || messages.size() != 1 || !"user".equals(messages.get(0).role())) {
            throw new IllegalArgumentException("Provider does not support conversation history");
        }
        return generateText(messages.get(0).content(), model, maxTokens, temperature, topP);
    }

    void validateModelConfiguration(String model);

    void validateRequest(String prompt, String model, Integer maxTokens, Double temperature, Double topP);

    TextGenerationResult generateText(String prompt, String model, Integer maxTokens,
                                      Double temperature, Double topP);
}
