package com.ym.ai_story_studio_server.dto.ai;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.URL;

import java.util.Collections;
import java.util.List;

/**
 * 视频生成请求DTO
 *
 * <p>用于调用AI视频生成服务,支持文生视频和图生视频
 *
 * <p><strong>支持的模型:</strong> sudashuiapi 文档列出的六个 Seedance 2.0 视频模型。
 *
 * <p><strong>支持的画幅比例:</strong>
 * <ul>
 *   <li>16:9 - 横向宽屏(默认)</li>
 *   <li>9:16 - 竖向</li>
 *   <li>1:1 - 正方形</li>
 * </ul>
 *
 * <p><strong>使用示例:</strong>
 * <pre>
 * // 文生视频
 * VideoGenerateRequest request = new VideoGenerateRequest(
 *     "一个机器人在未来城市中行走",
 *     "16:9",
 *     8,
 *     null,
 *     1L
 * );
 *
 * // 图生视频(首帧参考)
 * VideoGenerateRequest request = new VideoGenerateRequest(
 *     "镜头缓缓推进,机器人转身看向镜头",
 *     "16:9",
 *     8,
 *     "https://example.com/reference.jpg",
 *     1L
 * );
 * </pre>
 *
 * @param prompt 提示词(必填,1-4096字符)
 * @param aspectRatio 画幅比例(可选,默认使用配置值)
 * @param duration 视频时长(秒,可选,具体范围由模型决定)
 * @param size 输出分辨率(可选,默认由画幅比例决定)
 * @param referenceImageUrl 首帧参考图URL(可选,用于图生视频)
 * @param projectId 所属项目ID(必填)
 * @param model 模型名称(可选,默认使用配置值)
 * @param referenceImageUrls 参考图列表；提交前统一转换为对象存储外链
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
public record VideoGenerateRequest(
        @NotBlank(message = "提示词不能为空")
        @Size(min = 1, max = 4096, message = "提示词长度必须在1-4096个字符之间")
        String prompt,

        @Pattern(regexp = "16:9|9:16|1:1|21:9|4:3|3:4|3:2|2:3|2:1|1:2|19\\.5:9|9:19\\.5|20:9|9:20|keep_ratio|adaptive", message = "不支持的画幅比例")
        String aspectRatio,

        @Min(value = 4, message = "视频时长不能小于4秒")
        @Max(value = 15, message = "视频时长不能大于15秒")
        Integer duration,

        @Pattern(
                regexp = "[0-9]{2,4}x[0-9]{2,4}|480P|540P|720P|1080P",
                message = "不支持的输出分辨率"
        )
        String size,

        @URL(message = "参考图URL格式不正确")
        String referenceImageUrl,

        @NotNull(message = "项目ID不能为空")
        Long projectId,

        @Size(max = 100, message = "模型编码不能超过100个字符")
        @Pattern(
                regexp = "sd-2-720p|sd-2-1080p|sd-api-2-720p|sd-api-2-1080p|sd-2-fast-720p|sd-api-2-fast-720p",
                message = "不支持的 Seedance 2.0 视频模型"
        )
        String model,

        List<@URL(message = "参考图URL格式不正确") String> referenceImageUrls
) {
    public VideoGenerateRequest(
            String prompt,
            String aspectRatio,
            Integer duration,
            String size,
            String referenceImageUrl,
            Long projectId,
            String model
    ) {
        this(prompt, aspectRatio, duration, size, referenceImageUrl, projectId, model, null);
    }

    public VideoGenerateRequest(
            String prompt,
            String aspectRatio,
            Integer duration,
            String size,
            String referenceImageUrl,
            Long projectId
    ) {
        this(prompt, aspectRatio, duration, size, referenceImageUrl, projectId, null, null);
    }

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
