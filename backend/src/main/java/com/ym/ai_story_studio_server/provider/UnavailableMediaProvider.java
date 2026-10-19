package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.stereotype.Component;
import java.util.List;

/** No HTTP client, credentials, fallback or enable switch. Replace only after official integration verification. */
@Component
public class UnavailableMediaProvider implements ImageGenerationProvider, VideoGenerationProvider {
    private BusinessException unavailable() {
        return new BusinessException(ResultCode.CONFIG_ERROR,
                "图片/视频新供应商尚未完成接入与预算核验，当前不可用；旧上游已停用");
    }
    @Override public String validateImageConfiguration(String model, String ratio) { throw unavailable(); }
    @Override public boolean supportsAsyncImageTask(String model) { return false; }
    @Override public ImageGenerationResult generateImage(String prompt, String model, String ratio, List<String> references,
                                                         String quality, String format, String background, Integer count) {
        throw unavailable();
    }
    @Override public ImageTaskResult submitImageTask(String prompt, String model, String ratio, List<String> references) {
        throw unavailable();
    }
    @Override public ImageTaskResult queryImageTask(String taskId) { throw unavailable(); }
    @Override public String uploadReferenceImage(byte[] content, String name, String contentType) { throw unavailable(); }
    @Override public void validateVideoModel(String model) { throw unavailable(); }
    @Override public int resolveVideoDuration(String model, Integer duration) { throw unavailable(); }
    @Override public boolean supportsMultipleReferenceImages(String model) { return false; }
    @Override public VideoTaskResult createVideo(String prompt, String model, String ratio, Integer seconds,
                                                String size, List<String> references) { throw unavailable(); }
    @Override public VideoTaskResult queryTaskStatus(String taskId) { throw unavailable(); }
    @Override public VideoContentResult downloadVideoContent(VideoTaskResult task) { throw unavailable(); }
}
