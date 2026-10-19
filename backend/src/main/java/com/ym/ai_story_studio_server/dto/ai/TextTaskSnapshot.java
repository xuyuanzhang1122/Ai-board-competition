package com.ym.ai_story_studio_server.dto.ai;

import com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn;
import java.util.List;

/** Versioned, immutable generation input saved before dispatch. */
public record TextTaskSnapshot(int version, String model, String prompt, Integer maxTokens,
                               Double temperature, Double topP, List<ChatTurn> messages) {
    public TextTaskSnapshot {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
    public TextTaskSnapshot(int version, String model, String prompt, Integer maxTokens,
                            Double temperature, Double topP) {
        this(version, model, prompt, maxTokens, temperature, topP, List.of());
    }
}
