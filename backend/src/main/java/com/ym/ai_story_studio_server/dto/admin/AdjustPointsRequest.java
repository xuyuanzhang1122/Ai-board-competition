package com.ym.ai_story_studio_server.dto.admin;

import jakarta.validation.constraints.NotNull;

/**
 * 管理员调整用户积分
 *
 * <p>delta 为增量：正数增加，负数扣减。调整后余额不允许为负。
 */
public record AdjustPointsRequest(
        @NotNull(message = "调整值不能为空") Integer delta,
        String remark
) {
}
