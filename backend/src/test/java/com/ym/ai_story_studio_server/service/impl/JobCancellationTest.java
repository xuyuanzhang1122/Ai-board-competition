package com.ym.ai_story_studio_server.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class JobCancellationTest {
    @Test
    void staleRunningReadCannotBeWrittenBackAfterCompletionWins() {
        JobMapper mapper = mock(JobMapper.class);
        Job stale = new Job();
        stale.setId(1L);
        stale.setUserId(42L);
        stale.setStatus("RUNNING");
        stale.setMetaJson("{}");
        when(mapper.selectById(1L)).thenReturn(stale);
        var service = new JobServiceImpl(mapper, mock(JobItemMapper.class),
                mock(ProjectMapper.class), new ObjectMapper());

        // Completion wins after this stale read; the conditional write must lose (zero rows).
        assertThatThrownBy(() -> service.cancelJob(42L, 1L)).isInstanceOf(BusinessException.class);
        verify(mapper, never()).updateById(any(Job.class));
    }
}
