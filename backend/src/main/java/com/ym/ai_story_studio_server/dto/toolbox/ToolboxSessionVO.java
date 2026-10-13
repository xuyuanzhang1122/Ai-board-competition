package com.ym.ai_story_studio_server.dto.toolbox;

import java.time.LocalDateTime;

public record ToolboxSessionVO(
        Long id,
        String title,
        String conversationsJson,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
