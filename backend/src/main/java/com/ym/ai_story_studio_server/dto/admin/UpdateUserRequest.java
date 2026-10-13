package com.ym.ai_story_studio_server.dto.admin;

/**
 * 管理员编辑用户请求（昵称 / 头像 / 状态，均为可选）
 */
public record UpdateUserRequest(
        String nickname,
        String avatarUrl,
        Integer status
) {
}
