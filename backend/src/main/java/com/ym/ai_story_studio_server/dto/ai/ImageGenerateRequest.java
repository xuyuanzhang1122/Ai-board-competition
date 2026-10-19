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
/** Media request shape retained for compatibility. Availability is enforced by the provider; media is currently disabled. */
public record ImageGenerateRequest(
        @NotBlank(message = "提示词不能为空")
        @Size(min = 1, max = 4000, message = "提示词长度必须在1-4000个字符之间")
        String prompt,

        @Size(max = 100, message = "模型编码不能超过100个字符")
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
