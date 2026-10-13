package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.StorageProperties;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.ToolboxSession;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.AssetVersionMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ToolboxSessionMapper;
import com.ym.ai_story_studio_server.mapper.UsageChargeMapper;
import com.ym.ai_story_studio_server.service.AiImageService;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.service.AiVideoService;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ToolboxServiceImplTest {

    @BeforeAll
    static void initializeMyBatisMetadata() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), "toolbox-test"),
                ToolboxSession.class
        );
    }

    @Mock private AiTextService aiTextService;
    @Mock private AiImageService aiImageService;
    @Mock private AiVideoService aiVideoService;
    @Mock private JobMapper jobMapper;
    @Mock private UsageChargeMapper usageChargeMapper;
    @Mock private AssetMapper assetMapper;
    @Mock private AssetVersionMapper assetVersionMapper;
    @Mock private ToolboxSessionMapper toolboxSessionMapper;
    @Mock private ObjectMapper objectMapper;
    @Mock private StorageProperties storageProperties;

    @InjectMocks private ToolboxServiceImpl toolboxService;

    @AfterEach
    void clearUserContext() {
        UserContext.clear();
    }

    @Test
    void deleteSessionRejectsAnotherUsersSessionBeforeChangingHistory() {
        UserContext.setUserId(101L);
        ToolboxSession session = session(9L, 202L);
        when(toolboxSessionMapper.selectById(9L)).thenReturn(session);

        assertThrows(BusinessException.class, () -> toolboxService.deleteSession(9L));

        verify(jobMapper, never()).update(any(Job.class), any(Wrapper.class));
        verify(toolboxSessionMapper, never()).updateById(any(ToolboxSession.class));
    }

    @Test
    void deleteSessionMarksOwnedSessionAndItsLinkedHistoryDeleted() {
        UserContext.setUserId(101L);
        ToolboxSession session = session(9L, 101L);
        when(toolboxSessionMapper.selectById(9L)).thenReturn(session);

        toolboxService.deleteSession(9L);

        ArgumentCaptor<Job> deletedJob = ArgumentCaptor.forClass(Job.class);
        verify(jobMapper).update(deletedJob.capture(), any(Wrapper.class));
        assertNotNull(deletedJob.getValue().getToolboxDeletedAt());
        assertNotNull(session.getDeletedAt());
        verify(toolboxSessionMapper).updateById(session);
    }

    @Test
    void getSessionsAlwaysFiltersByCurrentUser() {
        UserContext.setUserId(101L);

        toolboxService.getSessions();

        ArgumentCaptor<LambdaQueryWrapper<ToolboxSession>> query =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(toolboxSessionMapper).selectList(query.capture());
        query.getValue().getSqlSegment();
        assertTrue(query.getValue().getParamNameValuePairs().containsValue(101L));
    }

    private ToolboxSession session(Long id, Long userId) {
        ToolboxSession session = new ToolboxSession();
        session.setId(id);
        session.setUserId(userId);
        return session;
    }
}
