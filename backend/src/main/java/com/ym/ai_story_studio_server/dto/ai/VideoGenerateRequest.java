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
