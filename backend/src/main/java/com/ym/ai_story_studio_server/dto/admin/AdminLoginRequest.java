package com.ym.ai_story_studio_server.dto.admin;

import jakarta.validation.constraints.NotBlank;

/**
 * 管理员登录请求
 */
public record AdminLoginRequest(
        @NotBlank(message = "用户名不能为空") String username,
        @NotBlank(message = "密码不能为空") String password
) {
}
