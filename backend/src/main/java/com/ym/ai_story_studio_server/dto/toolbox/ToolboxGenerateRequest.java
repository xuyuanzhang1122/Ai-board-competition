package com.ym.ai_story_studio_server.dto.toolbox;

import jakarta.validation.constraints.*;
import org.hibernate.validator.constraints.URL;

import java.util.Collections;
import java.util.List;

/**
 * AI工具箱生成请求
 *
 * <p>统一的AI生成请求DTO,支持文本、图片、视频三种生成类型
 *
 * <p><strong>生成类型(type):</strong>
 * <ul>
 *   <li>TEXT - 文本生成</li>
 *   <li>IMAGE - 图片生成</li>
 *   <li>VIDEO - 视频生成</li>
 * </ul>
 *
 * <p><strong>使用示例:</strong>
 * <pre>
 * // 文本生成
 * ToolboxGenerateRequest request = new ToolboxGenerateRequest(
 *     "TEXT",
 *     "写一个科幻故事",
 *     null,
 *     null,
 *     null,
 *     null
 * );
 *
 * // 图片生成
 * ToolboxGenerateRequest request = new ToolboxGenerateRequest(
 *     "IMAGE",
 *     "赛博朋克风格的城市",
 *     "verified-image-model-id",
 *     "16:9",
 *     null,
 *     null
 * );
 *
 * // 视频生成
 * ToolboxGenerateRequest request = new ToolboxGenerateRequest(
 *     "VIDEO",
 *     "机器人在城市中行走",
 *     null,
 *     "16:9",
 *     8,
 *     null
 * );
 * </pre>
 *
 * @param type 生成类型(TEXT/IMAGE/VIDEO)
 * @param prompt 提示词
 * @param model 模型名称(可选,使用配置的默认模型)
 * @param aspectRatio 画幅比例(可选,IMAGE和VIDEO时可用)
 * @param duration 视频时长(可选,VIDEO时可用,单位:秒)
 * @param referenceImageUrls 参考图URL列表(可选,用于图生图或图生视频)
 * @param referenceImageUrl 参考图URL(可选,用于图生图或图生视频，兼容旧字段)
 * @param sessionId 当前工具箱会话ID，用于会话删除时同步清理生成历史
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
public record ToolboxGenerateRequest(
        /**
         * 生成类型
         *
         * <p>必填,可选值:
         * <ul>
         *   <li>TEXT - 文本生成</li>
         *   <li>IMAGE - 图片生成</li>
         *   <li>VIDEO - 视频生成</li>
         * </ul>
         */
        @NotBlank(message = "生成类型不能为空")
        @Pattern(regexp = "TEXT|IMAGE|VIDEO", message = "生成类型必须是TEXT、IMAGE或VIDEO")
        String type,

        /**
         * 提示词
         *
         * <p>必填,长度限制:
         * <ul>
         *   <li>TEXT: 1-10000字符</li>
         *   <li>IMAGE: 1-4000字符</li>
         *   <li>VIDEO: 1-4096字符</li>
         * </ul>
         */
        @NotBlank(message = "提示词不能为空")
        @Size(min = 1, max = 10000, message = "提示词长度必须在1-10000字符之间")
        String prompt,

        /**
         * 模型名称
         *
         * <p>必须从已验证且启用的官方目录选择；以下媒体 ID 示例仅为协议占位，不代表已接通:
         * <ul>
         *   <li>TEXT: deepseek-flash</li>
         *   <li>IMAGE: 官方目录中已验证并启用的图片模型（当前未开放）</li>
         *   <li>VIDEO: 官方目录中已验证并启用的视频模型（当前未开放）</li>
         * </ul>
         */
        @Size(max = 100, message = "模型编码不能超过100个字符")
        String model,

        /**
         * 画幅比例
         *
         * <p>可选,仅在IMAGE和VIDEO时生效
         * <p>IMAGE支持: 1:1, 16:9, 9:16, 21:9(默认)
         * <p>VIDEO支持: 16:9(默认), 9:16, 1:1
         */
        String aspectRatio,

        /**
         * 视频时长
         *
         * <p>可选,仅在VIDEO时生效
         * <p>单位:秒,范围:1-15；实际可选值由模型决定
         */
        @Min(value = 1, message = "视频时长不能小于1秒")
        @Max(value = 15, message = "视频时长不能超过15秒")
        Integer duration,

        /**
         * 参考图URL列表
         *
         * <p>可选,用于图生图或图生视频
         * <p>IMAGE: 作为参考图进行图生图
         * <p>VIDEO: 作为首帧参考图进行图生视频
         */
        List<@URL(message = "参考图URL格式不正确") String> referenceImageUrls,

        /**
         * 参考图URL(兼容旧字段)
         */
        @URL(message = "参考图URL格式不正确")
        String referenceImageUrl,

        /**
         * 当前工具箱会话ID
         */
        @NotNull(message = "工具箱会话不能为空")
        @Positive(message = "工具箱会话ID必须为正数")
        Long sessionId,

        /**
         * 生成张数
         *
         * <p>可选,仅在IMAGE时对已验证支持多图的模型生效,范围1-4,默认1
         */
        @Min(value = 1, message = "生成张数不能小于1")
        @Max(value = 4, message = "生成张数不能超过4")
        Integer count,

        /**
         * 图片质量档位
         *
         * <p>可选,仅在IMAGE时对支持该参数的模型生效: auto/low/standard/high
         */
        @Pattern(regexp = "auto|low|standard|high", message = "不支持的质量档位")
        String quality,

        /**
         * 图片输出格式
         *
         * <p>可选,仅在IMAGE时对支持该参数的模型生效: png/jpeg/webp
         */
        @Pattern(regexp = "png|jpeg|webp", message = "不支持的输出格式")
        String outputFormat,

        /**
         * 图片背景
         *
         * <p>可选,仅在IMAGE时对支持该参数的模型生效: auto/opaque/transparent
         */
        @Pattern(regexp = "auto|opaque|transparent", message = "不支持的背景选项")
        String background
) {
    public List<String> referenceImageUrlList() {
        if (referenceImageUrls != null && !referenceImageUrls.isEmpty()) {
            return referenceImageUrls;
        }
        if (referenceImageUrl != null && !referenceImageUrl.isBlank()) {
            return List.of(referenceImageUrl);
        }
        return Collections.emptyList();
    }
}
