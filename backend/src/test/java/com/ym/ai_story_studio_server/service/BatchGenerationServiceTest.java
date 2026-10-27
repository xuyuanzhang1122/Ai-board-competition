package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.ym.ai_story_studio_server.provider.VideoGenerationProvider;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.BatchGenerateRequest;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.entity.ProjectCharacter;
import com.ym.ai_story_studio_server.entity.ProjectProp;
import com.ym.ai_story_studio_server.entity.ProjectScene;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectCharacterMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.mapper.ProjectPropMapper;
import com.ym.ai_story_studio_server.mapper.ProjectSceneMapper;
import com.ym.ai_story_studio_server.mapper.SceneLibraryMapper;
import com.ym.ai_story_studio_server.mapper.ShotBindingMapper;
import com.ym.ai_story_studio_server.mapper.StoryboardShotMapper;
import com.ym.ai_story_studio_server.mq.MQProducer;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BatchGenerationServiceTest {

    @Mock private com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots mediaPrompts;
    @Mock
    private MQProducer mqProducer;
    @Mock
    private JobMapper jobMapper;
    @Mock
    private JobItemMapper jobItemMapper;
    @Mock
    private ProjectMapper projectMapper;
    @Mock
    private StoryboardShotMapper storyboardShotMapper;
    @Mock
    private ProjectCharacterMapper projectCharacterMapper;
    @Mock
    private ProjectSceneMapper projectSceneMapper;
    @Mock
    private ProjectPropMapper projectPropMapper;
    @Mock
    private SceneLibraryMapper sceneLibraryMapper;
    @Mock
    private ShotBindingMapper shotBindingMapper;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private ImageGenerationProvider imageProvider;
    @Mock private VideoGenerationProvider videoProvider;
    @Mock
    private AiProperties aiProperties;

    @InjectMocks
    private BatchGenerationService service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(42L);
        org.mockito.Mockito.lenient().when(imageProvider.validateImageConfiguration(any(), any())).thenAnswer(call -> call.getArgument(1));

        Project project = new Project();
        project.setId(7L);
        project.setUserId(42L);
        when(projectMapper.selectById(7L)).thenReturn(project);

        doAnswer(invocation -> {
            Job job = invocation.getArgument(0);
            job.setId(501L);
            return 1;
        }).when(jobMapper).insert(any(Job.class));
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void generateCharactersBatchCreatesProjectCharacterJobItems() {
        when(projectCharacterMapper.selectBatchIds(anyCollection())).thenReturn(List.of(
                character(11L),
                character(12L)
        ));

        service.generateCharactersBatch(7L, request(11L, 12L));

        assertJobItems("PCHAR", 11L, 12L);
    }

    @Test
    void generateScenesBatchCreatesProjectSceneJobItems() {
        when(projectSceneMapper.selectBatchIds(anyCollection())).thenReturn(List.of(
                scene(21L),
                scene(22L)
        ));

        service.generateScenesBatch(7L, request(21L, 22L));

        assertJobItems("PSCENE", 21L, 22L);
    }

    @Test
    void generatePropsBatchCreatesProjectPropJobItems() {
        when(projectPropMapper.selectBatchIds(anyCollection())).thenReturn(List.of(
                prop(31L),
                prop(32L)
        ));

        service.generatePropsBatch(7L, request(31L, 32L));

        assertJobItems("PPROP", 31L, 32L);
    }

    @Test void freezesManagedRequestBeforeCreatingOrDispatchingJobs() {
        when(projectPropMapper.selectBatchIds(anyCollection())).thenReturn(List.of(prop(31L)));
        var frozen=new com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots.Snapshot(1,"published v1",List.of(),java.util.Map.of("model","stub","aspectRatio","1:1"),List.of(),null);
        org.mockito.Mockito.lenient().when(mediaPrompts.forTarget(org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq(31L),org.mockito.ArgumentMatchers.eq("PROP_IMAGE"),any(),any(),any())).thenReturn(frozen);
        service.generatePropsBatch(7L,request(31L));
        var order=org.mockito.Mockito.inOrder(mediaPrompts,jobMapper,mqProducer);
        order.verify(mediaPrompts).forTarget(org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq(31L),org.mockito.ArgumentMatchers.eq("PROP_IMAGE"),any(),any(),any());
        order.verify(jobMapper).insert(any(Job.class));
        order.verify(mediaPrompts).save(501L,31L,frozen);
        order.verify(mqProducer).sendBatchPropImageTask(any(),any(),any(),any(),any(),any(),any(),any());
    }

    private static BatchGenerateRequest request(Long... targetIds) {
        return new BatchGenerateRequest(
                List.of(targetIds),
                "ALL",
                1,
                "1:1",
                "gemini-3-pro-image-preview"
        );
    }

    private void assertJobItems(String targetType, Long... targetIds) {
        ArgumentCaptor<JobItem> itemCaptor = ArgumentCaptor.forClass(JobItem.class);
        verify(jobItemMapper, times(targetIds.length)).insert(itemCaptor.capture());

        assertThat(itemCaptor.getAllValues())
                .extracting(
                        JobItem::getJobId,
                        JobItem::getTargetType,
                        JobItem::getTargetId,
                        JobItem::getStatus
                )
                .containsExactly(
                        List.of(targetIds).stream()
                                .map(targetId -> tuple(501L, targetType, targetId, "PENDING"))
                                .toArray(org.assertj.core.groups.Tuple[]::new)
                );
    }

    private static ProjectCharacter character(Long id) {
        ProjectCharacter character = new ProjectCharacter();
        character.setId(id);
        character.setProjectId(7L);
        return character;
    }

    private static ProjectScene scene(Long id) {
        ProjectScene scene = new ProjectScene();
        scene.setId(id);
        scene.setProjectId(7L);
        return scene;
    }

    private static ProjectProp prop(Long id) {
        ProjectProp prop = new ProjectProp();
        prop.setId(id);
        prop.setProjectId(7L);
        return prop;
    }
}
