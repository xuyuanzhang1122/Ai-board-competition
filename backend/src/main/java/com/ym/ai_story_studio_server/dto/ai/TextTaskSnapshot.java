package com.ym.ai_story_studio_server.dto.ai;

/** Versioned input saved before dispatch; null sampling parameters remain intentionally unspecified. */
public record TextTaskSnapshot(int version, String model, String prompt, Integer maxTokens,
                               Double temperature, Double topP) {}
