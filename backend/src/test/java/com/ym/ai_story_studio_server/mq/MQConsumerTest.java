package com.ym.ai_story_studio_server.mq;

import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.ym.ai_story_studio_server.provider.ImageTaskResult;
import com.ym.ai_story_studio_server.provider.VideoGenerationProvider;
import com.rabbitmq.client.Channel;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.VideoGenerateRequest;
import com.ym.ai_story_studio_server.entity.CharacterLibrary;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.entity.ImageReferenceUpload;
import com.ym.ai_story_studio_server.entity.ProjectCharacter;
import com.ym.ai_story_studio_server.entity.ProjectProp;
import com.ym.ai_story_studio_server.entity.ProjectScene;
import com.ym.ai_story_studio_server.entity.ShotBinding;
import com.ym.ai_story_studio_server.entity.StoryboardShot;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.AssetRefMapper;
import com.ym.ai_story_studio_server.mapper.AssetVersionMapper;
import com.ym.ai_story_studio_server.mapper.CharacterLibraryMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectCharacterMapper;
import com.ym.ai_story_studio_server.mapper.ProjectPropMapper;
import com.ym.ai_story_studio_server.mapper.ProjectSceneMapper;
import com.ym.ai_story_studio_server.mapper.PropLibraryMapper;
import com.ym.ai_story_studio_server.mapper.SceneLibraryMapper;
import com.ym.ai_story_studio_server.mapper.ShotBindingMapper;
import com.ym.ai_story_studio_server.mapper.StoryboardShotMapper;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.service.AiVideoService;
import com.ym.ai_story_studio_server.service.AssetCreationService;
import com.ym.ai_story_studio_server.service.AsyncVideoTaskService;
import com.ym.ai_story_studio_server.service.AsyncImageTaskService;
import com.ym.ai_story_studio_server.service.ImageGenerationTaskService;
import com.ym.ai_story_studio_server.service.ImageReferenceUploadService;
import com.ym.ai_story_studio_server.service.ChargingService;
import com.ym.ai_story_studio_server.service.StorageService;
import com.ym.ai_story_studio_server.util.ImageMergeUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.amqp.core.Message;

