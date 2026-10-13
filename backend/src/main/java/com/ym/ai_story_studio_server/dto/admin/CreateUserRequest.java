package com.ym.ai_story_studio_server.dto.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 管理员创建用户请求
 */
public record CreateUserRequest(
        @NotBlank(message = "用户名不能为空")
        @Size(min = 3, max = 64, message = "用户名长度需在3-64之间")
        String username,

        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 64, message = "密码长度需在6-64之间")
        String password,

        String nickname,

        String avatarUrl,

        Integer initialBalance
) {
}
