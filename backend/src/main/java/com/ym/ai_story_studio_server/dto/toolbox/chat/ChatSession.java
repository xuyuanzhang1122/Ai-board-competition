package com.ym.ai_story_studio_server.dto.toolbox.chat;
import java.time.LocalDateTime;
public record ChatSession(long id, String title, LocalDateTime createdAt, LocalDateTime updatedAt) {}
