package com.ym.ai_story_studio_server.mq;

import com.ym.ai_story_studio_server.workbench.MediaPromptSnapshots;
import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.ym.ai_story_studio_server.provider.ImageGenerationResult;
import com.ym.ai_story_studio_server.provider.ImageTaskResult;
import com.ym.ai_story_studio_server.provider.VideoGenerationProvider;
import com.ym.ai_story_studio_server.provider.VideoTaskResult;
import com.rabbitmq.client.Channel;

import com.ym.ai_story_studio_server.dto.ai.VideoGenerateRequest;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.exception.RetryableAiException;
import com.ym.ai_story_studio_server.entity.CharacterLibrary;
import com.ym.ai_story_studio_server.entity.ProjectCharacter;
import com.ym.ai_story_studio_server.entity.ProjectScene;
import com.ym.ai_story_studio_server.entity.PropLibrary;
import com.ym.ai_story_studio_server.entity.ProjectProp;
import com.ym.ai_story_studio_server.entity.SceneLibrary;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.CharacterLibraryMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.ProjectCharacterMapper;
import com.ym.ai_story_studio_server.mapper.ProjectSceneMapper;
import com.ym.ai_story_studio_server.mapper.PropLibraryMapper;
import com.ym.ai_story_studio_server.mapper.ProjectPropMapper;
import com.ym.ai_story_studio_server.mapper.SceneLibraryMapper;
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
    private final MediaPromptSnapshots mediaPrompts;

    private final ImageGenerationProvider imageProvider;
    private final VideoGenerationProvider videoProvider;
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
    private final JobMapper jobMapper;
    private final AssetMapper assetMapper;
    private final StoryboardShotMapper storyboardShotMapper;
    private final ProjectCharacterMapper projectCharacterMapper;
    private final CharacterLibraryMapper characterLibraryMapper;
    private final ProjectSceneMapper projectSceneMapper;
    private final PropLibraryMapper propLibraryMapper;
    private final ProjectPropMapper projectPropMapper;
    private final SceneLibraryMapper sceneLibraryMapper;
    private final ObjectMapper objectMapper;

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
        var accepted = mediaPrompts.load(jobId, shotId);
        String finalModel = accepted.model();
        String finalAspectRatio = imageProvider.validateImageConfiguration(finalModel, accepted.aspectRatio());
        List<String> referenceImageUrls = prepareReferenceImagesForUpstream(jobId, accepted.referenceUrls());

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
            String prompt = accepted.prompt();
    
            // 日志中不显示完整的内嵌提示词，只显示用户自定义部分
            String logPrompt = customPrompt != null ? "[自定义内容]" : prompt;
            log.info("提交异步图片任务 - shotId: {}, prompt: {}, referenceImageUrls: {}", shotId, logPrompt,
                    referenceImageUrls != null ? referenceImageUrls.size() : 0);

            AsyncImageTaskService.ImageTaskContext taskContext =
                    new AsyncImageTaskService.ImageTaskContext(
                            jobId, projectId, shotId, prompt, finalModel, finalAspectRatio, userId, 0);

            if (allHttpUrls(referenceImageUrls) && imageProvider.supportsAsyncImageTask(finalModel)) {
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

                // 4. 提交图片供应商异步图片任务，拿到taskId后立即释放消费线程
                ImageTaskResult submitResponse;
                try {
                    submitResponse = imageProvider.submitImageTask(
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
                    throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "图片供应商未返回图片任务ID");
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

        var accepted = mediaPrompts.load(jobId, shotIds.get(0));
        String finalModel = accepted.model();
        String finalAspectRatio = imageProvider.validateImageConfiguration(finalModel, accepted.aspectRatio());
        countPerItem = ((Number) accepted.parameters().get("countPerItem")).intValue();
        mode = (String) accepted.parameters().get("mode");

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

                    String prompt = mediaPrompts.load(jobId, shotId).prompt();

                // 查询分镜绑定的角色图片作为参考图
                List<String> referenceImageUrls = prepareReferenceImagesForUpstream(
                        jobId, mediaPrompts.load(jobId, shotId).referenceUrls());
                log.info("分镜绑定的角色图片数量 - shotId: {}, count: {}", shotId, referenceImageUrls.size());

                if (allHttpUrls(referenceImageUrls) && imageProvider.supportsAsyncImageTask(finalModel)) {
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
                        ImageTaskResult submitResponse;
                        try {
                            submitResponse = imageProvider.submitImageTask(
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
                            throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR, "图片供应商未返回图片任务ID");
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

        var accepted = mediaPrompts.load(jobId, shotIds.get(0));
        String finalAspectRatio = accepted.aspectRatio();
        String finalModel = accepted.model();
        Integer finalDuration = accepted.duration();
        videoProvider.validateVideoModel(finalModel);

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

                var snapshot = mediaPrompts.load(jobId, shotId);
                List<String> referenceImageUrls = snapshot.referenceUrls();
                String prompt = snapshot.prompt();

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
        var accepted = mediaPrompts.load(jobId, shotId);
        String finalAspectRatio = accepted.aspectRatio();
        String finalModel = accepted.model();
        Integer finalDuration = accepted.duration();
        size = accepted.size();
        videoProvider.validateVideoModel(finalModel);

        log.info("应用配置 - aspectRatio: {}, model: {}, duration: {}, size: {}", finalAspectRatio, finalModel, finalDuration, size);

        try {
            // 1. 查询分镜
            var shot = storyboardShotMapper.selectById(shotId);
            if (shot == null) {
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.SHOT_NOT_FOUND);
            }

            List<String> referenceImageUrls = accepted.referenceUrls();
            String finalPrompt = accepted.prompt();

            log.info("调用AI生成视频 - shotId: {}, promptLength: {}, referenceImageCount: {}",
                    shotId, finalPrompt.length(), referenceImageUrls.size());

            UserContext.setUserId(userId);
            try {
                VideoTaskResult apiResponse = videoProvider.createVideo(
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

    private void executeBatchCharacterImageGeneration(BatchTaskMessage msg) {
        Long jobId = msg.getJobId();
        List<Long> characterIds = msg.getTargetIds(); // 这是 project_character 的 ID
        Long userId = msg.getUserId();
        Long projectId = msg.getProjectId();

        log.info("执行批量角色画像生成 - jobId: {}, characterCount: {}", jobId, characterIds.size());
        updateJobRunning(jobId);

        var accepted = mediaPrompts.load(jobId, characterIds.get(0));
        String finalAspectRatio = accepted.aspectRatio();
        String finalModel = accepted.model();
        imageProvider.validateImageConfiguration(finalModel, finalAspectRatio);

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
                if ("MISSING".equals(accepted.parameters().get("mode")) && existingThumbnail != null && !existingThumbnail.isEmpty()) {
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
                String prompt = mediaPrompts.load(jobId, projectCharacterId).prompt();

                log.info("生成角色图片 - projectCharacterId: {}, name: {}, prompt: {}", projectCharacterId, characterName, prompt);

                // 5. 调用 图片供应商 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageGenerationResult response = imageProvider.generateImage(
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
                    List<ImageGenerationResult.ImageData> allResults = response.data();
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

        var accepted = mediaPrompts.load(jobId, sceneIds.get(0));
        String finalAspectRatio = accepted.aspectRatio();
        String finalModel = accepted.model();
        imageProvider.validateImageConfiguration(finalModel, finalAspectRatio);

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
                if ("MISSING".equals(accepted.parameters().get("mode")) && existingThumbnail != null) {
                    log.info("MISSING模式 - 场景已有图片,跳过 - projectSceneId: {}", projectSceneId);
                    successCount.incrementAndGet();
                    continue;
                }

                // 5. 构建提示词：使用场景描述生成场景图
                String prompt = mediaPrompts.load(jobId, projectSceneId).prompt();

                log.info("生成场景图片 - projectSceneId: {}, name: {}, prompt: {}", projectSceneId, sceneName, prompt);

                // 6. 调用 图片供应商 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageGenerationResult response = imageProvider.generateImage(
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
                    ImageGenerationResult.ImageData firstResult = response.data().get(0);
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

        var accepted = mediaPrompts.load(jobId, propIds.get(0));
        String finalAspectRatio = accepted.aspectRatio();
        String finalModel = accepted.model();
        imageProvider.validateImageConfiguration(finalModel, finalAspectRatio);

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
                if ("MISSING".equals(accepted.parameters().get("mode")) && existingThumbnail != null && !existingThumbnail.isBlank()) {
                    log.info("MISSING模式 - 道具已有图片,跳过 - projectPropId: {}", projectPropId);
                    successCount.incrementAndGet();
                    continue;
                }

                // 4. 构建提示词：使用道具描述生成道具图
                String description = projectProp.getOverrideDescription() != null ?
                        projectProp.getOverrideDescription() : (prop != null ? prop.getDescription() : null);
                String propName = projectProp.getDisplayName() != null ?
                        projectProp.getDisplayName() : (prop != null ? prop.getName() : "道具");
                String prompt = mediaPrompts.load(jobId, projectPropId).prompt();

                log.info("生成道具图片 - projectPropId: {}, name: {}, prompt: {}", projectPropId, propName, prompt);

                // 5. 调用 图片供应商 生成图片
                UserContext.setUserId(userId);
                try {
                    ImageGenerationResult response = imageProvider.generateImage(
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
                    List<ImageGenerationResult.ImageData> allResults = response.data();
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
     * <p>优先上传到 图片供应商 对象存储换取公网 URL（异步图片接口只接受 http(s) 素材）；
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
                String publicUrl = imageProvider.uploadReferenceImage(
                        imageBytes, referenceFileName(imageUrl), contentType);
                if (publicUrl == null || publicUrl.isBlank()) {
                    throw new IllegalStateException("图片供应商参考图上传未返回public_url");
                }
                imageReferenceUploadService.markSucceeded(claim.upload().getId(), publicUrl);
                prepared.add(publicUrl);
                log.info("本地参考图首次上传图片供应商并写入批次缓存 - jobId: {}, local: {}, publicUrl: {}",
                        jobId, imageUrl, publicUrl);
            } catch (Exception e) {
                imageReferenceUploadService.markFailed(claim.upload().getId(), e.getMessage());
                throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.AI_SERVICE_ERROR,
                        "参考图上传失败，任务已停止且不会重试: " + e.getMessage(), e);
            }
        }
        return prepared;
    }

    /** 从本地存储URL中提取文件名（去掉查询串），用作图片供应商上传的file_name。 */
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
     * 图片供应商异步图片接口不接受base64 data URI参考图，含本地参考图时需回退同步生成。
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

}
