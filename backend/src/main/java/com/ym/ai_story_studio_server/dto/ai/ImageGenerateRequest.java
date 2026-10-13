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
 * 图片生成请求DTO
 *
 * <p>用于调用AI图片生成服务,支持多种模型和画幅比例
 *
 * <p><strong>支持的模型:</strong> GeekNow 文档列出的 Gemini、GPT Image 2、Seedream 和 Grok 图片模型。
 *
 * <p><strong>支持的画幅比例:</strong>
 * <ul>
 *   <li>1:1 - 正方形</li>
 *   <li>16:9 - 横向宽屏</li>
 *   <li>9:16 - 竖向</li>
 *   <li>21:9 - 超宽屏(默认)</li>
 * </ul>
 *
 * <p><strong>使用示例:</strong>
 * <pre>
 * ImageGenerateRequest request = new ImageGenerateRequest(
 *     "一个科幻风格的城市，赛博朋克，霓虹灯",
 *     "gemini-3-pro-image-preview",
 *     "16:9",
 *     null,
 *     1L
 * );
 * </pre>
 *
 * @param prompt 提示词(必填,1-4000字符)
 * @param model 模型名称(可选,默认使用配置值)
 * @param aspectRatio 画幅比例(可选,默认使用配置值)
 * @param referenceImageUrl 参考图URL(可选,用于图生图)
 * @param projectId 所属项目ID(必填)
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
public record ImageGenerateRequest(
        @NotBlank(message = "提示词不能为空")
        @Size(min = 1, max = 4000, message = "提示词长度必须在1-4000个字符之间")
        String prompt,

        @Size(max = 100, message = "模型编码不能超过100个字符")
        @Pattern(
                regexp = "gemini-3-pro-image-preview|gemini-2\\.5-flash-image-preview|gemini-3\\.1-flash-image-preview|gpt-image-2|gpt-image-2-pro|gpt-image-2-vip|doubao-seedream-4-0-250828|doubao-seedream-4-5-251128|doubao-seedream-5-0-260128|grok-4-2-image|gpt-image-2-4k",
                message = "不支持的图片模型"
        )
        String model,

        @Pattern(regexp = "1:1|16:9|9:16|21:9|4:3|3:4|3:2|2:3|\\d{3,5}x\\d{3,5}", message = "不支持的画幅比例")
        String aspectRatio,

        List<@URL(message = "参考图URL格式不正确") String> referenceImageUrls,

        @URL(message = "参考图URL格式不正确")
        String referenceImageUrl,

        @NotNull(message = "项目ID不能为空")
        Long projectId,

        @Min(value = 1, message = "生成张数不能小于1")
        @Max(value = 4, message = "生成张数不能超过4")
        Integer count,

        @Pattern(regexp = "auto|low|standard|high", message = "不支持的质量档位")
        String quality,

        @Pattern(regexp = "png|jpeg|webp", message = "不支持的输出格式")
        String outputFormat,

        @Pattern(regexp = "auto|opaque|transparent", message = "不支持的背景选项")
        String background
) {
    /** 向后兼容构造函数：不涉及张数/质量/格式/背景的旧调用方(如批量角色/场景画像生成)。 */
    public ImageGenerateRequest(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls,
            String referenceImageUrl,
            Long projectId
    ) {
        this(prompt, model, aspectRatio, referenceImageUrls, referenceImageUrl, projectId, null, null, null, null);
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
