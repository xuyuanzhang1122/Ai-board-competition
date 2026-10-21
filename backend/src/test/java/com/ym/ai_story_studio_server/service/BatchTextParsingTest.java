package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.dto.ai.ParseTextRequest;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.mq.MQProducer;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BatchTextParsingTest {
    @Mock AiTextService text;
    @Mock com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService library;
    @Mock JobMapper jobs;
    @Mock ProjectMapper projects;
    @Mock MQProducer producer;
    @InjectMocks BatchGenerationService batch;

    @AfterEach void clear() { UserContext.clear(); }

    private void ownedProject() {
        UserContext.setUserId(1L);
        Project project = new Project();
        project.setUserId(1L);
        when(projects.selectById(7L)).thenReturn(project);
        when(library.published("SHOT_PARSE")).thenReturn(new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.Prompt("SHOT_PARSE",1,"published parser","rawText","TEXT","PUBLISHED","seed",null,"",1));
    }

    @Test
    void queuesExactlyThePreparedPersistentJob() {
        ownedProject();
        Job prepared = new Job();
        prepared.setId(77L);
        when(text.createQueuedParsingJob(1L, 7L, "published parser\n\n用户文案：\n原始创作输入内容")).thenReturn(prepared);
        assertThat(batch.parseText(7L, new ParseTextRequest("原始创作输入内容")).jobId()).isEqualTo(77L);
        verify(producer).sendTextParsingTask(77L, 1L, 7L, "原始创作输入内容");
        verifyNoInteractions(jobs);
    }

    @Test
    void disabledParserDoesNotCreateJobOrSendMessage() {
        ownedProject();
        when(library.published("SHOT_PARSE")).thenThrow(new IllegalStateException("未发布"));
        assertThatThrownBy(() -> batch.parseText(7L,new ParseTextRequest("原始创作输入内容"))).hasMessageContaining("未发布");
        verifyNoInteractions(text,jobs,producer);
    }

    @Test
    void unavailableTextModelNeverCreatesOuterJobOrPublishesMessage() {
        ownedProject();
        when(text.createQueuedParsingJob(any(), any(), any())).thenThrow(new IllegalArgumentException("未启用"));
        assertThatThrownBy(() -> batch.parseText(7L, new ParseTextRequest("原始创作输入内容")))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(jobs, producer);
    }
}
