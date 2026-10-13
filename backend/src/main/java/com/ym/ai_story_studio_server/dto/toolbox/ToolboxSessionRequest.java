package com.ym.ai_story_studio_server.dto.toolbox;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ToolboxSessionRequest(
        @NotBlank(message = "会话标题不能为空")
        @Size(max = 100, message = "会话标题不能超过100个字符")
        String title,

        @NotBlank(message = "会话内容不能为空")
        String conversationsJson
) {}
