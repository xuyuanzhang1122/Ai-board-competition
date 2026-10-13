package com.ym.ai_story_studio_server.dto.admin;

import jakarta.validation.constraints.NotBlank;

/**
 * 模型新增 / 编辑请求
 */
public record ModelUpsertRequest(
        @NotBlank(message = "模型编码不能为空") String code,
        @NotBlank(message = "模型名称不能为空") String name,
        @NotBlank(message = "模型类型不能为空") String type,
        String provider,
        Integer enabled,
        Integer sortOrder,
        String description
) {
}
