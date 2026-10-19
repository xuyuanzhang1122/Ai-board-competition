package com.ym.ai_story_studio_server.dto.toolbox.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ChatSendRequest(
        @NotBlank @Size(max=80) String clientRequestId,
        @NotBlank @Pattern(regexp="TEXT|IMAGE|VIDEO") String type,
        @NotBlank @Size(max=100) String model,
        @NotBlank @Size(max=10000) String content,
        @Size(max=20) String aspectRatio) {}
