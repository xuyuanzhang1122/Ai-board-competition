package com.ym.ai_story_studio_server.dto.auth;

import jakarta.validation.constraints.NotBlank;

/**
 * 普通用户用户名密码登录请求
 */
public record UsernameLoginRequest(
        @NotBlank(message = "用户名不能为空") String username,
        @NotBlank(message = "密码不能为空") String password
) {
}
