package com.ym.ai_story_studio_server.provider;

/** Null usage means unknown, rather than a measured zero. Model is the response model. */
public record TextGenerationResult(String text, String model, String provider,
                                   String requestId, Integer tokensUsed, Integer inputTokens,
                                   Integer outputTokens, String budgetReservationId) {
    public TextGenerationResult(String text, String model, String provider, String requestId, Integer tokensUsed) {
        this(text, model, provider, requestId, tokensUsed, null, null, null);
    }
}
