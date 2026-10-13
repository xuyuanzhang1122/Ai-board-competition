package com.ym.ai_story_studio_server.dto.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 管理员为用户设置 / 重置用户名密码
 *
 * <p>username 可选：传入则同时设置/更新登录用户名；只想改密码可只传 password。
 */
public record SetPasswordRequest(
        @Size(min = 3, max = 64, message = "用户名长度需在3-64之间")
        String username,

        @NotBlank(message = "密码不能为空")
        @Size(min = 6, max = 64, message = "密码长度需在6-64之间")
        String password
) {
}
