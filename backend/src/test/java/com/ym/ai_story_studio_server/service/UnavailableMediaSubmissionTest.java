package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.ImageGenerateRequest;
import com.ym.ai_story_studio_server.dto.ai.VideoGenerateRequest;
import com.ym.ai_story_studio_server.dto.ai.BatchGenerateRequest;
import com.ym.ai_story_studio_server.mapper.*;
import com.ym.ai_story_studio_server.mq.MQProducer;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.provider.UnavailableMediaProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class UnavailableMediaSubmissionTest {
    @Test
    void imageSyncAndAsyncRejectBeforeJobsChargingStorageOrDispatch() {
        var jobs = mock(JobMapper.class);
        var charging = mock(ChargingService.class);
        var storage = mock(StorageService.class);
        ObjectProvider<AiImageService> self = mock(ObjectProvider.class);
        var service = new AiImageService(new UnavailableMediaProvider(), charging, storage, jobs,
                new AiProperties(), new ObjectMapper(), self);
        var request = new ImageGenerateRequest("八仙过海", "gpt-image-2-4k", "16:9", null, null, 0L);
        assertThatThrownBy(() -> service.generateImage(request)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.generateImageAsync(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(jobs, charging, storage, self);
    }

    @Test
    void videoRejectsBeforeCreatingJobsOrStartingWorker() {
        var jobs = mock(JobMapper.class);
        var worker = mock(AsyncVideoTaskService.class);
        var service = new AiVideoService(new UnavailableMediaProvider(), worker, jobs, mock(ProjectMapper.class),
                new AiProperties(), new ObjectMapper());
        var request = new VideoGenerateRequest("八仙过海", "16:9", 5, null, null, 0L, "sd-api-2-fast-720p");
        assertThatThrownBy(() -> service.generateVideo(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(jobs, worker);
    }

    @Test
    void batchImagesAndVideoRejectBeforeCreatingJobsOrSendingMessages() {
        var jobs = mock(JobMapper.class);
        var mq = mock(MQProducer.class);
        var provider = new UnavailableMediaProvider();
        var service = new BatchGenerationService(mq, jobs, mock(JobItemMapper.class), mock(ProjectMapper.class),
                mock(StoryboardShotMapper.class), mock(ProjectCharacterMapper.class), mock(ProjectSceneMapper.class),
                mock(ProjectPropMapper.class), mock(SceneLibraryMapper.class), mock(ShotBindingMapper.class),
                new ObjectMapper(), provider, provider, new AiProperties(), mock(AiTextService.class));
        var request = new BatchGenerateRequest(List.of(1L), "ALL", 1, "16:9", "old-model");
        assertThatThrownBy(() -> service.generateCharactersBatch(1L, request))
                .isInstanceOf(BusinessException.class).hasMessageContaining("尚未完成");
        assertThatThrownBy(() -> service.generateScenesBatch(1L, request))
                .isInstanceOf(BusinessException.class).hasMessageContaining("尚未完成");
        assertThatThrownBy(() -> service.generatePropsBatch(1L, request))
                .isInstanceOf(BusinessException.class).hasMessageContaining("尚未完成");
        assertThatThrownBy(() -> service.generateVideosBatch(1L, request))
                .isInstanceOf(BusinessException.class).hasMessageContaining("尚未完成");
        verifyNoInteractions(jobs, mq);
    }
}
