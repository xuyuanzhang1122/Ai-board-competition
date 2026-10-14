package com.ym.ai_story_studio_server.mq;

import com.rabbitmq.client.Channel;
import com.ym.ai_story_studio_server.client.GeeknowClient;
import com.ym.ai_story_studio_server.client.GeeknowClient.ImageApiResponse;
import com.ym.ai_story_studio_server.client.ImageGenerationRouter;
import com.ym.ai_story_studio_server.client.SudashuiVideoClient;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.VideoGenerateRequest;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.exception.RetryableAiException;
import com.ym.ai_story_studio_server.entity.CharacterLibrary;
import com.ym.ai_story_studio_server.entity.AssetRef;
import com.ym.ai_story_studio_server.entity.AssetVersion;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.entity.ProjectCharacter;
import com.ym.ai_story_studio_server.entity.ProjectScene;
import com.ym.ai_story_studio_server.entity.PropLibrary;
import com.ym.ai_story_studio_server.entity.ProjectProp;
import com.ym.ai_story_studio_server.entity.SceneLibrary;
import com.ym.ai_story_studio_server.entity.ShotBinding;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.AssetRefMapper;
import com.ym.ai_story_studio_server.mapper.AssetVersionMapper;
import com.ym.ai_story_studio_server.mapper.CharacterLibraryMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectCharacterMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.mapper.ProjectSceneMapper;
import com.ym.ai_story_studio_server.mapper.PropLibraryMapper;
import com.ym.ai_story_studio_server.mapper.ProjectPropMapper;
import com.ym.ai_story_studio_server.mapper.SceneLibraryMapper;
import com.ym.ai_story_studio_server.mapper.ShotBindingMapper;
import com.ym.ai_story_studio_server.mapper.StoryboardShotMapper;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.service.AiVideoService;
import com.ym.ai_story_studio_server.service.AsyncImageTaskService;
import com.ym.ai_story_studio_server.service.ImageGenerationTaskService;
import com.ym.ai_story_studio_server.service.ImageReferenceUploadService;
import com.ym.ai_story_studio_server.service.AsyncVideoTaskService;
import com.ym.ai_story_studio_server.service.AssetCreationService;
import com.ym.ai_story_studio_server.service.ChargingService;
import com.ym.ai_story_studio_server.service.StorageService;
import com.ym.ai_story_studio_server.util.ImageMergeUtil;
import com.ym.ai_story_studio_server.util.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * MQ消息消费者
 * 
 * <p>监听队列并处理任务消息
 * 
 * @author AI Story Studio
 * @since 1.0.0
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MQConsumer {

    private final GeeknowClient geeknowClient;
    private final ImageGenerationRouter imageGenerationRouter;
    private final SudashuiVideoClient sudashuiVideoClient;
    private final StorageService storageService;
    private final AssetCreationService assetCreationService;
    private final ChargingService chargingService;
    private final AiVideoService aiVideoService;
    private final AsyncVideoTaskService asyncVideoTaskService;
    private final AsyncImageTaskService asyncImageTaskService;
    private final ImageGenerationTaskService imageGenerationTaskService;
    private final ImageReferenceUploadService imageReferenceUploadService;
    private final MQProducer mqProducer;
    private final AiTextService aiTextService;
    private final ImageMergeUtil imageMergeUtil;
    private final JobMapper jobMapper;
    private final AiProperties aiProperties;
    private final AssetMapper assetMapper;
    private final AssetRefMapper assetRefMapper;
    private final AssetVersionMapper assetVersionMapper;
    private final StoryboardShotMapper storyboardShotMapper;
    private final ProjectMapper projectMapper;
    private final ProjectCharacterMapper projectCharacterMapper;
    private final CharacterLibraryMapper characterLibraryMapper;
    private final ProjectSceneMapper projectSceneMapper;
    private final PropLibraryMapper propLibraryMapper;
    private final ProjectPropMapper projectPropMapper;
    private final SceneLibraryMapper sceneLibraryMapper;
    private final ShotBindingMapper shotBindingMapper;
    private final ObjectMapper objectMapper;

    /** 视频生成内嵌规则，与前端单分镜面板的前缀保持一致；最终 prompt = 内嵌规则 + 分镜词。 */
    private static final String VIDEO_PROMPT_PREFIX =
            "根据参考图的角色、场景和道具设定生成风格一致的视频。动作与运镜合理，无字幕和 BGM；"
                    + "没有台词时人物不说话。画面清晰、光影自然，第一个镜头保留 0.3 秒空境，忠实呈现以下分镜：";

    /** 人物照片资产生成的固定前置规则：统一背景/画质/排版要求，最终 prompt = 该前置规则 + 角色描述。 */
    private static final String CHARACTER_PORTRAIT_PROMPT_PREFIX =
            "纯白极简背景，无文字，同一人物统一造型服饰，中国人像:1.3，超写实摄影:1.3, 单反拍摄, "
                    + "85mm人像镜头, f/1.8大光圈, 高清细节, 皮肤呈现真实细腻质感，不过度磨皮， 自然毛孔, "
                    + "绒毛, 皮下血管, 自然肤质, 柔光, 自然光, 真实光影, 浅景深, 专业肖像, 电影质感, "
                    + "锐度清晰, 真实质感, 照片级。人物表情自然，严禁手上携带物品，排版要求，比例协调，"
                    + "人物四视图排版，左侧展示人物上半身正面特写，右侧正面全身立绘，侧面全身立绘，背面全身立绘";

    /**
     * 消费批量生成分镜图任务
     */
    @RabbitListener(
            queues = MQConstant.QUEUE_BATCH_SHOT_IMAGE,
            concurrency = "${rabbit.workers.image-submit:3}"
    )
    public void handleBatchShotImage(BatchTaskMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_BATCH_SHOT_IMAGE);
        log.info("========== 消费消息: 批量生成分镜图 ==========");
        log.info("队列: {}, jobId: {}, shotCount: {}",
                MQConstant.QUEUE_BATCH_SHOT_IMAGE, msg.getJobId(), msg.getTargetIds().size());

        try {
            executeBatchShotImageGeneration(msg);
            
            // 手动确认消息
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            int retryCount = applicationRetryCount(message);
            if (isRetryableSubmissionFailure(e) && retryCount < MQConstant.MAX_SUBMISSION_RETRIES) {
                try {
                    mqProducer.retryBatchShotImageTask(msg, retryCount + 1);
                    channel.basicAck(deliveryTag, false);
                    log.warn("分镜生图提交已延迟重试 - jobId: {}, retry: {}/{}",
                            msg.getJobId(), retryCount + 1, MQConstant.MAX_SUBMISSION_RETRIES);
                } catch (Exception retryPublishError) {
                    // 重试消息未被 broker 确认，不能 ack 原消息。
                    log.error("分镜生图重试消息发布失败，原消息重回主队列 - jobId: {}",
                            msg.getJobId(), retryPublishError);
                    channel.basicNack(deliveryTag, false, true);
                }
            } else {
                String error = e.getMessage() != null ? e.getMessage() : "图片任务提交失败";
                int expectedCount = msg.getCountPerItem() == null ? 1 : Math.max(1, msg.getCountPerItem());
                for (Long shotId : msg.getTargetIds()) {
                    imageGenerationTaskService.failUnsubmittedAttempts(
                            msg.getJobId(), shotId, expectedCount, error);
                }
                channel.basicNack(deliveryTag, false, false);
                log.error("分镜生图提交终止，进入DLQ - jobId: {}, retryable: {}, retry: {}/{}, error: {}",
                        msg.getJobId(), isRetryableSubmissionFailure(e), retryCount,
                        MQConstant.MAX_SUBMISSION_RETRIES, error);
            }
        }
    }

    /**
     * 消费单个分镜图生成任务(支持自定义prompt)
     */
    @RabbitListener(
            queues = MQConstant.QUEUE_SINGLE_SHOT_IMAGE,
            concurrency = "${rabbit.workers.image-submit:3}"
    )
    public void handleSingleShotImage(SingleShotImageMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_SINGLE_SHOT_IMAGE);
        log.info("========== 消费消息: 单个分镜图生成 ==========");
        log.info("队列: {}, jobId: {}, shotId: {}, customPrompt: {}",
                MQConstant.QUEUE_SINGLE_SHOT_IMAGE, msg.jobId(), msg.shotId(),
                msg.customPrompt() != null ? "自定义" : "默认");

        try {
            executeSingleShotImageGeneration(msg);
            
            // 手动确认消息
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.jobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.jobId(), e);
            int retryCount = applicationRetryCount(message);
            if (isRetryableSubmissionFailure(e) && retryCount < MQConstant.MAX_SUBMISSION_RETRIES) {
                try {
                    mqProducer.retrySingleShotImageTask(msg, retryCount + 1);
                    channel.basicAck(deliveryTag, false);
                } catch (Exception retryPublishError) {
                    channel.basicNack(deliveryTag, false, true);
                }
            } else {
                imageGenerationTaskService.failUnsubmittedAttempts(
                        msg.jobId(), msg.shotId(), 1,
                        e.getMessage() == null ? "图片任务提交失败" : e.getMessage());
                channel.basicNack(deliveryTag, false, false);
                log.error("单分镜生图提交终止，进入DLQ - jobId: {}, retryable: {}, retry: {}/{}",
                        msg.jobId(), isRetryableSubmissionFailure(e), retryCount,
                        MQConstant.MAX_SUBMISSION_RETRIES);
            }
        }
    }

    /**
     * 消费批量生成视频任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_BATCH_VIDEO)
    public void handleBatchVideo(BatchTaskMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_BATCH_VIDEO);
        log.info("========== 消费消息: 批量生成视频 ==========");
        log.info("队列: {}, jobId: {}, shotCount: {}",
                MQConstant.QUEUE_BATCH_VIDEO, msg.getJobId(), msg.getTargetIds().size());

        try {
            executeBatchVideoGeneration(msg);
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            channel.basicNack(deliveryTag, false, false);
            updateJobFailed(msg.getJobId(), e.getMessage());
        }
    }

    /**
     * 消费批量生成角色画像任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_BATCH_CHARACTER_IMAGE)
    public void handleBatchCharacterImage(BatchTaskMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_BATCH_CHARACTER_IMAGE);
        log.info("========== 消费消息: 批量生成角色画像 ==========");
        log.info("队列: {}, jobId: {}, characterCount: {}",
                MQConstant.QUEUE_BATCH_CHARACTER_IMAGE, msg.getJobId(), msg.getTargetIds().size());

        try {
            executeBatchCharacterImageGeneration(msg);
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            channel.basicNack(deliveryTag, false, false);
            updateJobFailed(msg.getJobId(), e.getMessage());
        }
    }

    /**
     * 消费批量生成场景画像任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_BATCH_SCENE_IMAGE)
    public void handleBatchSceneImage(BatchTaskMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_BATCH_SCENE_IMAGE);
        log.info("========== 消费消息: 批量生成场景画像 ==========");
        log.info("队列: {}, jobId: {}, sceneCount: {}",
                MQConstant.QUEUE_BATCH_SCENE_IMAGE, msg.getJobId(), msg.getTargetIds().size());

        try {
            executeBatchSceneImageGeneration(msg);
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            channel.basicNack(deliveryTag, false, false);
            updateJobFailed(msg.getJobId(), e.getMessage());
        }
    }

    /**
     * 消费批量生成道具画像任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_BATCH_PROP_IMAGE)
    public void handleBatchPropImage(BatchTaskMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_BATCH_PROP_IMAGE);
        log.info("========== 消费消息: 批量生成道具画像 ==========");
        log.info("队列: {}, jobId: {}, propCount: {}",
                MQConstant.QUEUE_BATCH_PROP_IMAGE, msg.getJobId(), msg.getTargetIds().size());

        try {
            executeBatchPropImageGeneration(msg);
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            channel.basicNack(deliveryTag, false, false);
            updateJobFailed(msg.getJobId(), e.getMessage());
        }
    }

    /**
     * 消费单个分镜视频生成任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_SINGLE_SHOT_VIDEO)
    public void handleSingleShotVideo(SingleShotVideoMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_SINGLE_SHOT_VIDEO);
        log.info("========== 消费消息: 单个分镜视频生成 ==========");
        log.info("队列: {}, jobId: {}, shotId: {}, promptLength: {}",
                MQConstant.QUEUE_SINGLE_SHOT_VIDEO, msg.getJobId(), msg.getShotId(),
                msg.getPrompt() != null ? msg.getPrompt().length() : 0);

        try {
            executeSingleShotVideoGeneration(msg);
            
            // 手动确认消息
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            
            // 拒绝消息，不重新入队（进入死信队列）
            channel.basicNack(deliveryTag, false, false);
            
            // 更新Job状态为失败
            updateJobFailed(msg.getJobId(), e.getMessage());
        }
    }

    /**
     * 消费文本解析任务
     */
    @RabbitListener(queues = MQConstant.QUEUE_TEXT_PARSING)
    public void handleTextParsing(TextParsingMessage msg, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        log.info("RECEIVED message - queue: {}", MQConstant.QUEUE_TEXT_PARSING);
        log.info("========== 消费消息: 文本解析 ==========");
        log.info("队列: {}, jobId: {}", MQConstant.QUEUE_TEXT_PARSING, msg.getJobId());

        try {
            executeTextParsing(msg);
            channel.basicAck(deliveryTag, false);
            log.info("消息确认成功 - jobId: {}", msg.getJobId());
            
        } catch (Exception e) {
            log.error("消息处理失败 - jobId: {}", msg.getJobId(), e);
            channel.basicNack(deliveryTag, false, false);
            // Saved task executor owns state; identity or ACK failures must not overwrite another/terminal job.
        }
    }

    // ==================== 私有执行方法 ====================

    /**
     * 执行单个分镜图生成(支持自定义prompt和参考图)
     */
    private void executeSingleShotImageGeneration(SingleShotImageMessage msg) {
        Long jobId = msg.jobId();
        Long shotId = msg.shotId();
        Long userId = msg.userId();
        Long projectId = msg.projectId();
        String customPrompt = msg.customPrompt();

        if (!imageGenerationTaskService.isJobActive(jobId)
                || imageGenerationTaskService.isJobItemTerminal(jobId, shotId)) {
            log.info("单分镜生图任务已结束，忽略残留消息 - jobId: {}, shotId: {}", jobId, shotId);
            return;
        }

        // 应用配置
        String finalModel = msg.model() != null ? msg.model() : aiProperties.getImage().getDefaultModel();
        String finalAspectRatio = imageGenerationRouter.validateImageConfiguration(
                finalModel,
                msg.aspectRatio() != null ? msg.aspectRatio() : aiProperties.getImage().getDefaultAspectRatio());
        List<String> referenceImageUrls = prepareReferenceImagesForUpstream(jobId, msg.referenceImageUrls());

        log.info("执行单个分镜图生成 - jobId: {}, shotId: {}, customPrompt: {}, referenceImageUrls: {}",
                jobId, shotId, customPrompt != null ? "[自定义内容]" : "使用分镜剧本",
                referenceImageUrls.size());
        updateJobRunning(jobId);
    
        log.info("应用配置 - aspectRatio: {}, model: {}", finalAspectRatio, finalModel);
    
        try {
            // 1. 查询分镜
            var shot = storyboardShotMapper.selectById(shotId);
            if (shot == null) {
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.SHOT_NOT_FOUND);
            }
    
            // 2. 准备prompt: 优先使用customPrompt，否则使用分镜剧本 + 内嵌规则
            String scriptText = shot.getScriptText() != null ? shot.getScriptText() : 
                          "为分镜生成图片 - shotId: " + shotId;
            String prompt = customPrompt != null ? customPrompt : buildShotImagePrompt(scriptText);
    
            // 日志中不显示完整的内嵌提示词，只显示用户自定义部分
            String logPrompt = customPrompt != null ? "[自定义内容]" : prompt;
            log.info("提交异步图片任务 - shotId: {}, prompt: {}, referenceImageUrls: {}", shotId, logPrompt,
                    referenceImageUrls != null ? referenceImageUrls.size() : 0);

            AsyncImageTaskService.ImageTaskContext taskContext =
                    new AsyncImageTaskService.ImageTaskContext(
                            jobId, projectId, shotId, prompt, finalModel, finalAspectRatio, userId, 0);

            if (allHttpUrls(referenceImageUrls) && imageGenerationRouter.supportsAsyncImageTask(finalModel)) {
                ImageGenerationTaskService.SubmissionClaim claim = imageGenerationTaskService.claimSubmission(
                        jobId, shotId, 0, userId, projectId, prompt, finalModel, finalAspectRatio);
                var persistedTask = claim.task();
                if (persistedTask.getProviderTaskId() != null
                        && !persistedTask.getProviderTaskId().isBlank()) {
                    mqProducer.sendImagePollDelayed(persistedTask.getId());
                    return;
                }
                if (!claim.shouldSubmit()) {
                    log.info("单个分镜图提交已被另一消费者持有 - jobId: {}, shotId: {}", jobId, shotId);
                    return;
                }

                // 4. 提交GeekNow异步图片任务，拿到taskId后立即释放消费线程
                GeeknowClient.ImageTaskApiResponse submitResponse;
                try {
                    submitResponse = geeknowClient.submitImageTask(
                            prompt,
                            finalModel,
                            finalAspectRatio,
                            referenceImageUrls  // 传入参考图，实现图生图
                    );
                } catch (Exception submitError) {
                    imageGenerationTaskService.releaseSubmission(persistedTask.getId(), submitError.getMessage());
                    throw submitError;
                }
                String apiTaskId = submitResponse.id();
                if (apiTaskId == null || apiTaskId.isBlank()) {
                    throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "GeekNow未返回图片任务ID");
                }

                // 5. taskId落库后由Rabbit延迟轮询，不再启动本机while-loop。
                persistedTask = imageGenerationTaskService.recordSubmitted(persistedTask.getId(), apiTaskId);
                mqProducer.sendImagePollDelayed(persistedTask.getId());

                log.info("单个分镜图任务已提交并交由异步轮询 - jobId: {}, shotId: {}, apiTaskId: {}",
                        jobId, shotId, apiTaskId);
            } else {
                // 上游异步接口只支持http(s)参考图；本地参考图(base64)走同步生成，放异步线程池执行
                asyncImageTaskService.markItemRunning(jobId, shotId);
                asyncImageTaskService.generateImageSynchronouslyBlocking(referenceImageUrls, taskContext);
                log.info("单个分镜图任务含本地参考图,已在Rabbit消费边界内完成 - jobId: {}, shotId: {}",
                        jobId, shotId);
            }

        } catch (Exception e) {
            log.error("单个分镜图生成失败 - shotId: {}", shotId, e);
            throw e;
        }
    }

    /**
     * 执行批量分镜图生成
     */
    private void executeBatchShotImageGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> shotIds = msg.getTargetIds();
        String mode = msg.getMode();
        Integer countPerItem = msg.getCountPerItem() == null ? 1 : Math.max(1, msg.getCountPerItem());
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        if (!imageGenerationTaskService.isJobActive(jobId)) {
            log.info("批量分镜生图 Job 已结束，忽略残留消息 - jobId: {}", jobId);
            return;
        }

        String finalModel = msg.getModel() != null ? msg.getModel() : aiProperties.getImage().getDefaultModel();
        String finalAspectRatio = imageGenerationRouter.validateImageConfiguration(
                finalModel,
                msg.getAspectRatio() != null ? msg.getAspectRatio() : aiProperties.getImage().getDefaultAspectRatio());

        updateJobRunning(jobId);

        log.info("应用配置 - aspectRatio: {}, model: {}", finalAspectRatio, finalModel);

        AtomicInteger submittedTaskCount = new AtomicInteger(0);
        for (int i = 0; i < shotIds.size(); i++) {
            Long shotId = shotIds.get(i);
            log.info("处理分镜 [{}/{}] - shotId: {}", i + 1, shotIds.size(), shotId);

            try {
                if (imageGenerationTaskService.isJobItemTerminal(jobId, shotId)) {
                    log.info("分镜任务已结束，跳过残留消息 - jobId: {}, shotId: {}", jobId, shotId);
                    continue;
                }
                var shot = storyboardShotMapper.selectById(shotId);
                if (shot == null) {
                    log.warn("分镜不存在,跳过 - shotId: {}", shotId);
                    asyncImageTaskService.markItemFailed(jobId, shotId, "分镜不存在: " + shotId);
                    continue;
                }

                if ("MISSING".equals(mode)) {
                    var assetQuery = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<com.ym.ai_story_studio_server.entity.Asset>();
                    assetQuery.eq(com.ym.ai_story_studio_server.entity.Asset::getOwnerType, "SHOT")
                              .eq(com.ym.ai_story_studio_server.entity.Asset::getOwnerId, shotId)
                              .eq(com.ym.ai_story_studio_server.entity.Asset::getAssetType, "SHOT_IMG")
                              .eq(com.ym.ai_story_studio_server.entity.Asset::getProjectId, projectId);

                    long imageCount = assetMapper.selectCount(assetQuery);
                    if (imageCount > 0) {
                        log.info("MISSING模式 - 分镜已有图片资产,跳过 - shotId: {}", shotId);
                        asyncImageTaskService.markItemSucceeded(jobId, shotId, null);
                        continue;
                    }
                }

                String scriptText = shot.getScriptText() != null ? shot.getScriptText() :
                               "为分镜生成图片 - shotId: " + shotId;
                String prompt = buildShotImagePrompt(scriptText);

                // 查询分镜绑定的角色图片作为参考图
                List<String> referenceImageUrls = prepareReferenceImagesForUpstream(
                        jobId, getBoundCharacterImages(shotId));
                log.info("分镜绑定的角色图片数量 - shotId: {}, count: {}", shotId, referenceImageUrls.size());

                if (allHttpUrls(referenceImageUrls) && imageGenerationRouter.supportsAsyncImageTask(finalModel)) {
                    // 每个序号都先持久化提交意图；重投时已有providerTaskId的序号只补发轮询消息。
                    for (int j = 0; j < countPerItem; j++) {
                        ImageGenerationTaskService.SubmissionClaim claim = imageGenerationTaskService.claimSubmission(
                                jobId, shotId, j, userId, projectId, prompt, finalModel, finalAspectRatio);
                        var generationTask = claim.task();
                        if (generationTask.getProviderTaskId() != null
                                && !generationTask.getProviderTaskId().isBlank()) {
                            mqProducer.sendImagePollDelayed(generationTask.getId());
                            submittedTaskCount.incrementAndGet();
                            continue;
                        }
                        if (!claim.shouldSubmit()) {
                            log.info("图片提交已被另一消费者持有 - jobId: {}, shotId: {}, index: {}",
                                    jobId, shotId, j);
                            continue;
                        }
                        GeeknowClient.ImageTaskApiResponse submitResponse;
                        try {
                            submitResponse = geeknowClient.submitImageTask(
                                    prompt,
                                    finalModel,
                                    finalAspectRatio,
                                    referenceImageUrls  // 传入绑定的角色图片作为参考图
                            );
                        } catch (Exception submitError) {
                            imageGenerationTaskService.releaseSubmission(
                                    generationTask.getId(), submitError.getMessage());
                            throw submitError;
                        }
                        String apiTaskId = submitResponse.id();
                        if (apiTaskId == null || apiTaskId.isBlank()) {
                            throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "GeekNow未返回图片任务ID");
                        }
                        generationTask = imageGenerationTaskService.recordSubmitted(
                                generationTask.getId(), apiTaskId);
                        mqProducer.sendImagePollDelayed(generationTask.getId());
                        submittedTaskCount.incrementAndGet();
                    }
                    log.info("分镜图任务已提交 [{}/{}] - shotId: {}, taskCount: {}",
                            i + 1, shotIds.size(), shotId, countPerItem);
                } else {
                    // 同步回退也必须在消费边界内完成，否则 ack 后进程崩溃仍会丢任务。
                    asyncImageTaskService.markItemRunning(jobId, shotId);
                    for (int j = 0; j < countPerItem; j++) {
                        asyncImageTaskService.generateImageSynchronouslyBlocking(referenceImageUrls,
                                new AsyncImageTaskService.ImageTaskContext(
                                        jobId, projectId, shotId, prompt, finalModel, finalAspectRatio,
                                        userId, i * countPerItem + j));
                    }
                    submittedTaskCount.addAndGet(countPerItem);
                    log.info("分镜图任务含本地参考图,已交由同步生成(异步线程) [{}/{}] - shotId: {}",
                            i + 1, shotIds.size(), shotId);
                }

            } catch (Exception e) {
                log.error("分镜图任务提交失败 - shotId: {}", shotId, e);
                // 抛给消费边界：先进 TTL 重试队列，耗尽后才标记失败/DLQ。
                throw e;
            }
        }

        // Rabbit 只负责把任务可靠地提交给上游。主 Job 保持 RUNNING，
        // 由 AsyncImageTaskService 在每张图实际完成并落库后聚合终态。
        log.info("批量分镜图上游提交阶段完成 - jobId: {}, submittedTasks: {}, shots: {}",
                jobId, submittedTaskCount.get(), shotIds.size());
    }

    private int applicationRetryCount(Message message) {
        Object value = message.getMessageProperties().getHeaders().get("x-app-retry-count");
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(value.toString());
            } catch (NumberFormatException ignored) {
                // 非法头按首次投递处理。
            }
        }
        return 0;
    }

    /** 只允许尚未得到业务终态的网络/并发等待故障进入 TTL 重试队列。 */
    private boolean isRetryableSubmissionFailure(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof RetryableAiException) return true;
            current = current.getCause();
        }
        return false;
    }

    private void executeBatchVideoGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> shotIds = msg.getTargetIds();
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        updateJobRunning(jobId);

        String finalAspectRatio = msg.getAspectRatio() != null ? msg.getAspectRatio() :
                aiProperties.getVideo().getDefaultAspectRatio();
        String finalModel = msg.getModel() != null ? msg.getModel() :
                aiProperties.getVideo().getModel();
        Integer finalDuration = sudashuiVideoClient.resolveVideoDuration(
                finalModel,
                msg.getDuration() != null ? msg.getDuration() : aiProperties.getVideo().getDefaultDuration()
        );

        AtomicInteger submittedCount = new AtomicInteger(0);

        for (int i = 0; i < shotIds.size(); i++) {
            Long shotId = shotIds.get(i);
            log.info("处理分镜视频 [{}/{}] - shotId: {}", i + 1, shotIds.size(), shotId);

            try {
                var shot = storyboardShotMapper.selectById(shotId);
                if (shot == null) {
                    log.warn("分镜不存在,跳过 - shotId: {}", shotId);
                    asyncVideoTaskService.markParentItemFailed(jobId, shotId, "分镜不存在");
                    continue;
                }

                String scriptText = shot.getScriptText() != null ? shot.getScriptText() :
                               "为分镜生成视频 - shotId: " + shotId;

                // 人物参考图：按绑定顺序解析姓名+URL，与道具/场景/分镜图一起组装成带用途标注的
                // 参考图列表；编号在URL去重之后生成，保证prompt里的"图N"与实际发送顺序严格一致。
                List<CharacterReference> characterReferences = getBoundCharacterReferences(shotId);
                List<LabeledReference> labeledReferences;
                try {
                    labeledReferences = buildLabeledVideoReferencesFromBindings(shotId, characterReferences);
                } catch (BusinessException e) {
                    log.warn("分镜缺少场景画像资产，禁止生成视频 - shotId: {}", shotId);
                    asyncVideoTaskService.markParentItemFailed(jobId, shotId, e.getMessage());
                    continue;
                }
                List<String> referenceImageUrls = labeledReferences.stream()
                        .map(LabeledReference::url)
                        .toList();

                // Seedance 2.0 对prompt前段加权最高，参考图用途说明(人物锚定)必须放在最前，
                // 其后才是通用内嵌规则和分镜词。
                String usagePrompt = buildVideoReferenceUsagePrompt(labeledReferences);

                // 当前四个 Seedance 模型保留完整多参考列表；兼容未来单参考模型时再合并。
                if (referenceImageUrls.size() > 1
                        && !SudashuiVideoClient.supportsMultipleReferenceImages(finalModel)) {
                    referenceImageUrls = List.of(mergeReferenceImagesToSingleUrl(referenceImageUrls));
                    // 多图已拼成一张，"图N"编号不再成立
                    usagePrompt = "";
                }

                String prompt = usagePrompt + VIDEO_PROMPT_PREFIX + scriptText;

                VideoGenerateRequest request = new VideoGenerateRequest(
                        prompt,
                        finalAspectRatio,
                        finalDuration,
                        null,
                        null,
                        projectId,
                        finalModel,
                        referenceImageUrls
                );

                UserContext.setUserId(userId);
                try {
                    aiVideoService.generateVideo(request, jobId, shotId);
                    log.info("分镜视频生成任务已提交 - shotId: {}, referenceImageCount: {}",
                            shotId, referenceImageUrls.size());
                } finally {
                    UserContext.clear();
                }

                submittedCount.incrementAndGet();

            } catch (Exception e) {
                log.error("分镜视频生成失败 - shotId: {}", shotId, e);
                String errorMessage = e.getMessage() != null ? e.getMessage() : "视频任务提交失败";
                asyncVideoTaskService.markParentItemFailed(jobId, shotId, errorMessage);
            }
        }

        // Rabbit 只负责把任务可靠地提交给上游。主 Job 保持 RUNNING，
        // 由 AsyncVideoTaskService 在每个视频实际完成并落库后聚合终态。
        log.info("批量视频上游提交阶段完成 - jobId: {}, submitted: {}, total: {}",
                jobId, submittedCount.get(), shotIds.size());
    }

    /**
     * 执行单个分镜视频生成（支持自定义prompt和资产资源）
     */
    private void executeSingleShotVideoGeneration(SingleShotVideoMessage msg) {
        Long jobId = msg.getJobId();
        Long shotId = msg.getShotId();
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();
        String prompt = msg.getPrompt();
        String aspectRatio = msg.getAspectRatio();
        Integer duration = msg.getDuration();
        String size = msg.getSize();
        String referenceImageUrl = msg.getReferenceImageUrl();
        String model = msg.getModel();

        log.info("执行单个分镜视频生成 - jobId: {}, shotId: {}, promptLength: {}, hasReference: {}",
                jobId, shotId, prompt != null ? prompt.length() : 0, referenceImageUrl != null);
        updateJobRunning(jobId);
        asyncVideoTaskService.markParentItemRunning(jobId, shotId);

        // 应用配置
        String finalAspectRatio = aspectRatio != null ? aspectRatio :
                aiProperties.getVideo().getDefaultAspectRatio();
        String finalModel = model != null ? model : aiProperties.getVideo().getModel();
        Integer finalDuration = sudashuiVideoClient.resolveVideoDuration(
                finalModel,
                duration != null ? duration : aiProperties.getVideo().getDefaultDuration()
        );

        log.info("应用配置 - aspectRatio: {}, model: {}, duration: {}, size: {}", finalAspectRatio, finalModel, finalDuration, size);

        try {
            // 1. 查询分镜
            var shot = storyboardShotMapper.selectById(shotId);
            if (shot == null) {
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.SHOT_NOT_FOUND);
            }

            // 2. 分镜图资产：优先使用消息携带的URL，缺省时回退查询分镜当前图片
            if (referenceImageUrl == null || referenceImageUrl.isBlank()) {
                // 查询分镜当前图片资产
                AssetRef currentImageRef = assetRefMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AssetRef>()
                        .eq(AssetRef::getRefType, "SHOT_IMG_CURRENT")
                        .eq(AssetRef::getRefOwnerId, shotId)
                );

                if (currentImageRef != null) {
                    // 查询资产版本获取URL
                    AssetVersion assetVersion = assetVersionMapper.selectById(currentImageRef.getAssetVersionId());
                    if (assetVersion != null && assetVersion.getUrl() != null) {
                        referenceImageUrl = assetVersion.getUrl();
                        log.info("未提供分镜图资产，使用分镜当前图片 - shotId: {}, imageUrl: {}", shotId, referenceImageUrl);
                    }
                }
            }

            // 3. 组装多参考图：人物资产 + 道具资产 + 场景资产(强制) + 分镜图资产
            List<LabeledReference> labeledReferences = buildLabeledVideoReferences(msg, referenceImageUrl);
            List<String> referenceImageUrls = labeledReferences.stream()
                    .map(LabeledReference::url)
                    .toList();
            String usagePrompt = buildVideoReferenceUsagePrompt(labeledReferences);

            // 当前四个 Seedance 模型保留完整多参考列表；兼容未来单参考模型时再合并。
            if (referenceImageUrls.size() > 1
                    && !SudashuiVideoClient.supportsMultipleReferenceImages(finalModel)) {
                referenceImageUrls = List.of(mergeReferenceImagesToSingleUrl(referenceImageUrls));
                // 多图已拼成一张，"图N"编号不再成立
                usagePrompt = "";
            }

            // 4. 准备 prompt：参考图用途说明(人物锚定，放最前) + 分镜词 + 按项目风格追加前置提示词
            String finalPrompt = prompt != null ? prompt :
                    (shot.getScriptText() != null ? shot.getScriptText() :
                            "为分镜生成视频 - shotId: " + shotId);
            finalPrompt = applyStylePromptPrefix(projectId, usagePrompt + finalPrompt);

            log.info("调用AI生成视频 - shotId: {}, promptLength: {}, referenceImageCount: {}",
                    shotId, finalPrompt.length(), referenceImageUrls.size());

            UserContext.setUserId(userId);
            try {
                SudashuiVideoClient.VideoTaskResponse apiResponse = sudashuiVideoClient.createVideo(
                        finalPrompt,
                        finalModel,
                        finalAspectRatio,
                        finalDuration,
                        size,
                        referenceImageUrls
                );

                String apiTaskId = apiResponse.resolvedTaskId();
                log.info("视频生成任务已提交 - jobId: {}, apiTaskId: {}", jobId, apiTaskId);

                // 5. 保存taskId到metaJson
                try {
                    Map<String, Object> metaData = new HashMap<>();
                    metaData.put("model", finalModel);
                    metaData.put("aspectRatio", finalAspectRatio);
                    metaData.put("duration", finalDuration);
                    metaData.put("size", size);
                    metaData.put("prompt", finalPrompt);
                    metaData.put("apiTaskId", apiTaskId);
                    metaData.put("referenceImageUrls", referenceImageUrls);
                    metaData.put("shotId", shotId);
                    metaData.put("parentJobId", jobId);
                    Job job = jobMapper.selectById(jobId);
                    if (job != null) {
                        job.setMetaJson(objectMapper.writeValueAsString(metaData));
                        jobMapper.updateById(job);
                    }
                } catch (Exception e) {
                    log.error("Failed to update meta_json for single shot video jobId: {}", jobId, e);
                }

                // 6. 启动异步轮询，最终结果写回同一个jobId
                asyncVideoTaskService.pollVideoGenerationTask(
                        jobId,
                        apiTaskId,
                        finalModel,
                        finalAspectRatio,
                        finalDuration,
                        userId,
                        new AsyncVideoTaskService.VideoCompletionContext(
                                projectId, shotId, jobId, finalPrompt)
                );

                log.info("单个分镜视频生成任务提交完成 - shotId: {}", shotId);

            } finally {
                UserContext.clear();
            }

        } catch (Exception e) {
            log.error("单个分镜视频生成失败 - shotId: {}", shotId, e);
            String errorMessage = e.getMessage() != null ? e.getMessage() : "视频任务提交失败";
            updateJobFailed(jobId, errorMessage);
            asyncVideoTaskService.markParentItemFailed(jobId, shotId, errorMessage);
            throw e;
        }
    }

    /** 一张视频参考图及其在prompt"图N"用途说明中的角色定位。 */
    private record LabeledReference(String description, String url, boolean isCharacter) {}

    /** 人物设定图是四视图拼合图，必须显式告知模型"图内多个视角是同一角色"，否则会被当成多个人物导致ID漂移。 */
    private static LabeledReference characterReference(String name, String url) {
        return new LabeledReference(
                "角色\"" + name + "\"的形象设定图（图中所有视角均为同一角色，并非多人）", url, true);
    }

    /**
     * 组装视频生成的多参考图列表：人物资产 → 道具资产 → 场景资产 → 分镜图资产。
     *
     * <p>单分镜链路使用，资产信息来自消息体。场景画像资产为强制项，解析不到可用图片时
     * 直接抛出异常终止任务。返回列表已按URL去重（保留首次出现），"图N"编号以该列表为准。
     */
    private List<LabeledReference> buildLabeledVideoReferences(SingleShotVideoMessage msg, String shotImageUrl) {
        List<LabeledReference> references = new ArrayList<>();

        if (msg.getCharacters() != null) {
            for (var character : msg.getCharacters()) {
                String name = character.name() != null ? character.name() : ("角色" + character.id());
                String url = isValidReferenceUrl(character.thumbnailUrl())
                        ? character.thumbnailUrl()
                        : resolveCharacterThumbnail(character.id());
                if (isValidReferenceUrl(url)) {
                    references.add(characterReference(name, url));
                }
            }
        }

        if (msg.getProps() != null) {
            for (var prop : msg.getProps()) {
                String name = prop.name() != null ? prop.name() : "道具";
                String url = isValidReferenceUrl(prop.thumbnailUrl())
                        ? prop.thumbnailUrl()
                        : resolvePropThumbnail(prop.id());
                if (isValidReferenceUrl(url)) {
                    references.add(new LabeledReference("道具\"" + name + "\"的参考图", url, false));
                }
            }
        }

        String sceneImageUrl = null;
        if (msg.getScene() != null) {
            sceneImageUrl = isValidReferenceUrl(msg.getScene().thumbnailUrl())
                    ? msg.getScene().thumbnailUrl()
                    : resolveSceneThumbnail(msg.getScene().id());
        }
        appendSceneAndShotReferences(references, sceneImageUrl, shotImageUrl);
        return dedupByUrl(references);
    }

    /**
     * 从分镜绑定关系与资产系统解析视频多参考图：人物资产 → 道具资产 → 场景资产(强制) → 分镜图资产。
     *
     * <p>批量视频链路使用；缺少场景画像资产时抛出异常，由调用方将该分镜标记失败。
     *
     * @param characterReferences 调用方已解析好的人物参考图（姓名+URL，与查库顺序一致，
     *                            避免重复查库、且保证顺序与prompt用途说明完全一致）
     */
    private List<LabeledReference> buildLabeledVideoReferencesFromBindings(
            Long shotId, List<CharacterReference> characterReferences) {
        List<LabeledReference> references = new ArrayList<>();
        for (CharacterReference character : characterReferences) {
            references.add(characterReference(character.name(), character.url()));
        }

        List<ShotBinding> bindings = shotBindingMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShotBinding>()
                        .eq(ShotBinding::getShotId, shotId));

        // 道具画像
        for (ShotBinding binding : bindings) {
            if (!"PPROP".equals(binding.getBindType())) {
                continue;
            }
            String propThumbnail = resolvePropThumbnail(binding.getBindId());
            if (isValidReferenceUrl(propThumbnail)) {
                ProjectProp projectProp = projectPropMapper.selectById(binding.getBindId());
                String propName = projectProp != null && projectProp.getDisplayName() != null
                        ? projectProp.getDisplayName() : "道具";
                references.add(new LabeledReference("道具\"" + propName + "\"的参考图", propThumbnail, false));
            }
        }

        // 场景画像（强制）
        String sceneImageUrl = null;
        for (ShotBinding binding : bindings) {
            if (!"PSCENE".equals(binding.getBindType())) {
                continue;
            }
            String sceneThumbnail = resolveSceneThumbnail(binding.getBindId());
            if (isValidReferenceUrl(sceneThumbnail)) {
                sceneImageUrl = sceneThumbnail;
                break;
            }
        }
        appendSceneAndShotReferences(references, sceneImageUrl, resolveShotCurrentImageUrl(shotId));
        return dedupByUrl(references);
    }

    /** 追加场景(强制，缺失抛异常)与分镜图参考；两条视频链路共用的收尾逻辑。 */
    private void appendSceneAndShotReferences(
            List<LabeledReference> references, String sceneImageUrl, String shotImageUrl) {
        if (!isValidReferenceUrl(sceneImageUrl)) {
            throw new BusinessException(
                    com.ym.ai_story_studio_server.common.ResultCode.PARAM_INVALID,
                    "缺少场景画像资产，禁止生成视频");
        }
        references.add(new LabeledReference("场景参考图，画面环境须与其保持一致", sceneImageUrl, false));

        if (isValidReferenceUrl(shotImageUrl)) {
            references.add(new LabeledReference(
                    "本分镜的画面参考图（仅参考构图与人物站位，人物样貌以各角色设定图为准）", shotImageUrl, false));
        }
    }

    /** 按URL去重（保留首次出现），去重必须发生在"图N"编号生成之前，否则编号会错位。 */
    private List<LabeledReference> dedupByUrl(List<LabeledReference> references) {
        List<LabeledReference> deduped = new ArrayList<>();
        java.util.Set<String> seenUrls = new HashSet<>();
        for (LabeledReference reference : references) {
            if (seenUrls.add(reference.url())) {
                deduped.add(reference);
            }
        }
        return deduped;
    }

    /** 查询分镜当前图片资产(分镜图)的URL。 */
    private String resolveShotCurrentImageUrl(Long shotId) {
        AssetRef currentImageRef = assetRefMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AssetRef>()
                        .eq(AssetRef::getRefType, "SHOT_IMG_CURRENT")
                        .eq(AssetRef::getRefOwnerId, shotId));
        if (currentImageRef == null) {
            return null;
        }
        AssetVersion assetVersion = assetVersionMapper.selectById(currentImageRef.getAssetVersionId());
        return assetVersion != null ? assetVersion.getUrl() : null;
    }

    /** 兼容仅支持单参考图的未来模型；当前四个 Seedance 模型保留完整多参考列表。 */
    private String mergeReferenceImagesToSingleUrl(List<String> imageUrls) {
        try {
            byte[] mergedImageBytes = imageMergeUtil.mergeImagesHorizontally(imageUrls);
            String mergedUrl = storageService.uploadImageBytes(
                    mergedImageBytes,
                    "merged_video_ref_" + System.currentTimeMillis() + ".png"
            );
            log.info("参考图已拼接并上传: {}", mergedUrl);
            return mergedUrl;
        } catch (Exception e) {
            log.warn("参考图拼接失败，回退到首张参考图: {}", e.getMessage());
            return imageUrls.get(0);
        }
    }

    private boolean isValidReferenceUrl(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        return !url.contains("via.placeholder.com");
    }

    /**
     * 生成"@imageN为XX"的参考图用途说明，放在视频prompt最前面。
     *
     * <p>sudashuiapi 的 {@code metadata.payload.imageUrls} 是无标签的平铺数组，上游模型靠
     * prompt 里的 {@code @image1}/{@code @image2}… 标签(按数组位置，而非文件名编号)定位每张图，
     * 这是文档明确要求的语法糖，不是自造的中文习惯——之前误用中文"图1/图2"纯文字描述，模型
     * 无法据此对应到具体的参考图。标签前后按文档示例保留空格，帮助上游 tokenizer 识别边界。
     * (1) 主体(人物)锚定说明放在prompt开头(模型对前段加权最高)，(2) 人物设定图为多视角拼合图时
     * 必须声明"图内均为同一角色"，否则模型会把不同视角识别为多个人物，造成样貌漂移。
     * 编号与 {@link #dedupByUrl} 去重后的最终发送顺序严格一致，即 {@code @imageN} 对应
     * {@code imageUrls[N-1]}。
     */
    private String buildVideoReferenceUsagePrompt(List<LabeledReference> references) {
        if (references.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("参考图共").append(references.size()).append("张，按顺序：");
        boolean hasCharacter = false;
        for (int i = 0; i < references.size(); i++) {
            if (i > 0) {
                sb.append("；");
            }
            sb.append(" @image").append(i + 1).append(" 为").append(references.get(i).description());
            hasCharacter |= references.get(i).isCharacter();
        }
        sb.append("。");
        if (hasCharacter) {
            sb.append("生成画面中各角色的长相、发型、服装必须严格与其对应设定图一致，不同角色之间不得混淆样貌。");
        }
        return sb.toString();
    }

    /**
     * 按项目 styleCode(3DGC/REALISTIC) 在 prompt 前追加对应风格的固定提示词。
     *
     * <p>仅用于绕开 {@link AiVideoService#generateVideo} 直接调用 {@link SudashuiVideoClient} 的
     * 单分镜视频旧链路({@link #executeSingleShotVideoGeneration});批量链路的风格前缀已经在
     * {@code AiVideoService.generateVideo} 内统一应用，不要在 {@link #executeBatchVideoGeneration}
     * 里重复调用，否则会叠加两次。
     */
    private String applyStylePromptPrefix(Long projectId, String prompt) {
        if (projectId == null) {
            return prompt;
        }
        Project project = projectMapper.selectById(projectId);
        if (project == null) {
            return prompt;
        }
        String stylePrefix = aiProperties.getVideo().resolveStylePromptPrefix(project.getStyleCode());
        return stylePrefix.isBlank() ? prompt : stylePrefix + "，" + prompt;
    }

    private String resolveSceneThumbnail(Long projectSceneId) {
        if (projectSceneId == null) {
            return null;
        }
        ProjectScene projectScene = projectSceneMapper.selectById(projectSceneId);
        if (projectScene == null) {
            return null;
        }
        if (isValidReferenceUrl(projectScene.getThumbnailUrl())) {
            return projectScene.getThumbnailUrl();
        }
        if (projectScene.getLibrarySceneId() == null) {
            return null;
        }
        SceneLibrary sceneLibrary = sceneLibraryMapper.selectById(projectScene.getLibrarySceneId());
        return sceneLibrary != null ? sceneLibrary.getThumbnailUrl() : null;
    }

    private String resolveCharacterThumbnail(Long projectCharacterId) {
        if (projectCharacterId == null) {
            return null;
        }
        ProjectCharacter projectCharacter = projectCharacterMapper.selectById(projectCharacterId);
        if (projectCharacter == null) {
            return null;
        }
        if (isValidReferenceUrl(projectCharacter.getThumbnailUrl())) {
            return projectCharacter.getThumbnailUrl();
        }
        if (projectCharacter.getLibraryCharacterId() == null) {
            return null;
        }
        CharacterLibrary characterLibrary = characterLibraryMapper.selectById(projectCharacter.getLibraryCharacterId());
        return characterLibrary != null ? characterLibrary.getThumbnailUrl() : null;
    }

    private String resolvePropThumbnail(Long projectPropId) {
        if (projectPropId == null) {
            return null;
        }
        ProjectProp projectProp = projectPropMapper.selectById(projectPropId);
        if (projectProp == null) {
            return null;
        }
        if (projectProp.getThumbnailUrl() != null && !projectProp.getThumbnailUrl().isBlank()) {
            return projectProp.getThumbnailUrl();
        }
        if (projectProp.getLibraryPropId() == null) {
            return null;
        }
        PropLibrary propLibrary = propLibraryMapper.selectById(projectProp.getLibraryPropId());
        return propLibrary != null ? propLibrary.getThumbnailUrl() : null;
    }

    private void executeBatchCharacterImageGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> characterIds = msg.getTargetIds(); // 这是 project_character 的 ID
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        log.info("执行批量角色画像生成 - jobId: {}, characterCount: {}", jobId, characterIds.size());
        updateJobRunning(jobId);

        String finalAspectRatio = msg.getAspectRatio() != null ? msg.getAspectRatio() : "1:1";
        String finalModel = msg.getModel() != null ? msg.getModel() : aiProperties.getImage().getDefaultModel();

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        
        // 收集所有生成的图片URL（用于Job的allImageUrls）
        List<String> allGeneratedImageUrls = new java.util.ArrayList<>();

        for (int i = 0; i < characterIds.size(); i++) {
            Long projectCharacterId = characterIds.get(i);

            try {
                // 1. 查询项目角色
                ProjectCharacter projectCharacter = projectCharacterMapper.selectById(projectCharacterId);
                if (projectCharacter == null) {
                    log.warn("项目角色不存在 - projectCharacterId: {}", projectCharacterId);
                    failCount.incrementAndGet();
                    continue;
                }

                // 2. 查询角色库中的角色（可能为NULL，支持自定义角色）
                CharacterLibrary character = null;
                if (projectCharacter.getLibraryCharacterId() != null) {
                    character = characterLibraryMapper.selectById(projectCharacter.getLibraryCharacterId());
                }
                
                // 判断是否为自定义角色（未关联角色库）
                boolean isCustomCharacter = (character == null);
                log.info("角色类型 - projectCharacterId: {}, 自定义角色: {}", projectCharacterId, isCustomCharacter);

                // 3. MISSING模式：检查是否已有图片
                String existingThumbnail = isCustomCharacter ? 
                        projectCharacter.getThumbnailUrl() : character.getThumbnailUrl();
                if ("MISSING".equals(msg.getMode()) && existingThumbnail != null && !existingThumbnail.isEmpty()) {
                    log.info("MISSING模式 - 角色已有图片,跳过 - projectCharacterId: {}", projectCharacterId);
                    successCount.incrementAndGet();
                    continue;
                }

                // 4. 构建提示词：基于AI分析的描述生成角色立绘
                // 内嵌规则：提取角色的年龄、性别、外貌、服装
                String characterName;
                String description;
                if (isCustomCharacter) {
                    // 自定义角色：使用项目角色的信息
                    characterName = projectCharacter.getDisplayName() != null ? 
                            projectCharacter.getDisplayName() : "未命名角色";
                    description = projectCharacter.getOverrideDescription();
                } else {
                    // 关联角色库：优先使用覆盖描述
                    characterName = projectCharacter.getDisplayName() != null ?
                            projectCharacter.getDisplayName() : character.getName();
                    description = projectCharacter.getOverrideDescription() != null ?
                            projectCharacter.getOverrideDescription() : character.getDescription();
                }
                
                // 构建优化的提示词：固定前置规则 + 强调角色特征（年龄、性别、外貌、服装）
                String prompt;
                if (description != null && !description.trim().isEmpty()) {
                    // 有AI分析描述：直接使用描述作为主要提示词
                    prompt = String.format("%s，角色立绘，%s，高质量，精细绘制，全身像，正面站立，面向镜头",
                            CHARACTER_PORTRAIT_PROMPT_PREFIX, description.trim());
                } else {
                    // 无描述：使用角色名称
                    prompt = String.format("%s，角色立绘，%s，高质量，精细绘制，全身像，正面站立",
                            CHARACTER_PORTRAIT_PROMPT_PREFIX, characterName);
                }

                log.info("生成角色图片 - projectCharacterId: {}, name: {}, prompt: {}", projectCharacterId, characterName, prompt);

                // 5. 调用 GeekNow 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageApiResponse response = imageGenerationRouter.generateImage(
                            prompt,
                            finalModel,
                            finalAspectRatio,
                            Collections.emptyList()  // 无参考图片
                    );

                    // 6. 解析图片结果
                    if (response == null || response.data() == null || response.data().isEmpty()) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "图片生成结果为空");
                    }

                    // 获取所有返回的图片数据（即梦模型返回4张图片）
                    List<ImageApiResponse.ImageData> allResults = response.data();
                    log.info("AI返回 {} 张图片 - projectCharacterId: {}", allResults.size(), projectCharacterId);

                    // 7. 处理所有图片并上传到OSS
                    List<String> ossUrls = new java.util.ArrayList<>();
                    for (int j = 0; j < allResults.size(); j++) {
                        String imageData = allResults.get(j).url();
                        if (imageData == null) {
                            log.warn("第 {} 张图片数据为空,跳过", j + 1);
                            continue;
                        }
                        String ossUrl = processImageAndUploadToOss(imageData, jobId, i * 10 + j);
                        ossUrls.add(ossUrl);
                        allGeneratedImageUrls.add(ossUrl);
                        log.info("上传图片 [{}/{}] 到OSS成功 - ossUrl: {}", j + 1, allResults.size(), ossUrl);
                    }

                    if (ossUrls.isEmpty()) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "无法获取有效的图片数据");
                    }

                    // 8. 使用第一张图片更新缩略图URL
                    String primaryOssUrl = ossUrls.get(0);
                    if (isCustomCharacter) {
                        // 自定义角色：保存到项目角色表
                        projectCharacter.setThumbnailUrl(primaryOssUrl);
                        projectCharacterMapper.updateById(projectCharacter);
                        log.info("自定义角色图片保存成功 - projectCharacterId: {}, ossUrl: {}", projectCharacterId, primaryOssUrl);
                    } else {
                        // 关联角色库：保存到角色库表
                        character.setThumbnailUrl(primaryOssUrl);
                        characterLibraryMapper.updateById(character);
                        log.info("角色库图片更新成功 - characterId: {}, ossUrl: {}", character.getId(), primaryOssUrl);
                    }

                    log.info("角色图片生成成功 - projectCharacterId: {}, 总图片数: {}, 主图: {}", 
                            projectCharacterId, ossUrls.size(), primaryOssUrl);

                    // 9. 扣除积分（按批次扣费，不按图片张数）
                    Map<String, Object> metaData = new HashMap<>();
                    metaData.put("projectCharacterId", projectCharacterId);
                    metaData.put("characterName", characterName);
                    metaData.put("isCustomCharacter", isCustomCharacter);
                    metaData.put("model", finalModel);
                    metaData.put("imageCount", ossUrls.size());
                    metaData.put("allImageUrls", ossUrls);

                    chargingService.charge(
                            ChargingService.ChargingRequest.builder()
                                    .jobId(jobId)
                                    .bizType("IMAGE_GENERATION")
                                    .modelCode(finalModel)
                                    .quantity(1)  // 按批次扣费
                                    .metaData(metaData)
                                    .build()
                    );

                    successCount.incrementAndGet();

                } finally {
                    UserContext.clear();
                }

            } catch (Exception e) {
                failCount.incrementAndGet();
                log.error("角色图片生成失败 - projectCharacterId: {}", projectCharacterId, e);
            }

            updateJobProgress(jobId, i + 1, characterIds.size());
        }

        log.info("批量生成角色画像完成 - 成功: {}, 失败: {}, 总图片数: {}", 
                successCount.get(), failCount.get(), allGeneratedImageUrls.size());
        
        // 更新Job状态并保存所有图片URL到metaJson
        updateJobSuccessWithImages(jobId, successCount.get(), failCount.get(), allGeneratedImageUrls);
    }

    private void executeBatchSceneImageGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> sceneIds = msg.getTargetIds(); // 这是 project_scene 的 ID
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        log.info("执行批量场景画像生成 - jobId: {}, sceneCount: {}", jobId, sceneIds.size());
        updateJobRunning(jobId);

        String finalAspectRatio = msg.getAspectRatio() != null ? msg.getAspectRatio() : "16:9";
        String finalModel = msg.getModel() != null ? msg.getModel() : aiProperties.getImage().getDefaultModel();

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        List<String> allGeneratedImageUrls = new ArrayList<>();
        String lastError = null;

        for (int i = 0; i < sceneIds.size(); i++) {
            Long projectSceneId = sceneIds.get(i);

            try {
                // 1. 查询项目场景
                ProjectScene projectScene = projectSceneMapper.selectById(projectSceneId);
                if (projectScene == null) {
                    log.warn("项目场景不存在 - projectSceneId: {}", projectSceneId);
                    failCount.incrementAndGet();
                    lastError = "项目场景不存在: " + projectSceneId;
                    continue;
                }

                // 2. 查询场景库中的场景（可能为null，自定义场景不关联场景库）
                SceneLibrary scene = null;
                if (projectScene.getLibrarySceneId() != null) {
                    scene = sceneLibraryMapper.selectById(projectScene.getLibrarySceneId());
                }

                // 3. 获取场景名称和描述（优先使用项目场景覆盖，其次使用场景库）
                String sceneName = projectScene.getDisplayName();
                String description = projectScene.getOverrideDescription();
                if (sceneName == null && scene != null) {
                    sceneName = scene.getName();
                }
                if (description == null && scene != null) {
                    description = scene.getDescription();
                }
                if (sceneName == null) {
                    sceneName = "场景";
                }

                // 4. MISSING模式：检查是否已有图片（优先检查项目场景，其次场景库）
                String existingThumbnail = projectScene.getThumbnailUrl();
                if (existingThumbnail == null && scene != null) {
                    existingThumbnail = scene.getThumbnailUrl();
                }
                if ("MISSING".equals(msg.getMode()) && existingThumbnail != null) {
                    log.info("MISSING模式 - 场景已有图片,跳过 - projectSceneId: {}", projectSceneId);
                    successCount.incrementAndGet();
                    continue;
                }

                // 5. 构建提示词：使用场景描述生成场景图
                String prompt = String.format("纯场景背景图，%s，%s，高质量高清，画质细腻，空无一人的场景，禁止出现任何人物、角色、人影、动物，只有纯背景环境",
                        sceneName, description != null ? description : "");

                log.info("生成场景图片 - projectSceneId: {}, name: {}, prompt: {}", projectSceneId, sceneName, prompt);

                // 6. 调用 GeekNow 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageApiResponse response = imageGenerationRouter.generateImage(
                            prompt,
                            finalModel,
                            finalAspectRatio,
                            Collections.emptyList()  // 无参考图片
                    );

                    // 7. 解析图片结果
                    if (response == null || response.data() == null || response.data().isEmpty()) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "图片生成结果为空");
                    }

                    // 获取图片URL或base64
                    ImageApiResponse.ImageData firstResult = response.data().get(0);
                    String imageData = firstResult.url();

                    if (imageData == null) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "无法获取图片数据");
                    }

                    // 8. 上传到OSS
                    String ossUrl = processImageAndUploadToOss(imageData, jobId, i);

                    // 9. 保存缩略图URL（优先保存到项目场景）
                    projectScene.setThumbnailUrl(ossUrl);
                    projectSceneMapper.updateById(projectScene);
                    // 如果关联了场景库，也更新场景库
                    if (scene != null) {
                        scene.setThumbnailUrl(ossUrl);
                        sceneLibraryMapper.updateById(scene);
                    }

                    log.info("场景图片生成成功 - projectSceneId: {}, ossUrl: {}", projectSceneId, ossUrl);
                    allGeneratedImageUrls.add(ossUrl);

                    // 10. 扣除积分
                    Map<String, Object> metaData = new HashMap<>();
                    metaData.put("projectSceneId", projectSceneId);
                    metaData.put("sceneName", sceneName);
                    metaData.put("model", finalModel);

                    chargingService.charge(
                            ChargingService.ChargingRequest.builder()
                                    .jobId(jobId)
                                    .bizType("IMAGE_GENERATION")
                                    .modelCode(finalModel)
                                    .quantity(1)
                                    .metaData(metaData)
                                    .build()
                    );

                    successCount.incrementAndGet();

                } finally {
                    UserContext.clear();
                }

            } catch (Exception e) {
                failCount.incrementAndGet();
                lastError = e.getMessage();
                log.error("场景图片生成失败 - projectSceneId: {}", projectSceneId, e);
            }

            updateJobProgress(jobId, i + 1, sceneIds.size());
        }

        log.info("批量生成场景画像完成 - 成功: {}, 失败: {}", successCount.get(), failCount.get());
        if (successCount.get() == 0 && failCount.get() > 0) {
            updateJobFailedWithCounts(jobId, 0, failCount.get(),
                    lastError != null ? lastError : "All items failed");
        } else {
            updateJobSuccessWithImages(jobId, successCount.get(), failCount.get(), allGeneratedImageUrls);
        }
    }

    private void executeBatchPropImageGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> propIds = msg.getTargetIds(); // 这是 project_prop 的 ID
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        log.info("执行批量道具画像生成 - jobId: {}, propCount: {}", jobId, propIds.size());
        updateJobRunning(jobId);

        String finalAspectRatio = msg.getAspectRatio() != null ? msg.getAspectRatio() : "1:1";
        String finalModel = msg.getModel() != null ? msg.getModel() : aiProperties.getImage().getDefaultModel();

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        
        // 收集所有生成的图片URL（用于Job的allImageUrls）
        List<String> allGeneratedImageUrls = new java.util.ArrayList<>();
        String lastError = null;

        for (int i = 0; i < propIds.size(); i++) {
            Long projectPropId = propIds.get(i);

            try {
                // 1. 查询项目道具
                ProjectProp projectProp = projectPropMapper.selectById(projectPropId);
                if (projectProp == null) {
                    log.warn("项目道具不存在 - projectPropId: {}", projectPropId);
                    failCount.incrementAndGet();
                    lastError = "项目道具不存在: " + projectPropId;
                    continue;
                }

                // 2. 查询道具库中的道具（自定义道具允许不关联道具库）
                PropLibrary prop = projectProp.getLibraryPropId() != null
                        ? propLibraryMapper.selectById(projectProp.getLibraryPropId())
                        : null;
                if (projectProp.getLibraryPropId() != null && prop == null) {
                    log.warn("道具库道具不存在 - libraryPropId: {}", projectProp.getLibraryPropId());
                    failCount.incrementAndGet();
                    lastError = "道具库道具不存在: " + projectProp.getLibraryPropId();
                    continue;
                }

                // 3. MISSING模式：检查是否已有图片
                String existingThumbnail = projectProp.getThumbnailUrl();
                if ((existingThumbnail == null || existingThumbnail.isBlank()) && prop != null) {
                    existingThumbnail = prop.getThumbnailUrl();
                }
                if ("MISSING".equals(msg.getMode()) && existingThumbnail != null && !existingThumbnail.isBlank()) {
                    log.info("MISSING模式 - 道具已有图片,跳过 - projectPropId: {}", projectPropId);
                    successCount.incrementAndGet();
                    continue;
                }

                // 4. 构建提示词：使用道具描述生成道具图
                String description = projectProp.getOverrideDescription() != null ?
                        projectProp.getOverrideDescription() : (prop != null ? prop.getDescription() : null);
                String propName = projectProp.getDisplayName() != null ?
                        projectProp.getDisplayName() : (prop != null ? prop.getName() : "道具");
                String prompt = buildPropImagePrompt(propName, description);

                log.info("生成道具图片 - projectPropId: {}, name: {}, prompt: {}", projectPropId, propName, prompt);

                // 5. 调用 GeekNow 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageApiResponse response = imageGenerationRouter.generateImage(
                            prompt,
                            finalModel,
                            finalAspectRatio,
                            Collections.emptyList()  // 无参考图片
                    );

                    // 6. 解析图片结果
                    if (response == null || response.data() == null || response.data().isEmpty()) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "图片生成结果为空");
                    }

                    // 获取所有返回的图片数据（即梦模型返回4张图片）
                    List<ImageApiResponse.ImageData> allResults = response.data();
                    log.info("AI返回 {} 张图片 - projectPropId: {}", allResults.size(), projectPropId);

                    // 7. 处理所有图片并上传到OSS
                    List<String> ossUrls = new java.util.ArrayList<>();
                    for (int j = 0; j < allResults.size(); j++) {
                        String imageData = allResults.get(j).url();
                        if (imageData == null) {
                            log.warn("第 {} 张图片数据为空,跳过", j + 1);
                            continue;
                        }
                        String ossUrl = processImageAndUploadToOss(imageData, jobId, i * 10 + j);
                        ossUrls.add(ossUrl);
                        allGeneratedImageUrls.add(ossUrl);
                        log.info("上传图片 [{}/{}] 到OSS成功 - ossUrl: {}", j + 1, allResults.size(), ossUrl);
                    }

                    if (ossUrls.isEmpty()) {
                        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "无法获取有效的图片数据");
                    }

                    // 8. 项目道具始终保存主图；关联库存在时同步更新库主图
                    String primaryOssUrl = ossUrls.get(0);
                    projectProp.setThumbnailUrl(primaryOssUrl);
                    projectPropMapper.updateById(projectProp);
                    if (prop != null) {
                        prop.setThumbnailUrl(primaryOssUrl);
                        propLibraryMapper.updateById(prop);
                    }

                    log.info("道具图片生成成功 - projectPropId: {}, 总图片数: {}, 主图: {}",
                            projectPropId, ossUrls.size(), primaryOssUrl);

                    // 9. 扣除积分（按批次扣费，不按图片张数）
                    Map<String, Object> metaData = new HashMap<>();
                    metaData.put("projectPropId", projectPropId);
                    metaData.put("libraryPropId", projectProp.getLibraryPropId());
                    metaData.put("propName", propName);
                    metaData.put("model", finalModel);
                    metaData.put("imageCount", ossUrls.size());
                    metaData.put("allImageUrls", ossUrls);

                    chargingService.charge(
                            ChargingService.ChargingRequest.builder()
                                    .jobId(jobId)
                                    .bizType("IMAGE_GENERATION")
                                    .modelCode(finalModel)
                                    .quantity(1)  // 按批次扣费
                                    .metaData(metaData)
                                    .build()
                    );

                    successCount.incrementAndGet();

                } finally {
                    UserContext.clear();
                }

            } catch (Exception e) {
                failCount.incrementAndGet();
                lastError = e.getMessage();
                log.error("道具图片生成失败 - projectPropId: {}", projectPropId, e);
            }

            updateJobProgress(jobId, i + 1, propIds.size());
        }

        log.info("批量生成道具画像完成 - 成功: {}, 失败: {}, 总图片数: {}", 
                successCount.get(), failCount.get(), allGeneratedImageUrls.size());
        
        if (successCount.get() == 0 && failCount.get() > 0) {
            updateJobFailedWithCounts(jobId, 0, failCount.get(),
                    lastError != null ? lastError : "All items failed");
        } else {
            updateJobSuccessWithImages(jobId, successCount.get(), failCount.get(), allGeneratedImageUrls);
        }
    }

    static String buildPropImagePrompt(String propName, String description) {
        if (description == null || description.isBlank()) {
            return propName;
        }
        return String.format("道具画像，%s，%s，高质量高清，画质细腻，白色背景，单个物件",
                propName, description.trim());
    }

    private void executeTextParsing(TextParsingMessage msg) {
        aiTextService.executeQueuedTextJob(msg.getJobId(), msg.getUserId(), msg.getProjectId());
    }

    // ==================== Job状态更新方法 ====================

    private void updateJobRunning(Long jobId) {
        Job current = jobMapper.selectById(jobId);
        if (current == null
                || "SUCCEEDED".equals(current.getStatus())
                || "FAILED".equals(current.getStatus())
                || "CANCELED".equals(current.getStatus())) {
            return;
        }
        Job job = new Job();
        job.setId(jobId);
        job.setStatus("RUNNING");
        jobMapper.updateById(job);
        log.info("Job状态更新为RUNNING - jobId: {}", jobId);
    }

    private void updateJobProgress(Long jobId, Integer doneItems, Integer totalItems) {
        Job job = new Job();
        job.setId(jobId);
        job.setDoneItems(doneItems);
        job.setProgress((int) Math.round((doneItems * 100.0) / totalItems));
        jobMapper.updateById(job);
        log.debug("Job进度更新 - jobId: {}, progress: {}%", jobId, job.getProgress());
    }

    private void updateJobSuccess(Long jobId, Integer successCount, Integer failCount) {
        if (successCount == 0 && failCount > 0) {
            updateJobFailedWithCounts(jobId, successCount, failCount, "All items failed");
            return;
        }

        Job job = new Job();
        job.setId(jobId);
        job.setStatus("SUCCEEDED");
        job.setDoneItems(successCount + failCount);
        job.setProgress(100);
        // 将结果摘要存储在metaJson中
        String metaJson = String.format("{\"successCount\": %d, \"failCount\": %d}", successCount, failCount);
        job.setMetaJson(metaJson);
        jobMapper.updateById(job);
        log.info("Job状态更新为SUCCEEDED - jobId: {}, 成功: {}, 失败: {}", jobId, successCount, failCount);
    }

    /**
     * 更新Job状态为成功，并保存所有生成的图片URL
     *
     * @param jobId 任务ID
     * @param successCount 成功数量
     * @param failCount 失败数量
     * @param allImageUrls 所有生成的图片URL列表
     */
    private void updateJobSuccessWithImages(Long jobId, Integer successCount, Integer failCount, List<String> allImageUrls) {
        if (successCount == 0 && failCount > 0) {
            updateJobFailedWithCounts(jobId, successCount, failCount, "All items failed");
            return;
        }

        Job job = jobMapper.selectById(jobId);
        if (job == null) {
            log.error("任务不存在 - jobId: {}", jobId);
            return;
        }
        
        job.setStatus("SUCCEEDED");
        job.setDoneItems(successCount + failCount);
        job.setProgress(100);
        
        // 设置第一张图片为resultUrl
        if (!allImageUrls.isEmpty()) {
            job.setResultUrl(allImageUrls.get(0));
        }
        
        // 将所有图片URL保存到metaJson
        try {
            Map<String, Object> metaData = new HashMap<>();
            metaData.put("successCount", successCount);
            metaData.put("failCount", failCount);
            metaData.put("allImageUrls", allImageUrls);
            metaData.put("imageCount", allImageUrls.size());
            job.setMetaJson(objectMapper.writeValueAsString(metaData));
        } catch (Exception e) {
            log.error("序列化metaJson失败", e);
            job.setMetaJson(String.format("{\"successCount\": %d, \"failCount\": %d, \"imageCount\": %d}", 
                    successCount, failCount, allImageUrls.size()));
        }
        
        jobMapper.updateById(job);
        log.info("Job状态更新为SUCCEEDED(带图片) - jobId: {}, 成功: {}, 失败: {}, 总图片数: {}", 
                jobId, successCount, failCount, allImageUrls.size());
    }

    private void updateJobFailed(Long jobId, String errorMessage) {
        Job job = new Job();
        job.setId(jobId);
        job.setStatus("FAILED");
        job.setErrorMessage(errorMessage);
        jobMapper.updateById(job);
        log.error("Job状态更新为FAILED - jobId: {}, error: {}", jobId, errorMessage);
    }

    private void updateJobFailedWithCounts(Long jobId, Integer successCount, Integer failCount, String errorMessage) {
        Job job = new Job();
        job.setId(jobId);
        job.setStatus("FAILED");
        job.setDoneItems(successCount + failCount);
        job.setProgress(100);
        job.setErrorMessage(errorMessage);
        jobMapper.updateById(job);
        log.error("Job状态更新为FAILED - jobId: {}, success: {}, fail: {}, error: {}", jobId, successCount, failCount, errorMessage);
    }

    // ==================== 图片处理辅助方法 ====================

    /**
     * 把本地相对图片地址转换为远程模型可读取的形式。
     * 远程提供商无法访问部署实例上的 /uploads/** 相对路径。
     *
     * <p>优先上传到 GeekNow 对象存储换取公网 URL（异步图片接口只接受 http(s) 素材）；
     * 上传失败时回退为 base64 data URI（此时消费侧会改走同步生成路径）。
     */
    private List<String> prepareReferenceImagesForUpstream(Long jobId, List<String> imageUrls) {
        if (imageUrls == null || imageUrls.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> prepared = new ArrayList<>();
        for (String imageUrl : imageUrls) {
            if (imageUrl == null || imageUrl.isBlank()) {
                continue;
            }
            if (!imageUrl.startsWith("/")) {
                if (!imageUrl.startsWith("blob:")) {
                    prepared.add(imageUrl);
                }
                continue;
            }

            ImageReferenceUploadService.UploadClaim claim = imageReferenceUploadService.claim(jobId, imageUrl);
            if (claim.upload() == null) {
                throw new RetryableAiException("参考图上传状态正在建立，请稍后重试");
            }
            if (ImageReferenceUploadService.SUCCEEDED.equals(claim.upload().getStatus())) {
                prepared.add(claim.upload().getPublicUrl());
                continue;
            }
            if (ImageReferenceUploadService.FAILED.equals(claim.upload().getStatus())) {
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR,
                        "参考图此前上传失败，已停止重试: " + claim.upload().getErrorMessage());
            }
            if (!claim.shouldUpload()) {
                // 另一个分镜消费者正在上传同一文件。只延迟消息，不再发一次 OSS 请求。
                throw new RetryableAiException("同批参考图正在由另一任务上传");
            }

            try (InputStream inputStream = storageService.download(imageUrl)) {
                byte[] imageBytes = inputStream.readAllBytes();
                String contentType = inferReferenceImageContentType(imageUrl);
                String publicUrl = geeknowClient.uploadImageForPublicUrl(
                        imageBytes, referenceFileName(imageUrl), contentType);
                if (publicUrl == null || publicUrl.isBlank()) {
                    throw new IllegalStateException("GeekNow参考图上传未返回public_url");
                }
                imageReferenceUploadService.markSucceeded(claim.upload().getId(), publicUrl);
                prepared.add(publicUrl);
                log.info("本地参考图首次上传GeekNow并写入批次缓存 - jobId: {}, local: {}, publicUrl: {}",
                        jobId, imageUrl, publicUrl);
            } catch (Exception e) {
                imageReferenceUploadService.markFailed(claim.upload().getId(), e.getMessage());
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR,
                        "参考图上传失败，任务已停止且不会重试: " + e.getMessage(), e);
            }
        }
        return prepared;
    }

    /** 从本地存储URL中提取文件名（去掉查询串），用作GeekNow上传的file_name。 */
    private String referenceFileName(String imageUrl) {
        String withoutQuery = imageUrl.split("\\?", 2)[0];
        int lastSlash = withoutQuery.lastIndexOf('/');
        String name = lastSlash >= 0 ? withoutQuery.substring(lastSlash + 1) : withoutQuery;
        return name.isBlank() ? "reference.png" : name;
    }

    private String inferReferenceImageContentType(String imageUrl) {
        String normalized = imageUrl.split("\\?", 2)[0].toLowerCase();
        if (normalized.endsWith(".png")) {
            return "image/png";
        }
        if (normalized.endsWith(".webp")) {
            return "image/webp";
        }
        if (normalized.endsWith(".gif")) {
            return "image/gif";
        }
        return "image/jpeg";
    }

    /**
     * 处理图片并上传到OSS
     *
     * @param imageData 图片数据（base64或URL）
     * @param jobId 任务ID
     * @param index 图片索引
     * @return OSS存储的URL
     */
    private String processImageAndUploadToOss(String imageData, Long jobId, int index) {
        if (isBase64(imageData)) {
            log.debug("检测到base64图片 - index: {}", index);
            return uploadBase64ToOss(imageData, jobId, index);
        }

        if (isUrl(imageData)) {
            log.debug("检测到URL图片 - index: {}, url: {}", index, imageData);
            return downloadAndUploadToOss(imageData, jobId, index);
        }

        throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.PARAM_INVALID, "无法识别的图片数据格式");
    }

    /**
     * 上传base64图片到OSS
     */
    private String uploadBase64ToOss(String base64Data, Long jobId, int index) {
        try {
            String contentType = dataUriContentType(base64Data);
            byte[] imageBytes = Base64.getDecoder().decode(stripDataUriPrefix(base64Data));
            InputStream inputStream = new ByteArrayInputStream(imageBytes);
            String fileName = String.format("ai_image_%d_%d%s", jobId, index, getExtensionFromContentType(contentType));
            String ossUrl = storageService.uploadAsset(inputStream, fileName, contentType);
            log.debug("Base64图片上传成功 - index: {}, ossUrl: {}", index, ossUrl);
            return ossUrl;
        } catch (Exception e) {
            log.error("Base64图片上传失败", e);
            throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.OSS_ERROR, "base64图片上传失败: " + e.getMessage());
        }
    }

    /**
     * 下URL下载图片并上传到OSS
     */
    private String downloadAndUploadToOss(String imageUrl, Long jobId, int index) {
        try {
            URL url = new URL(imageUrl);
            URLConnection connection = url.openConnection();
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(60000);

            String contentType = connection.getContentType();
            if (contentType == null) {
                contentType = "image/jpeg";
            }

            String extension = getExtensionFromContentType(contentType);
            String fileName = String.format("ai_image_%d_%d%s", jobId, index, extension);

            try (InputStream inputStream = connection.getInputStream()) {
                String ossUrl = storageService.uploadAsset(inputStream, fileName, contentType);
                log.debug("URL图片下载并上传成功 - ossUrl: {}", ossUrl);
                return ossUrl;
            }
        } catch (Exception e) {
            log.error("图片下载或上传失败 - url: {}", imageUrl, e);
            throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.OSS_ERROR, "图片下载失败: " + e.getMessage());
        }
    }

    /**
     * 判断是否为base64
     */
    private boolean isBase64(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }
        return data.length() > 100
                && !data.startsWith("http://")
                && !data.startsWith("https://");
    }

    private String stripDataUriPrefix(String data) {
        int comma = data.startsWith("data:") ? data.indexOf(',') : -1;
        return comma >= 0 ? data.substring(comma + 1) : data;
    }

    private String dataUriContentType(String data) {
        if (!data.startsWith("data:")) return "image/png";
        int semicolon = data.indexOf(';');
        return semicolon > 5 ? data.substring(5, semicolon) : "image/png";
    }

    /**
     * 判断是否为URL
     */
    private boolean isUrl(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }
        return data.startsWith("http://") || data.startsWith("https://");
    }

    /**
     * 参考图是否全部为http(s) URL（空列表视为true）。
     * GeekNow异步图片接口不接受base64 data URI参考图，含本地参考图时需回退同步生成。
     */
    private boolean allHttpUrls(List<String> urls) {
        if (urls == null || urls.isEmpty()) {
            return true;
        }
        return urls.stream().allMatch(this::isUrl);
    }

    /**
     * 根据ContentType获取文件扩展名
     */
    private String getExtensionFromContentType(String contentType) {
        if (contentType == null) {
            return ".jpg";
        }
        return switch (contentType.toLowerCase()) {
            case "image/png" -> ".png";
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> ".jpg";
        };
    }

    // ==================== 分镜图生成内嵌规则 ====================

    /**
     * 分镜图生成的内嵌规则前缀
     * 仅约束内容一致性与画面可用性，不强制任何美术风格
     */
    private static final String SHOT_IMAGE_PROMPT_PREFIX = 
            "请根据以下分镜剧本生成单张画面。" +
            "保持参考图中角色、场景和道具的外观一致，构图清晰，" +
            "不要添加字幕、水印或画外文字。分镜剧本：";

    /**
     * 构建分镜图生成的完整提示词
     * 
     * @param scriptText 分镜剧本文本
     * @return 带风格前缀的完整提示词
     */
    private String buildShotImagePrompt(String scriptText) {
        return SHOT_IMAGE_PROMPT_PREFIX + scriptText;
    }

    // ==================== 分镜绑定角色图片查询 ====================

    /**
     * 获取分镜绑定的角色图片URL列表
     * 
     * <p>查询逻辑：
     * <ol>
     *   <li>查询shot_bindings表，找到shot_id=分镜ID且bind_type=PCHAR的记录</li>
     *   <li>获取项目角色的缩略图URL</li>
     *   <li>如果项目角色没有缩略图，查询角色库的缩略图</li>
     *   <li>如果仍无缩略图，查询角色的资产版本</li>
     * </ol>
     * 
     * @param shotId 分镜ID
     * @return 角色图片URL列表
     */
    /** 角色姓名与其参考图URL的配对；用于在视频prompt中显式标注"第几张参考图对应哪个角色"。 */
    private record CharacterReference(String name, String url) {}

    /** 兼容旧调用方(分镜图生成参考图)：只要URL列表，不需要姓名。 */
    private List<String> getBoundCharacterImages(Long shotId) {
        return getBoundCharacterReferences(shotId).stream().map(CharacterReference::url).toList();
    }

    /**
     * 按分镜绑定顺序解析人物参考图（姓名 + URL）。
     *
     * <p>优先级：项目角色缩略图 &gt; 角色库缩略图 &gt; 角色资产；每一级都会校验URL有效性
     * ({@link #isValidReferenceUrl})，不会把占位图(如 via.placeholder.com)当成"已有参考图"
     * 误发给上游——之前的实现只判断非空，占位图会被当作真实参考图直接发出去，导致人物样貌
     * 与实际角色对不上。某个角色三级都拿不到有效图时会跳过并打警告日志，而不是塞一张假图。
     */
    private List<CharacterReference> getBoundCharacterReferences(Long shotId) {
        List<CharacterReference> references = new java.util.ArrayList<>();

        try {
            // 1. 查询分镜绑定的角色（bind_type=PCHAR）
            var bindingQuery = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShotBinding>();
            bindingQuery.eq(ShotBinding::getShotId, shotId)
                       .eq(ShotBinding::getBindType, "PCHAR");
            List<ShotBinding> bindings = shotBindingMapper.selectList(bindingQuery);

            if (bindings.isEmpty()) {
                log.debug("分镜未绑定角色 - shotId: {}", shotId);
                return references;
            }

            // 2. 获取项目角色ID列表
            List<Long> characterIds = bindings.stream()
                    .map(ShotBinding::getBindId)
                    .collect(java.util.stream.Collectors.toList());

            // 3. 批量查询项目角色
            List<ProjectCharacter> characters = projectCharacterMapper.selectBatchIds(characterIds);

            // 4. 获取关联的角色库ID，用于查询库缩略图
            List<Long> libraryCharacterIds = characters.stream()
                    .map(ProjectCharacter::getLibraryCharacterId)
                    .filter(id -> id != null)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());

            Map<Long, String> libraryThumbnailMap = new java.util.HashMap<>();
            if (!libraryCharacterIds.isEmpty()) {
                List<CharacterLibrary> libraryCharacters = characterLibraryMapper.selectBatchIds(libraryCharacterIds);
                libraryThumbnailMap = libraryCharacters.stream()
                        .filter(c -> isValidReferenceUrl(c.getThumbnailUrl()))
                        .collect(java.util.stream.Collectors.toMap(CharacterLibrary::getId, CharacterLibrary::getThumbnailUrl));
            }

            // 5. 遍历每个角色，获取图片URL（每一级都校验有效性，不把占位图当真实参考图）
            for (ProjectCharacter character : characters) {
                String thumbnailUrl = null;
                String characterName = character.getDisplayName() != null
                        ? character.getDisplayName() : ("角色" + character.getId());

                // 优先级：项目角色缩略图 > 角色库缩略图 > 角色资产
                if (isValidReferenceUrl(character.getThumbnailUrl())) {
                    thumbnailUrl = character.getThumbnailUrl();
                    log.debug("使用项目角色缩略图 - characterId: {}, url: {}", character.getId(), thumbnailUrl);
                } else if (character.getLibraryCharacterId() != null) {
                    String libraryThumbnail = libraryThumbnailMap.get(character.getLibraryCharacterId());
                    if (isValidReferenceUrl(libraryThumbnail)) {
                        thumbnailUrl = libraryThumbnail;
                        log.debug("使用角色库缩略图 - characterId: {}, libraryId: {}, url: {}",
                                character.getId(), character.getLibraryCharacterId(), thumbnailUrl);
                    }
                }

                // 如果还没有有效缩略图，查询角色资产
                if (thumbnailUrl == null) {
                    String assetUrl = getCharacterAssetUrl(character.getId());
                    if (isValidReferenceUrl(assetUrl)) {
                        thumbnailUrl = assetUrl;
                        log.debug("使用角色资产 - characterId: {}, url: {}", character.getId(), thumbnailUrl);
                    }
                }

                if (thumbnailUrl != null) {
                    references.add(new CharacterReference(characterName, thumbnailUrl));
                } else {
                    log.warn("角色缺少有效参考图(缩略图/角色库/角色资产均为空或占位图)，视频/分镜图生成时将不携带该角色的参考图 - "
                            + "shotId: {}, characterId: {}, name: {}", shotId, character.getId(), characterName);
                }
            }

            log.info("获取分镜绑定角色图片完成 - shotId: {}, characterCount: {}, imageCount: {}",
                    shotId, characters.size(), references.size());

        } catch (Exception e) {
            log.error("获取分镜绑定角色图片失败 - shotId: {}", shotId, e);
        }

        return references;
    }
    
    /**
     * 获取角色的资产图URL
     * 
     * @param characterId 项目角色ID
     * @return 资产图URL，不存在返回null
     */
    private String getCharacterAssetUrl(Long characterId) {
        try {
            // 查询角色的图片资产
            var assetQuery = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<com.ym.ai_story_studio_server.entity.Asset>();
            assetQuery.eq(com.ym.ai_story_studio_server.entity.Asset::getOwnerType, "PCHAR")
                     .eq(com.ym.ai_story_studio_server.entity.Asset::getOwnerId, characterId)
                     .eq(com.ym.ai_story_studio_server.entity.Asset::getAssetType, "CHAR_IMG")
                     .orderByDesc(com.ym.ai_story_studio_server.entity.Asset::getCreatedAt)
                     .last("LIMIT 1");
            
            var asset = assetMapper.selectOne(assetQuery);
            if (asset == null) {
                return null;
            }
            
            // 查询资产的最新版本
            var versionQuery = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AssetVersion>();
            versionQuery.eq(AssetVersion::getAssetId, asset.getId())
                       .eq(AssetVersion::getStatus, "READY")
                       .orderByDesc(AssetVersion::getVersionNo)
                       .last("LIMIT 1");
            
            AssetVersion version = assetVersionMapper.selectOne(versionQuery);
            return version != null ? version.getUrl() : null;
            
        } catch (Exception e) {
            log.error("查询角色资产失败 - characterId: {}", characterId, e);
            return null;
        }
    }
}
