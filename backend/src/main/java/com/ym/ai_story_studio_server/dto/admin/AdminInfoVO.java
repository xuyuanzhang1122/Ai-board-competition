package com.ym.ai_story_studio_server.dto.admin;

import java.time.LocalDateTime;

/**
 * 管理员信息（登录响应 / /me 共用）
 */
public record AdminInfoVO(
        String token,
        Long adminId,
        String username,
        String displayName,
        LocalDateTime lastLoginAt
) {
    /**
     * 不含 token 的 /me 响应构造（token 传 null）
     */
    public static AdminInfoVO me(Long adminId, String username, String displayName, LocalDateTime lastLoginAt) {
        return new AdminInfoVO(null, adminId, username, displayName, lastLoginAt);
    }
}
