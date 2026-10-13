package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.client.GeeknowClient;
import com.ym.ai_story_studio_server.client.ImageGenerationRouter;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.util.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 异步图片任务处理服务
 *
 * <p>图片结果持久化服务。新链路由 RabbitMQ 的提交消费者与单次轮询消费者驱动，
 * 本服务只负责将已完成的上游结果幂等地落为资产；旧接口保留用于兼容历史调用。
 *
 * <p><strong>状态落地:</strong>
 * <ul>
 *   <li>每个分镜对应一条 {@link JobItem}（由 BatchGenerationService 创建）</li>
 *   <li>新任务状态持久化在 image_generation_tasks 中，服务重启后由 RabbitMQ 恢复</li>
 *   <li>子项终态时聚合父 Job（进度/终态/allImageUrls），前端轮询父 Job 即可</li>
 * </ul>
 *
 * <p><strong>扣费语义:</strong> 与现状一致——成功后扣、失败不扣不退。
 * 异步线程无法读取主线程 ThreadLocal，userId 通过上下文显式传递。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncImageTaskService {

    /** 连续查询失败达到该次数后放弃任务，避免硬错误反复重试。 */
    private static final int MAX_CONSECUTIVE_QUERY_FAILURES = 10;

    private final GeeknowClient geeknowClient;
    private final ImageGenerationRouter imageGenerationRouter;
    private final ChargingService chargingService;
    private final StorageService storageService;
    private final JobMapper jobMapper;
    private final JobItemMapper jobItemMapper;
    private final AssetCreationService assetCreationService;
    private final AiProperties aiProperties;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<AsyncImageTaskService> selfProvider;
    private final ImageGenerationTaskService imageGenerationTaskService;

    /** Context needed to attach a completed image to a shot and aggregate the parent job. */
    public record ImageTaskContext(
            Long parentJobId,
            Long projectId,
            Long shotId,
            String prompt,
            String model,
            String aspectRatio,
            Long userId,
            int imageIndex
    ) {}

    /**
     * 服务启动时恢复中断的图片生成任务
     *
     * <p>只恢复已经拿到 apiTaskId 的子项；尚未提交上游的子项留给 MQ 重投递处理，
     * 避免把还没被消费的正常任务误标失败。
     */
    public void recoverPendingImageTasks() {
        try {
            List<Job> pendingJobs = jobMapper.selectList(
                    new LambdaQueryWrapper<Job>()
                            .in(Job::getStatus, "PENDING", "RUNNING")
                            .eq(Job::getJobType, "BATCH_GEN_SHOT_IMG")
            );

            if (pendingJobs.isEmpty()) {
                log.info("服务启动: 没有需要恢复的图片生成任务");
                return;
            }

            int recovered = 0;
            for (Job job : pendingJobs) {
                List<JobItem> items = jobItemMapper.selectList(
                        new LambdaQueryWrapper<JobItem>().eq(JobItem::getJobId, job.getId())
                );
                for (JobItem item : items) {
                    if (isTerminal(item.getStatus())) {
                        continue;
                    }
                    JsonNode input = readInputJson(item.getInputJson());
                    List<String> apiTaskIds = readApiTaskIds(input);
                    if (apiTaskIds.isEmpty()) {
                        if ("RUNNING".equals(item.getStatus())) {
                            // RUNNING但没有上游taskId = 同步回退路径(本地参考图)被重启中断，无法恢复
                            markItemFailed(job.getId(), item.getTargetId(), "服务重启导致图片生成中断，请重新生成");
                        }
                        // PENDING：消息尚未消费或将由 MQ 重投递，留给消费者处理
                        continue;
                    }
                    String prompt = textField(input, "prompt");
                    String model = textField(input, "model");
                    String aspectRatio = textField(input, "aspectRatio");
                    int index = 0;
                    for (String apiTaskId : apiTaskIds) {
                        log.info("恢复图片生成任务轮询 - jobId: {}, shotId: {}, apiTaskId: {}",
                                job.getId(), item.getTargetId(), apiTaskId);
                        selfProvider.getObject().pollImageGenerationTask(apiTaskId, new ImageTaskContext(
                                job.getId(),
                                job.getProjectId(),
                                item.getTargetId(),
                                prompt,
                                model != null ? model : aiProperties.getImage().getDefaultModel(),
                                aspectRatio != null ? aspectRatio : aiProperties.getImage().getDefaultAspectRatio(),
                                job.getUserId(),
                                index++
                        ));
                        recovered++;
                    }
                }
            }
            log.info("服务启动: 图片生成任务恢复完成 - 恢复轮询数: {}", recovered);

        } catch (Exception e) {
            log.error("服务启动: 恢复图片生成任务失败", e);
        }
    }

    /**
     * 轮询图片生成任务(异步方法)
     *
     * <p>在后台线程中定期查询 GeekNow 异步图片任务状态，直到成功、失败或超时。
     * 成功路径：下载/解码图片 → 上传OSS → 写入资产 → 扣费 → 子项SUCCEEDED → 聚合父Job。
     */
    @Async("taskExecutor")
    public void pollImageGenerationTask(String apiTaskId, ImageTaskContext ctx) {
        log.info("图片异步轮询启动 - jobId: {}, shotId: {}, apiTaskId: {}, 线程: {}",
                ctx.parentJobId(), ctx.shotId(), apiTaskId, Thread.currentThread().getName());

        AiProperties.Image imageConfig = aiProperties.getImage();
        long pollInterval = imageConfig.getPollInterval();
        int maxPollCount = imageConfig.getMaxPollCount();

        int pollCount = 0;
        int consecutiveQueryFailures = 0;
        boolean terminalHandled = false;

        try {
            while (pollCount < maxPollCount) {
                pollCount++;
                Thread.sleep(pollInterval);

                // 每轮只查一次；单次失败不终止任务，连续失败过多则止损，
                // 避免解析类硬错误反复重试打爆上游。
                GeeknowClient.ImageTaskApiResponse statusResponse;
                try {
                    statusResponse = geeknowClient.queryImageTask(apiTaskId);
                    consecutiveQueryFailures = 0;
                } catch (Exception e) {
                    consecutiveQueryFailures++;
                    log.warn("图片任务查询失败 - jobId: {}, apiTaskId: {}, 连续失败: {}/{}, 错误: {}",
                            ctx.parentJobId(), apiTaskId, consecutiveQueryFailures,
                            MAX_CONSECUTIVE_QUERY_FAILURES, e.getMessage());
                    if (consecutiveQueryFailures >= MAX_CONSECUTIVE_QUERY_FAILURES) {
                        handleImageTaskFailure(ctx, "图片任务查询连续失败: " + e.getMessage());
                        terminalHandled = true;
                        break;
                    }
                    continue;
                }

                Job parent = jobMapper.selectById(ctx.parentJobId());
                if (parent == null) {
                    log.error("父任务不存在,停止图片轮询 - jobId: {}", ctx.parentJobId());
                    terminalHandled = true;
                    break;
                }
                if ("CANCELED".equals(parent.getStatus())) {
                    log.info("父任务已取消,停止图片轮询 - jobId: {}", ctx.parentJobId());
                    terminalHandled = true;
                    break;
                }

                String status = statusResponse.status();
                if ("completed".equalsIgnoreCase(status)
                        || "succeeded".equalsIgnoreCase(status)
                        || "success".equalsIgnoreCase(status)) {
                    handleImageTaskSuccess(apiTaskId, statusResponse, ctx);
                    terminalHandled = true;
                    break;
                } else if ("error".equalsIgnoreCase(status)
                        || "failed".equalsIgnoreCase(status)
                        || "failure".equalsIgnoreCase(status)
                        || "cancelled".equalsIgnoreCase(status)
                        || "canceled".equalsIgnoreCase(status)) {
                    String providerMessage = statusResponse.errorMessage();
                    handleImageTaskFailure(ctx, providerMessage != null && !providerMessage.isBlank()
                            ? providerMessage
                            : "图片生成失败(status: " + status + ")");
                    terminalHandled = true;
                    break;
                }
                // 非终态：继续轮询。子项在提交时已标记 RUNNING，进度由聚合计算。
            }

            if (!terminalHandled && pollCount >= maxPollCount) {
                log.warn("图片轮询超时 - jobId: {}, apiTaskId: {}, 已轮询{}次",
                        ctx.parentJobId(), apiTaskId, pollCount);
                handleImageTaskFailure(ctx, "图片生成超时(API响应超过预期时间)");
            }

        } catch (InterruptedException e) {
            log.error("图片轮询被中断 - jobId: {}, apiTaskId: {}", ctx.parentJobId(), apiTaskId, e);
            Thread.currentThread().interrupt();
            handleImageTaskFailure(ctx, "任务被中断");
        } catch (Exception e) {
            log.error("图片轮询失败 - jobId: {}, apiTaskId: {}", ctx.parentJobId(), apiTaskId, e);
            handleImageTaskFailure(ctx, "轮询任务失败: " + e.getMessage());
        }

        log.info("图片异步轮询结束 - jobId: {}, shotId: {}, apiTaskId: {}, 总轮询次数: {}",
                ctx.parentJobId(), ctx.shotId(), apiTaskId, pollCount);
    }

    /**
     * 同步生成图片(异步线程中执行)
     *
     * <p>GeekNow 异步图片接口只接受 http(s) 参考图 URL；当参考图是本地文件转出的
     * base64 data URI 时无法走异步接口，退回同步 {@code generateImage}——但放在
     * 异步线程池里执行，消费线程照样立即释放，批量并行度不受影响。
     * 代价：此路径没有上游 taskId，服务重启后无法恢复（恢复逻辑会将其标记失败）。
     */
    @Async("taskExecutor")
    public void generateImageSynchronously(List<String> referenceImageUrls, ImageTaskContext ctx) {
        generateImageSynchronouslyBlocking(referenceImageUrls, ctx);
    }

    /**
     * Rabbit 消费者使用的阻塞版同步回退。只有资产真正落库后方可 ack，
     * 因此这里不能再跳到本机异步线程池。
     */
    public void generateImageSynchronouslyBlocking(List<String> referenceImageUrls, ImageTaskContext ctx) {
        log.info("图片同步生成(异步线程)启动 - jobId: {}, shotId: {}, 参考图: {}, 线程: {}",
                ctx.parentJobId(), ctx.shotId(),
                referenceImageUrls != null ? referenceImageUrls.size() : 0,
                Thread.currentThread().getName());
        try {
            GeeknowClient.ImageApiResponse apiResponse = imageGenerationRouter.generateImage(
                    ctx.prompt(),
                    ctx.model(),
                    ctx.aspectRatio(),
                    referenceImageUrls
            );
            if (apiResponse == null || apiResponse.data() == null || apiResponse.data().isEmpty()) {
                handleImageTaskFailure(ctx, "AI返回空响应");
                return;
            }
            completeWithImageData(apiResponse.data().get(0).url(), null, ctx);
        } catch (Exception e) {
            log.error("图片同步生成失败 - jobId: {}, shotId: {}", ctx.parentJobId(), ctx.shotId(), e);
            handleImageTaskFailure(ctx, e.getMessage() != null ? e.getMessage() : "图片生成失败");
        }
    }

    /**
     * 记录已提交的上游任务：apiTaskId 等写入子项 inputJson（重启恢复依据），子项标记 RUNNING。
     */
    public void recordSubmittedTasks(
            Long parentJobId,
            Long shotId,
            List<String> apiTaskIds,
            String prompt,
            String model,
            String aspectRatio
    ) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null) {
            return;
        }
        try {
            Map<String, Object> input = new HashMap<>();
            input.put("apiTaskIds", apiTaskIds);
            input.put("prompt", prompt);
            input.put("model", model);
            input.put("aspectRatio", aspectRatio);
            item.setInputJson(objectMapper.writeValueAsString(input));
        } catch (Exception e) {
            log.error("序列化图片子项inputJson失败 - jobId: {}, shotId: {}", parentJobId, shotId, e);
        }
        item.setStatus("RUNNING");
        if (item.getStartedAt() == null) {
            item.setStartedAt(java.time.LocalDateTime.now());
        }
        jobItemMapper.updateById(item);
    }

    /**
     * MQ 消息重投递幂等判断：子项已终态、或已提交过上游任务时跳过重新提交。
     */
    public boolean isAlreadySubmittedOrTerminal(Long parentJobId, Long shotId) {
        JobItem item = jobItemMapper.selectOne(
                new LambdaQueryWrapper<JobItem>()
                        .eq(JobItem::getJobId, parentJobId)
                        .eq(JobItem::getTargetType, "SHOT")
                        .eq(JobItem::getTargetId, shotId)
                        .last("LIMIT 1")
        );
        if (item == null) {
            return false;
        }
        if (isTerminal(item.getStatus())) {
            return true;
        }
        return !readApiTaskIds(readInputJson(item.getInputJson())).isEmpty();
    }

    /** 同步回退路径开始执行前标记子项 RUNNING（无上游taskId，重启后由恢复逻辑标失败）。 */
    public synchronized void markItemRunning(Long parentJobId, Long shotId) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("RUNNING");
        if (item.getStartedAt() == null) {
            item.setStartedAt(java.time.LocalDateTime.now());
        }
        jobItemMapper.updateById(item);
    }

    public synchronized void markItemSucceeded(Long parentJobId, Long shotId, String resultUrl) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("SUCCEEDED");
        item.setFinishedAt(java.time.LocalDateTime.now());
        if (resultUrl != null) {
            appendResultUrl(item, resultUrl);
        }
        jobItemMapper.updateById(item);
        refreshParentAggregate(parentJobId, resultUrl);
    }

    public synchronized void markItemFailed(Long parentJobId, Long shotId, String errorMessage) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("FAILED");
        item.setErrorMessage(errorMessage);
        item.setFinishedAt(java.time.LocalDateTime.now());
        jobItemMapper.updateById(item);
        refreshParentAggregate(parentJobId, null);
    }

    // ==================== 成功/失败处理 ====================

    private void handleImageTaskSuccess(
            String apiTaskId,
            GeeknowClient.ImageTaskApiResponse statusResponse,
            ImageTaskContext ctx
    ) {
        List<GeeknowClient.ImageApiResponse.ImageData> images =
                statusResponse.toImageResponse().data();
        if (images.isEmpty()) {
            handleImageTaskFailure(ctx, "图片生成完成但未返回图片数据");
            return;
        }
        completeWithImageData(images.get(0).url(), apiTaskId, ctx);
    }

    /**
     * Rabbit 轮询消费者的成功收尾入口。与旧的本机 while-loop 不同，
     * 终态写入 image_generation_tasks，再由其聚合 JobItem/Job。
     */
    public void completeQueuedImageTask(
            Long generationTaskId,
            GeeknowClient.ImageTaskApiResponse statusResponse
    ) {
        ImageGenerationTask task = imageGenerationTaskService.get(generationTaskId);
        if (task == null || imageGenerationTaskService.isTerminal(task.getStatus())) {
            return;
        }
        List<GeeknowClient.ImageApiResponse.ImageData> images = statusResponse.toImageResponse().data();
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "图片生成完成但未返回图片数据");
        }
        ImageTaskContext ctx = new ImageTaskContext(
                task.getJobId(),
                task.getProjectId(),
                task.getShotId(),
                task.getPrompt(),
                task.getModel(),
                task.getAspectRatio(),
                task.getUserId(),
                task.getTaskIndex()
        );
        String resultUrl = persistImageResult(
                images.get(0).url(), task.getProviderTaskId(), ctx
        );
        imageGenerationTaskService.markSucceeded(generationTaskId, resultUrl);
        log.info("Rabbit图片任务收尾完成 - generationTaskId: {}, providerTaskId: {}, url: {}",
                generationTaskId, task.getProviderTaskId(), resultUrl);
    }

    /** 生成结果统一收尾：上传OSS → 资产落库 → 扣费 → 子项SUCCEEDED → 聚合父Job。 */
    private void completeWithImageData(String imageData, String apiTaskId, ImageTaskContext ctx) {
        try {
            String ossUrl = persistImageResult(imageData, apiTaskId, ctx);
            markItemSucceeded(ctx.parentJobId(), ctx.shotId(), ossUrl);
            log.info("图片生成成功处理完成 - jobId: {}, shotId: {}", ctx.parentJobId(), ctx.shotId());

        } catch (Exception e) {
            log.error("图片生成成功处理失败 - jobId: {}, shotId: {}", ctx.parentJobId(), ctx.shotId(), e);
            handleImageTaskFailure(ctx, "图片处理失败: " + e.getMessage());
        }
    }

    /** 统一的图片持久化/资产/计费步骤，返回本地资产URL。 */
    private String persistImageResult(String imageData, String apiTaskId, ImageTaskContext ctx) {
        String existingUrl = assetCreationService.findResultUrlBySourceTaskId(apiTaskId);
        if (existingUrl != null && !existingUrl.isBlank()) {
            log.info("图片任务资产已落库，跳过重复下载/计费 - apiTaskId: {}, url: {}",
                    apiTaskId, existingUrl);
            return existingUrl;
        }
        String ossUrl = processImageAndUploadToOss(imageData, ctx.parentJobId(), ctx.imageIndex());
        log.info("图片上传OSS成功 - jobId: {}, shotId: {}, ossUrl: {}",
                ctx.parentJobId(), ctx.shotId(), ossUrl);

        assetCreationService.createAssetWithVersion(
                ctx.projectId(),
                "SHOT",
                ctx.shotId(),
                "SHOT_IMG",
                ossUrl,
                ctx.prompt(),
                ctx.model(),
                ctx.aspectRatio(),
                ctx.userId(),
                apiTaskId
        );

        Map<String, Object> metaData = new HashMap<>();
        metaData.put("model", ctx.model());
        metaData.put("aspectRatio", ctx.aspectRatio());
        metaData.put("imageUrl", ossUrl);
        metaData.put("shotId", ctx.shotId());
        if (apiTaskId != null) {
            metaData.put("apiTaskId", apiTaskId);
        }

        UserContext.setUserId(ctx.userId());
        try {
            chargingService.charge(
                    ChargingService.ChargingRequest.builder()
                            .jobId(ctx.parentJobId())
                            .bizType("IMAGE_GENERATION")
                            .modelCode(ctx.model())
                            .quantity(1)
                            .metaData(metaData)
                            .build()
            );
        } finally {
            UserContext.clear();
        }
        return ossUrl;
    }

    private void handleImageTaskFailure(ImageTaskContext ctx, String errorMessage) {
        log.error("图片生成失败 - jobId: {}, shotId: {}, 错误: {}",
                ctx.parentJobId(), ctx.shotId(), errorMessage);
        markItemFailed(ctx.parentJobId(), ctx.shotId(), errorMessage);
    }

    // ==================== 父Job聚合 ====================

    private JobItem findParentItem(Long parentJobId, Long shotId) {
        JobItem item = jobItemMapper.selectOne(
                new LambdaQueryWrapper<JobItem>()
                        .eq(JobItem::getJobId, parentJobId)
                        .eq(JobItem::getTargetType, "SHOT")
                        .eq(JobItem::getTargetId, shotId)
                        .last("LIMIT 1")
        );
        if (item == null) {
            log.error("图片任务子项不存在 - parentJobId: {}, shotId: {}", parentJobId, shotId);
        }
        return item;
    }

    private void refreshParentAggregate(Long parentJobId, String resultUrl) {
        List<JobItem> items = jobItemMapper.selectList(
                new LambdaQueryWrapper<JobItem>().eq(JobItem::getJobId, parentJobId)
        );
        Job parent = jobMapper.selectById(parentJobId);
        if (parent == null || items.isEmpty()) {
            return;
        }

        long done = items.stream().filter(item -> isTerminal(item.getStatus())).count();
        long succeeded = items.stream().filter(item -> "SUCCEEDED".equals(item.getStatus())).count();
        long failed = items.stream().filter(item -> "FAILED".equals(item.getStatus())).count();
        parent.setDoneItems((int) done);
        parent.setProgress((int) Math.round(done * 100.0 / items.size()));
        if (resultUrl != null && parent.getResultUrl() == null) {
            parent.setResultUrl(resultUrl);
        }

        if (done == items.size()) {
            parent.setStatus(succeeded > 0 ? "SUCCEEDED" : "FAILED");
            parent.setProgress(100);
            parent.setFinishedAt(java.time.LocalDateTime.now());

            List<String> allImageUrls = new ArrayList<>();
            for (JobItem item : items) {
                allImageUrls.addAll(readResultUrls(readInputJson(item.getInputJson())));
            }
            if (!allImageUrls.isEmpty() && parent.getResultUrl() == null) {
                parent.setResultUrl(allImageUrls.get(0));
            }
            try {
                Map<String, Object> metaData = new HashMap<>();
                metaData.put("successCount", succeeded);
                metaData.put("failCount", failed);
                metaData.put("allImageUrls", allImageUrls);
                metaData.put("imageCount", allImageUrls.size());
                parent.setMetaJson(objectMapper.writeValueAsString(metaData));
            } catch (Exception e) {
                log.error("序列化图片父Job metaJson失败 - jobId: {}", parentJobId, e);
            }

            if (failed > 0) {
                String firstError = items.stream()
                        .filter(item -> "FAILED".equals(item.getStatus()))
                        .map(JobItem::getErrorMessage)
                        .filter(message -> message != null && !message.isBlank())
                        .findFirst()
                        .orElse("图片生成失败");
                parent.setErrorMessage(succeeded > 0
                        ? failed + " 个分镜图生成失败: " + firstError
                        : firstError);
            }
        } else {
            parent.setStatus("RUNNING");
        }
        jobMapper.updateById(parent);
    }

    private boolean isTerminal(String status) {
        return "SUCCEEDED".equals(status) || "FAILED".equals(status) || "CANCELED".equals(status);
    }

    // ==================== inputJson 读写 ====================

    private JsonNode readInputJson(String inputJson) {
        if (inputJson == null || inputJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(inputJson);
        } catch (Exception e) {
            log.warn("解析图片子项inputJson失败: {}", e.getMessage());
            return null;
        }
    }

    private List<String> readApiTaskIds(JsonNode input) {
        List<String> taskIds = new ArrayList<>();
        if (input == null) {
            return taskIds;
        }
        JsonNode array = input.get("apiTaskIds");
        if (array != null && array.isArray()) {
            for (JsonNode node : array) {
                if (node != null && !node.isNull() && !node.asText().isBlank()) {
                    taskIds.add(node.asText());
                }
            }
        }
        return taskIds;
    }

    private List<String> readResultUrls(JsonNode input) {
        List<String> urls = new ArrayList<>();
        if (input == null) {
            return urls;
        }
        JsonNode array = input.get("resultUrls");
        if (array != null && array.isArray()) {
            for (JsonNode node : array) {
                if (node != null && !node.isNull() && !node.asText().isBlank()) {
                    urls.add(node.asText());
                }
            }
        }
        return urls;
    }

    /** 把成功生成的图片URL合并进子项 inputJson 的 resultUrls，供父Job聚合 allImageUrls。 */
    private void appendResultUrl(JobItem item, String resultUrl) {
        try {
            Map<String, Object> input;
            if (item.getInputJson() == null || item.getInputJson().isBlank()) {
                input = new HashMap<>();
            } else {
                input = objectMapper.readValue(item.getInputJson(),
                        objectMapper.getTypeFactory().constructMapType(HashMap.class, String.class, Object.class));
            }
            Object existing = input.get("resultUrls");
            List<String> urls = new ArrayList<>();
            if (existing instanceof List<?> list) {
                for (Object url : list) {
                    if (url != null) {
                        urls.add(url.toString());
                    }
                }
            }
            urls.add(resultUrl);
            input.put("resultUrls", urls);
            item.setInputJson(objectMapper.writeValueAsString(input));
        } catch (Exception e) {
            log.warn("写入图片子项resultUrls失败 - itemId: {}, error: {}", item.getId(), e.getMessage());
        }
    }

    private String textField(JsonNode input, String fieldName) {
        if (input == null) {
            return null;
        }
        JsonNode value = input.get(fieldName);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    // ==================== 图片上传辅助(与MQConsumer同构) ====================

    private String processImageAndUploadToOss(String imageData, Long jobId, int index) {
        if (isBase64(imageData)) {
            return uploadBase64ToOss(imageData, jobId, index);
        }
        if (isUrl(imageData)) {
            return downloadAndUploadToOss(imageData, jobId, index);
        }
        throw new BusinessException(ResultCode.PARAM_INVALID, "无法识别的图片数据格式");
    }

    private String uploadBase64ToOss(String base64Data, Long jobId, int index) {
        try {
            String contentType = dataUriContentType(base64Data);
            byte[] imageBytes = Base64.getDecoder().decode(stripDataUriPrefix(base64Data));
            InputStream inputStream = new ByteArrayInputStream(imageBytes);
            String fileName = String.format("ai_image_%d_%d%s", jobId, index, getExtensionFromContentType(contentType));
            return storageService.uploadAsset(inputStream, fileName, contentType);
        } catch (Exception e) {
            log.error("Base64图片上传失败 - jobId: {}", jobId, e);
            throw new BusinessException(ResultCode.OSS_ERROR, "base64图片上传失败: " + e.getMessage());
        }
    }

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
            String fileName = String.format("ai_image_%d_%d%s", jobId, index, getExtensionFromContentType(contentType));
            try (InputStream inputStream = connection.getInputStream()) {
                return storageService.uploadAsset(inputStream, fileName, contentType);
            }
        } catch (Exception e) {
            log.error("图片下载或上传失败 - url: {}", imageUrl, e);
            throw new BusinessException(ResultCode.OSS_ERROR, "图片下载失败: " + e.getMessage());
        }
    }

    private boolean isBase64(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }
        return data.length() > 100
                && !data.startsWith("http://")
                && !data.startsWith("https://");
    }

    private boolean isUrl(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }
        return data.startsWith("http://") || data.startsWith("https://");
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