import java.io.ByteArrayInputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MQConsumerTest {
    @Test
    void textMessageExecutesSavedJobWithoutUsingMessageTextOrCreatingChildJob() throws Exception {
        Channel channel = mock(Channel.class);
        Message delivery = new Message(new byte[0]);
        delivery.getMessageProperties().setDeliveryTag(8L);
        consumer.handleTextParsing(new TextParsingMessage(12L, 1L, 7L, null), delivery, channel);
        verify(aiTextService).executeQueuedTextJob(12L, 1L, 7L);
        verify(aiTextService, never()).generateText(any());
        verifyNoInteractions(jobMapper, chargingService);
        verify(channel).basicAck(8L, false);
    }

    @Test
    void rejectedIdentityDoesNotFailAnotherUsersJob() throws Exception {
        Channel channel = mock(Channel.class);
        Message delivery = new Message(new byte[0]);
        delivery.getMessageProperties().setDeliveryTag(9L);
        org.mockito.Mockito.doThrow(new BusinessException(ResultCode.ACCESS_DENIED))
                .when(aiTextService).executeQueuedTextJob(12L, 2L, 7L);
        consumer.handleTextParsing(new TextParsingMessage(12L, 2L, 7L, "tampered"), delivery, channel);
        verifyNoInteractions(jobMapper, chargingService);
        verify(channel).basicNack(9L, false, false);
    }


    @Mock private com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots mediaPrompts;
    @Mock private ImageGenerationProvider imageProvider;
    @Mock private VideoGenerationProvider videoProvider;
    @Mock private StorageService storageService;
    @Mock private AssetCreationService assetCreationService;
    @Mock private ChargingService chargingService;
    @Mock private AiVideoService aiVideoService;
    @Mock private AsyncVideoTaskService asyncVideoTaskService;
    @Mock private AsyncImageTaskService asyncImageTaskService;
    @Mock private ImageGenerationTaskService imageGenerationTaskService;
    @Mock private ImageReferenceUploadService imageReferenceUploadService;
    @Mock private MQProducer mqProducer;
    @Mock private AiTextService aiTextService;
    @Mock private ImageMergeUtil imageMergeUtil;
    @Mock private JobMapper jobMapper;
    @Mock private AiProperties aiProperties;
    @Mock private AssetMapper assetMapper;
    @Mock private AssetRefMapper assetRefMapper;
    @Mock private AssetVersionMapper assetVersionMapper;
    @Mock private StoryboardShotMapper storyboardShotMapper;
    @Mock private ProjectCharacterMapper projectCharacterMapper;
    @Mock private CharacterLibraryMapper characterLibraryMapper;
    @Mock private ProjectSceneMapper projectSceneMapper;
    @Mock private PropLibraryMapper propLibraryMapper;
    @Mock private ProjectPropMapper projectPropMapper;
    @Mock private SceneLibraryMapper sceneLibraryMapper;
    @Mock private ShotBindingMapper shotBindingMapper;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks
    private MQConsumer consumer;

    @Test
    void localReferenceImageUploadIsPersistedForBatchReuse() {
        ImageReferenceUpload upload = new ImageReferenceUpload();
        upload.setId(91L);
        upload.setJobId(45L);
        upload.setSourceUrl("/uploads/ref.png");
        upload.setStatus(ImageReferenceUploadService.UPLOADING);
        when(imageReferenceUploadService.claim(45L, "/uploads/ref.png"))
                .thenReturn(new ImageReferenceUploadService.UploadClaim(upload, true));
        when(storageService.download("/uploads/ref.png"))
                .thenReturn(new ByteArrayInputStream(new byte[]{1, 2, 3}));
        when(imageProvider.uploadReferenceImage(any(), eq("ref.png"), eq("image/png")))
                .thenReturn("https://oss.example/ref.png");

        @SuppressWarnings("unchecked")
        List<String> result = ReflectionTestUtils.invokeMethod(
                consumer,
                "prepareReferenceImagesForUpstream",
                45L,
                List.of("/uploads/ref.png")
        );

        assertThat(result).containsExactly("https://oss.example/ref.png");
        verify(imageReferenceUploadService).markSucceeded(91L, "https://oss.example/ref.png");
    }

    @Test
    void batchShotPersistsProviderTaskAndSchedulesRabbitPolling() {
        StoryboardShot shot = new StoryboardShot();
        shot.setId(1099L);
        shot.setProjectId(14L);
        shot.setScriptText("测试分镜");
        when(storyboardShotMapper.selectById(1099L)).thenReturn(shot);
        when(mediaPrompts.load(45L,1099L)).thenReturn(frozen("accepted old prompt", "gpt-image-2-pro", "1:1", 5));
        when(imageGenerationTaskService.isJobActive(45L)).thenReturn(true);
        when(imageGenerationTaskService.isJobItemTerminal(45L, 1099L)).thenReturn(false);
        when(imageProvider.validateImageConfiguration("gpt-image-2-pro", "1:1"))
                .thenReturn("1:1");
        when(imageProvider.supportsAsyncImageTask("gpt-image-2-pro")).thenReturn(true);
        ImageGenerationTask generationTask = new ImageGenerationTask();
        generationTask.setId(700L);
        generationTask.setJobId(45L);
        generationTask.setShotId(1099L);
        when(imageGenerationTaskService.claimSubmission(
                eq(45L), eq(1099L), eq(0), eq(1L), eq(14L),
                anyString(), eq("gpt-image-2-pro"), eq("1:1")))
                .thenReturn(new ImageGenerationTaskService.SubmissionClaim(generationTask, true));
        when(imageProvider.submitImageTask(anyString(), eq("gpt-image-2-pro"), eq("1:1"), anyList()))
                .thenReturn(new ImageTaskResult(
                        "provider-task-1", "gpt-image-2-pro", "queued", 0, List.of(), null));
        ImageGenerationTask submittedTask = new ImageGenerationTask();
        submittedTask.setId(700L);
        submittedTask.setJobId(45L);
        submittedTask.setShotId(1099L);
        submittedTask.setProviderTaskId("provider-task-1");
        when(imageGenerationTaskService.recordSubmitted(700L, "provider-task-1"))
                .thenReturn(submittedTask);

        BatchTaskMessage message = new BatchTaskMessage(
                45L, 1L, 14L, List.of(1099L), "ALL", 1, "1:1", "gpt-image-2-pro"
        );
        ReflectionTestUtils.invokeMethod(consumer, "executeBatchShotImageGeneration", message);

        verify(imageGenerationTaskService).recordSubmitted(700L, "provider-task-1");
        verify(imageProvider).submitImageTask(eq("accepted old prompt"),eq("gpt-image-2-pro"),eq("1:1"),anyList());
        verify(mqProducer).sendImagePollDelayed(700L);
        verify(asyncImageTaskService, never()).pollImageGenerationTask(anyString(), any());
    }

    @Test
    void unsupportedAspectRatioIsDeadLetteredWithoutRetry() throws Exception {
        when(imageGenerationTaskService.isJobActive(46L)).thenReturn(true);
        when(mediaPrompts.load(46L,1100L)).thenReturn(frozen("frozen", "gpt-image-2", "21:9",5));
        when(imageProvider.validateImageConfiguration("gpt-image-2", "21:9"))
                .thenThrow(new BusinessException(ResultCode.PARAM_INVALID, "unsupported ratio"));
        BatchTaskMessage payload = new BatchTaskMessage(
                46L, 1L, 14L, List.of(1100L), "ALL", 1, "21:9", "gpt-image-2"
        );
        Message message = new Message(new byte[0]);
        message.getMessageProperties().setDeliveryTag(52L);
        Channel channel = mock(Channel.class);

        consumer.handleBatchShotImage(payload, message, channel);

        verify(mqProducer, never()).retryBatchShotImageTask(any(), anyInt());
        verify(imageGenerationTaskService).failUnsubmittedAttempts(
                46L, 1100L, 1, "unsupported ratio");
        verify(channel).basicNack(52L, false, false);
        verifyNoInteractions(storageService);
    }

    @Test
    void customPropWithoutLibraryLinkReachesProvider() {
        ProjectProp prop = new ProjectProp();
        prop.setId(253L);
        prop.setProjectId(14L);
        prop.setDisplayName("锦被");
        prop.setOverrideDescription("新制的锦被");
        when(mediaPrompts.load(41L,253L)).thenReturn(frozen("受理时原描述", "gpt-image-2", "1:1",5));
        when(projectPropMapper.selectById(253L)).thenReturn(prop);
        when(imageProvider.generateImage(anyString(), eq("gpt-image-2"), eq("1:1"), anyList()))
                .thenThrow(new BusinessException(ResultCode.AI_SERVICE_ERROR, "provider unavailable"));

        BatchTaskMessage message = new BatchTaskMessage(
                41L, 1L, 14L, List.of(253L), "ALL", 1, "1:1", "gpt-image-2"
        );
        ReflectionTestUtils.invokeMethod(consumer, "executeBatchPropImageGeneration", message);

        verify(propLibraryMapper, never()).selectById(anyLong());
        verify(imageProvider).generateImage(anyString(), eq("gpt-image-2"), eq("1:1"), anyList());
        assertThat(terminalJobUpdate().getErrorMessage()).isEqualTo("provider unavailable");
    }

    @Test
    void batchVideoStaysRunningUntilAsyncProviderCompletion() {
        StoryboardShot shot = new StoryboardShot();
        shot.setId(1097L);
        shot.setProjectId(14L);
        shot.setScriptText("镜头缓慢推进");
        when(storyboardShotMapper.selectById(1097L)).thenReturn(shot);
        Job current = new Job();
        current.setId(51L);
        current.setStatus("PENDING");
        when(jobMapper.selectById(51L)).thenReturn(current);
        when(mediaPrompts.load(51L,1097L)).thenReturn(frozen("受理时提示词", "sd-api-2-fast-720p", "9:16",11));

        BatchTaskMessage message = new BatchTaskMessage(
                51L, 1L, 14L, List.of(1097L), "ALL", 1,
                "9:16", "sd-api-2-fast-720p", 11
        );
        ReflectionTestUtils.invokeMethod(consumer, "executeBatchVideoGeneration", message);

        verify(aiVideoService).generateVideo(any(VideoGenerateRequest.class), eq(51L), eq(1097L));
        ArgumentCaptor<Job> captor = ArgumentCaptor.forClass(Job.class);
        verify(jobMapper, atLeastOnce()).updateById(captor.capture());
        assertThat(captor.getAllValues())
                .allMatch(job -> !"SUCCEEDED".equals(job.getStatus()) && !"FAILED".equals(job.getStatus()));
    }

    @Test
    void batchVideoForwardsAcceptedPromptReferencesAndParametersWithoutRebuilding() {
        var shot=new StoryboardShot();shot.setId(2001L);shot.setProjectId(14L);shot.setScriptText("后来修改的分镜");
        when(storyboardShotMapper.selectById(2001L)).thenReturn(shot);
        var current=new Job();current.setId(61L);current.setStatus("PENDING");when(jobMapper.selectById(61L)).thenReturn(current);
        var saved=new com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots.Snapshot(1,"旧模板与旧分镜",List.of(),
            java.util.Map.of("model","accepted-model","aspectRatio","9:16","duration",5,"countPerItem",1,"mode","ALL"),
            List.of(new com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots.Reference("https://example.org/a.png","角色甲")),null);
        when(mediaPrompts.load(61L,2001L)).thenReturn(saved);
        var message=new BatchTaskMessage(61L,1L,14L,List.of(2001L),"ALL",1,"16:9","changed-model",15);
        ReflectionTestUtils.invokeMethod(consumer,"executeBatchVideoGeneration",message);
        var captor=ArgumentCaptor.forClass(VideoGenerateRequest.class);
        verify(aiVideoService).generateVideo(captor.capture(),eq(61L),eq(2001L));
        assertThat(captor.getValue().prompt()).isEqualTo("旧模板与旧分镜");
        assertThat(captor.getValue().referenceImageUrls()).containsExactly("https://example.org/a.png");
        assertThat(captor.getValue().model()).isEqualTo("accepted-model");
        assertThat(captor.getValue().duration()).isEqualTo(5);
        verifyNoInteractions(shotBindingMapper,projectSceneMapper,projectCharacterMapper,characterLibraryMapper);
    }

    @Test void missingAcceptanceSnapshotNeverCallsProviderOrCurrentTemplate() {
        when(imageGenerationTaskService.isJobActive(45L)).thenReturn(true);
        when(mediaPrompts.load(45L,1099L)).thenThrow(new BusinessException(ResultCode.CONFIG_ERROR,"缺少受理快照"));
        var message=new BatchTaskMessage(45L,1L,14L,List.of(1099L),"ALL",1,"1:1","model");
        org.assertj.core.api.Assertions.assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(consumer,"executeBatchShotImageGeneration",message)).hasMessageContaining("快照");
        verifyNoInteractions(imageProvider,storageService,storyboardShotMapper);
    }

    private static com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots.Snapshot frozen(String prompt,String model,String ratio,int duration) {
        return new com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots.Snapshot(1,prompt,List.of(),java.util.Map.of("model",model,"aspectRatio",ratio,"duration",duration,"countPerItem",1,"mode","ALL"),List.of(),null);
    }

    private Job terminalJobUpdate() {
        ArgumentCaptor<Job> captor = ArgumentCaptor.forClass(Job.class);
        verify(jobMapper, atLeastOnce()).updateById(captor.capture());
        return captor.getAllValues().stream()
                .filter(job -> "FAILED".equals(job.getStatus()) || "SUCCEEDED".equals(job.getStatus()))
                .reduce((first, second) -> second)
                .orElseThrow();
    }
}
