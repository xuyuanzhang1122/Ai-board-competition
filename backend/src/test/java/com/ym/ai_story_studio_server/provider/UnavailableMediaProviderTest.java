package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UnavailableMediaProviderTest {
    @Test
    void imageSubmissionQueryAndReferenceUploadAllRejectWithoutConfiguration() {
        ImageGenerationProvider provider = new UnavailableMediaProvider();
        for (String model : new String[]{"gemini-3-pro-image-preview", "gpt-image-2-4k", "unverified-official-model"}) {
            assertThatThrownBy(() -> provider.validateImageConfiguration(model, "16:9"))
                    .isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> provider.generateImage("八仙过海", model, "16:9", List.of()))
                    .isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> provider.submitImageTask("八仙过海", model, "16:9", List.of()))
                    .isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> provider.queryImageTask("historical-task"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> provider.uploadReferenceImage(new byte[]{1}, "reference.png", "image/png"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void videoSubmissionQueryAndDownloadRejectIncludingHistoricalUrls() {
        VideoGenerationProvider provider = new UnavailableMediaProvider();
        for (String model : new String[]{"sd-api-2-fast-720p", "unverified-official-model"}) {
            assertThatThrownBy(() -> provider.validateVideoModel(model)).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> provider.resolveVideoDuration(model, 5)).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> provider.createVideo("八仙过海", model, "16:9", 5, null, List.of()))
                    .isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> provider.queryTaskStatus("historical-task"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> provider.downloadVideoContent(new VideoTaskResult(
                "historical-task", "completed", 100, "https://example.com/video.mp4", null)))
                .isInstanceOf(BusinessException.class);
    }
}
