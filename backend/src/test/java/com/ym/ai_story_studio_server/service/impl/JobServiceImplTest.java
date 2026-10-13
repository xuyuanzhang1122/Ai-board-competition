package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.dto.job.JobQueryRequest;
import com.ym.ai_story_studio_server.dto.job.JobVO;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobServiceImplTest {

    @Mock
    private JobMapper jobMapper;
    @Mock
    private JobItemMapper jobItemMapper;
    @Mock
    private ProjectMapper projectMapper;
    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private JobServiceImpl service;

    @Test
    void getJobPageIncludesTargetIdsFromJobItems() {
        Page<Job> page = new Page<>(1, 100);
        page.setRecords(List.of(
                job(101L, 7L, "BATCH_GEN_CHAR_IMG"),
                job(102L, 7L, "BATCH_GEN_PROP_IMG")
        ));
        page.setTotal(2);

        Project project = new Project();
        project.setId(7L);
        project.setName("短剧项目");

        when(jobMapper.selectPage(any(Page.class), any())).thenReturn(page);
        when(projectMapper.selectById(7L)).thenReturn(project);
        when(jobItemMapper.selectList(any())).thenReturn(List.of(
                item(101L, 11L),
                item(101L, 12L),
                item(102L, 33L)
        ));

        Page<JobVO> result = service.getJobPage(
                42L,
                new JobQueryRequest(7L, "RUNNING", null, 1, 100)
        );

        assertThat(result.getRecords()).extracting(JobVO::id).containsExactly(101L, 102L);
        assertThat(result.getRecords().get(0).targetIds()).containsExactly(11L, 12L);
        assertThat(result.getRecords().get(1).targetIds()).containsExactly(33L);
    }

    private static Job job(Long id, Long projectId, String jobType) {
        Job job = new Job();
        job.setId(id);
        job.setUserId(42L);
        job.setProjectId(projectId);
        job.setJobType(jobType);
        job.setStatus("RUNNING");
        job.setProgress(0);
        job.setTotalItems(1);
        job.setDoneItems(0);
        return job;
    }

    private static JobItem item(Long jobId, Long targetId) {
        JobItem item = new JobItem();
        item.setJobId(jobId);
        item.setTargetId(targetId);
        return item;
    }
}
