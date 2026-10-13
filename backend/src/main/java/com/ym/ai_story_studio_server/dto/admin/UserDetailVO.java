package com.ym.ai_story_studio_server.dto.admin;

import java.time.LocalDateTime;

/**
 * 用户详情（含资源摘要）
 */
public record UserDetailVO(
        Long id,
        String nickname,
        String avatarUrl,
        String username,
        String phone,
        Integer status,
        Integer balance,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        Summary summary
) {
    /**
     * 用户资源摘要：项目 / 订单 / 任务 / 资产数量
     */
    public record Summary(
            long projectCount,
            long orderCount,
            long jobCount,
            long assetCount
    ) {
    }
}
