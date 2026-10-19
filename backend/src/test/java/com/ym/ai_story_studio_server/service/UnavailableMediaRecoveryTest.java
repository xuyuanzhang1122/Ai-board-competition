package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.provider.UnavailableMediaProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import java.time.Duration;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.Mockito.*;

class UnavailableMediaRecoveryTest {
    @Test
    void alreadyQueuedImageStopsWithoutSleepingAndKeepsExternalTaskSnapshot() {
        var jobs = mock(JobMapper.class);
        var items = mock(JobItemMapper.class);
        var service = new AsyncImageTaskService(new UnavailableMediaProvider(), mock(ChargingService.class),
                mock(StorageService.class), jobs, items, mock(AssetCreationService.class), new AiProperties(),
                new ObjectMapper(), mock(ObjectProvider.class), mock(ImageGenerationTaskService.class));
        var item = new JobItem();
        item.setStatus("RUNNING");
        item.setInputJson("{\"apiTaskIds\":[\"old-image-task\"]}");
        when(items.selectOne(any())).thenReturn(item);
        assertTimeoutPreemptively(Duration.ofSeconds(1), () -> service.pollImageGenerationTask("old-image-task",
                new AsyncImageTaskService.ImageTaskContext(1L, 7L, 2L, "八仙过海", "old-model", "16:9", 1L, 0)));
        assertThat(item.getStatus()).isEqualTo("FAILED");
        assertThat(item.getErrorMessage()).contains("人工核对");
        assertThat(item.getInputJson()).contains("old-image-task");
    }

    private Job activeJob() {
        var job = new Job();
        job.setId(52L);
        job.setJobType("VIDEO_GENERATION");
        job.setStatus("RUNNING");
        job.setMetaJson("{\"apiTaskId\":\"old-task-52\",\"model\":\"old-model\"}");
        return job;
    }

    @Test
    void startupRetainsExternalIdAndStopsUnavailableVideoBeforeDispatch() {
        var jobs = mock(JobMapper.class);
        ObjectProvider<AsyncVideoTaskService> dispatch = mock(ObjectProvider.class);
        var service = new AsyncVideoTaskService(new UnavailableMediaProvider(), mock(ChargingService.class),
                mock(StorageService.class), jobs, mock(JobItemMapper.class), mock(AssetCreationService.class),
                new AiProperties(), new ObjectMapper(), dispatch);
        Job job = activeJob();
        when(jobs.selectList(any())).thenReturn(List.of(job));
        when(jobs.selectById(52L)).thenReturn(job);
        service.recoverPendingVideoTasks();
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(job.getMetaJson()).contains("old-task-52");
        assertThat(job.getErrorMessage()).contains("人工核对");
        verifyNoInteractions(dispatch);
    }

    @Test
    void alreadyQueuedVideoStopsWithoutSleepingAndDoesNotOverwriteTerminalJobs() {
        var jobs = mock(JobMapper.class);
        var service = new AsyncVideoTaskService(new UnavailableMediaProvider(), mock(ChargingService.class),
                mock(StorageService.class), jobs, mock(JobItemMapper.class), mock(AssetCreationService.class),
                new AiProperties(), new ObjectMapper(), mock(ObjectProvider.class));
        Job job = activeJob();
        when(jobs.selectById(52L)).thenReturn(job);
        assertTimeoutPreemptively(Duration.ofSeconds(1), () ->
                service.pollVideoGenerationTask(52L, "old-task-52", "old-model", "16:9", 5, 1L));
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(job.getErrorMessage()).contains("人工核对");
        job.setStatus("CANCELED");
        service.pollVideoGenerationTask(52L, "old-task-52", "old-model", "16:9", 5, 1L);
        assertThat(job.getStatus()).isEqualTo("CANCELED");
    }
}
