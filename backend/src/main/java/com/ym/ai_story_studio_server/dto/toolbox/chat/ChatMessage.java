package com.ym.ai_story_studio_server.dto.toolbox.chat;
import java.time.LocalDateTime;
public record ChatMessage(long id, String role, String type, String content, String model, Long jobId,
                          String status, String resultUrl, String errorMessage, LocalDateTime createdAt) {}
