package com.ym.ai_story_studio_server.dto.admin;

import java.time.LocalDateTime;

/**
 * 用户管理列表行
 */
public record UserListItemVO(
        Long id,
        String nickname,
        String avatarUrl,
        String username,
        String phone,
        Integer status,
        Integer balance,
        LocalDateTime createdAt
) {
}
