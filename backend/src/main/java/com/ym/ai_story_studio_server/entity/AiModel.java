// {{CODE-Cycle-Integration:
//   Task_ID: [#T-BACKEND-MODEL-API]
//   Timestamp: 2026-01-04T15:55:39+08:00
//   Phase: [D-Develop]
//   Context-Analysis: "Creating AiModel entity following StylePreset pattern. MyBatis-Plus annotations for auto-fill timestamps."
//   Principle_Applied: "KISS, DRY, SOLID"
// }}
// {{START_MODIFICATIONS}}
package com.ym.ai_story_studio_server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI模型配置表
 * 用于存储系统支持的语言模型、图像生成模型、视频生成模型
 */
@Data
@TableName("ai_models")
public class AiModel {

    /**
     * 模型ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    private String sourceUrl;
    private String catalogRevision;
    private String upstreamMetadata;
    private Integer upstreamPresent;

    /**
     * 模型代码（唯一标识）
     * 上游 /models 返回的原始 id
     */
    private String code;

    /**
     * 模型显示名称
     * 上游名称，缺省时使用原始 id
     */
    private String name;

    /**
     * 模型类型
     * LANGUAGE: 语言模型
     * IMAGE: 图像生成模型
     * VIDEO: 视频生成模型
     */
    private String type;

    /**
     * 模型提供商
     * 官方供应商标识
     */
    private String provider;

    /**
     * 是否启用：1启用，0禁用
     */
    private Integer enabled;

    /**
     * 排序值（越小越靠前）
     */
    private Integer sortOrder;

    /**
     * 模型描述
     */
    private String description;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
// {{END_MODIFICATIONS}}
