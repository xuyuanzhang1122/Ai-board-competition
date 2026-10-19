package com.ym.ai_story_studio_server.dto.ai;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.URL;

import java.io.Serializable;
import java.util.List;

/**
 * 单个分镜视频生成请求DTO
 *
 * <p>用于为单个分镜生成视频,整合剧本、角色、场景、道具等资源
 *
 * <p><strong>生成逻辑:</strong>
 * <ul>
 *   <li>prompt = 内嵌规则 + 分镜词(剧本)</li>
 *   <li>多参考图 = 人物资产 + 道具资产 + 场景资产 + 分镜图资产</li>
 *   <li>场景画像资产为强制项,缺失时禁止生成</li>
 * </ul>
 *
 * @param prompt 完整的提示词(内嵌规则 + 分镜词,必填)
 * @param aspectRatio 画幅比例(可选,默认16:9)
 * @param duration 视频时长(秒,可选,默认配置值)
 * @param size 输出分辨率(可选,默认由画幅比例决定)
 * @param referenceImageUrl 分镜图资产URL(可选,缺省时后端回退查询分镜当前图片)
 * @param model 视频模型(可选,默认使用配置值)
 * @param scene 场景信息(必填,场景画像资产缺失时禁止生成)
 * @param characters 角色列表(可选)
 * @param props 道具列表(可选)
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
public record ShotVideoGenerateRequest(
        @NotBlank(message = "提示词不能为空")
        @Size(min = 1, max = 4096, message = "提示词长度必须在1-4096个字符之间")
        String prompt,

        @Pattern(regexp = "16:9|9:16|1:1|21:9|4:3|3:4|3:2|2:3|2:1|1:2|19\\.5:9|9:19\\.5|20:9|9:20|keep_ratio|adaptive", message = "不支持的画幅比例")
        String aspectRatio,

        @Min(value = 4, message = "视频时长不能小于4秒")
        @Max(value = 15, message = "视频时长不能超过15秒")
        Integer duration,

        @Pattern(
                regexp = "[0-9]{2,4}x[0-9]{2,4}|480P|540P|720P|1080P",
                message = "不支持的输出分辨率"
        )
        String size,

        @URL(message = "参考图URL格式不正确")
        String referenceImageUrl,

        @Size(max = 100, message = "模型编码不能超过100个字符")
        String model,

        @NotNull(message = "缺少场景画像资产，禁止生成视频")
        AssetResource scene,

        List<AssetResource> characters,

        List<AssetResource> props
) {
    /**
     * 资产资源
     *
     * @param id 资产ID
     * @param name 资产名称
     * @param thumbnailUrl 缩略图URL
     */
    public record AssetResource(
            @NotNull Long id,
            String name,
            String thumbnailUrl
    ) implements Serializable {
        private static final long serialVersionUID = 1L;
    }
}
