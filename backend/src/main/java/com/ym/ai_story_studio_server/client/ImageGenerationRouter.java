package com.ym.ai_story_studio_server.client;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 图片生成渠道路由。
 *
 * <p>按模型编码把请求分发到对应渠道客户端，供所有图片生成链路
 * （工具箱、单分镜、批量分镜/角色/场景/道具）统一调用：
 * <ul>
 *   <li>{@code gpt-image-2-4k} → {@link Sub2ApiImageClient}（sub2api渠道，仅同步接口，
 *       支持1-4张/质量/输出格式/背景）</li>
 *   <li>其余模型 → {@link GeeknowClient}（保持原有行为不变）</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class ImageGenerationRouter {

    private final GeeknowClient geeknowClient;
    private final Sub2ApiImageClient sub2ApiImageClient;

    public boolean isSub2ApiModel(String model) {
        return Sub2ApiImageClient.SUPPORTED_MODELS.contains(model);
    }

    /**
     * GeekNow 的异步图片任务接口（submitImageTask/queryImageTask）仅覆盖 GeekNow 模型；
     * sub2api 渠道只有同步接口，分镜链路需走同步回退路径。
     */
    public boolean supportsAsyncImageTask(String model) {
        return !isSub2ApiModel(model);
    }

    /** 在创建 Job 或投递 MQ 之前做确定性校验，返回归一化的画幅比例/尺寸。 */
    public String validateImageConfiguration(String model, String aspectRatio) {
        if (isSub2ApiModel(model)) {
            return sub2ApiImageClient.validateImageConfiguration(model, aspectRatio);
        }
        return geeknowClient.validateImageConfiguration(model, aspectRatio);
    }

    /** 同步生成图片（不带渠道扩展参数，分镜/角色/场景/道具链路使用）。 */
    public GeeknowClient.ImageApiResponse generateImage(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        return generateImage(prompt, model, aspectRatio, referenceImageUrls, null, null, null, null);
    }

    /** 同步生成图片（带渠道扩展参数，工具箱链路使用；GeekNow 渠道忽略扩展参数）。 */
    public GeeknowClient.ImageApiResponse generateImage(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls,
            String quality,
            String outputFormat,
            String background,
            Integer count
    ) {
        if (isSub2ApiModel(model)) {
            List<String> images = sub2ApiImageClient.generateImages(
                    prompt, model, aspectRatio, quality, outputFormat, background, count, referenceImageUrls);
            return new GeeknowClient.ImageApiResponse(
                    images.stream()
                            .map(data -> new GeeknowClient.ImageApiResponse.ImageData(data, null))
                            .toList(),
                    model
            );
        }
        return geeknowClient.generateImage(prompt, model, aspectRatio, referenceImageUrls);
    }
}
