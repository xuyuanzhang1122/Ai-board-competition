package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AsyncVideoTaskServiceTest {

    @Mock private ImageGenerationProvider imageProvider;
    @Mock private ChargingService chargingService;
    @Mock private StorageService storageService;
    @Mock private JobMapper jobMapper;
    @Mock private JobItemMapper jobItemMapper;
    @Mock private AssetCreationService assetCreationService;
    @Mock private AiProperties aiProperties;
    @Mock private ObjectMapper objectMapper;
    @Mock private ObjectProvider<AsyncVideoTaskService> selfProvider;

    @InjectMocks private AsyncVideoTaskService service;

    @Test
    void lastFailedVideoItemFailsParentWithProviderMessage() {
        JobItem item = new JobItem();
        item.setId(9L);
        item.setJobId(51L);
        item.setTargetType("SHOT");
        item.setTargetId(1097L);
        item.setStatus("RUNNING");

        Job parent = new Job();
        parent.setId(51L);
        parent.setStatus("RUNNING");
        parent.setTotalItems(1);

        when(jobItemMapper.selectOne(any())).thenReturn(item);
        when(jobItemMapper.selectList(any())).thenReturn(List.of(item));
        when(jobMapper.selectById(51L)).thenReturn(parent);

        service.markParentItemFailed(51L, 1097L, "parse_multipart_failed");

        assertThat(item.getStatus()).isEqualTo("FAILED");
        assertThat(item.getErrorMessage()).isEqualTo("parse_multipart_failed");
        assertThat(parent.getStatus()).isEqualTo("FAILED");
        assertThat(parent.getProgress()).isEqualTo(100);
        assertThat(parent.getDoneItems()).isEqualTo(1);
        assertThat(parent.getErrorMessage()).isEqualTo("parse_multipart_failed");
    }

    @Test
    void startupClosesOrphanVideoJobWithoutProviderTaskId() {
        Job orphan = new Job();
        orphan.setId(52L);
        orphan.setJobType("VIDEO_GENERATION");
        orphan.setStatus("PENDING");
        when(jobMapper.selectList(any())).thenReturn(List.of(orphan));

        service.recoverPendingVideoTasks();

        assertThat(orphan.getStatus()).isEqualTo("FAILED");
        assertThat(orphan.getErrorMessage()).contains("缺少上游taskId");
        verify(jobMapper).updateById(orphan);
    }
}
