package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mq.MQProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 重建持久化图片任务的 Rabbit 调度消息，并兼容旧版 inputJson 中的 taskId。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImageTaskRecoveryService {

    private final ImageGenerationTaskService generationTaskService;
    private final JobMapper jobMapper;
    private final JobItemMapper jobItemMapper;
    private final MQProducer mqProducer;
    private final AiProperties aiProperties;
    private final ObjectMapper objectMapper;

    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        try {
            Set<Long> scheduled = new HashSet<>();
            int imported = importLegacyTasks(scheduled);
            int redispatched = redispatchUnsubmittedItems();

            for (ImageGenerationTask task : generationTaskService.findRecoverableTasks()) {
                if (scheduled.add(task.getId())) {
                    mqProducer.sendImagePollNow(task.getId());
                }
            }

            // 提交阶段崩溃：租约过期后重建分镜提交消息。
            for (ImageGenerationTask stale : generationTaskService.findStaleSubmissions()) {
                int count = generationTaskService.findByJobItem(stale.getJobItemId()).stream()
                        .map(ImageGenerationTask::getTaskIndex)
                        .filter(index -> index != null)
                        .max(Integer::compareTo)
                        .map(index -> index + 1)
                        .orElse(1);
                mqProducer.sendBatchShotImageTask(
                        stale.getJobId(), stale.getUserId(), stale.getProjectId(), List.of(stale.getShotId()),
                        "ALL", count, stale.getAspectRatio(), stale.getModel());
            }

            log.info("Rabbit图片任务恢复完成 - legacyImported: {}, redispatched: {}, pollMessages: {}",
                    imported, redispatched, scheduled.size());
        } catch (Exception e) {
            log.error("Rabbit图片任务恢复失败", e);
        }
    }

    /** 定期修补 DB 已落库但 publish 前崩溃、或提交租约超时的窗口。 */
    @Scheduled(fixedDelayString = "${rabbit.recovery.scan-interval:60000}")
    public void repairDispatchGaps() {
        try {
            int redispatched = redispatchUnsubmittedItems();
            int stale = 0;
            for (ImageGenerationTask task : generationTaskService.findStaleSubmissions()) {
                int count = generationTaskService.findByJobItem(task.getJobItemId()).stream()
                        .map(ImageGenerationTask::getTaskIndex)
                        .filter(index -> index != null)
                        .max(Integer::compareTo)
                        .map(index -> index + 1)
                        .orElse(1);
                mqProducer.sendBatchShotImageTask(
                        task.getJobId(), task.getUserId(), task.getProjectId(), List.of(task.getShotId()),
                        "ALL", count, task.getAspectRatio(), task.getModel());
                stale++;
            }
            if (redispatched > 0 || stale > 0) {
                log.warn("Rabbit图片派发缺口已修补 - pendingItems: {}, staleSubmissions: {}",
                        redispatched, stale);
            }
        } catch (Exception e) {
            log.error("Rabbit图片派发缺口修补失败", e);
        }
    }

    private int redispatchUnsubmittedItems() {
        List<Job> jobs = jobMapper.selectList(new LambdaQueryWrapper<Job>()
                .eq(Job::getJobType, "BATCH_GEN_SHOT_IMG")
                .in(Job::getStatus, "PENDING", "RUNNING"));
        int count = 0;
        for (Job job : jobs) {
            JsonNode meta = readJson(job.getMetaJson());
            if (meta == null || meta.path("rabbitDispatchVersion").asInt(0) < 1) {
                continue;
            }
            String mode = text(meta, "mode");
            String aspectRatio = text(meta, "aspectRatio");
            String model = text(meta, "model");
            int countPerItem = Math.max(1, meta.path("countPerItem").asInt(1));
            List<JobItem> items = jobItemMapper.selectList(new LambdaQueryWrapper<JobItem>()
                    .eq(JobItem::getJobId, job.getId())
                    .eq(JobItem::getStatus, "PENDING"));
            for (JobItem item : items) {
                if (!generationTaskService.findByJobItem(item.getId()).isEmpty()) {
                    continue;
                }
                mqProducer.sendBatchShotImageTask(
                        job.getId(), job.getUserId(), job.getProjectId(), List.of(item.getTargetId()),
                        mode == null ? "ALL" : mode, countPerItem, aspectRatio, model);
                count++;
            }
        }
        return count;
    }

    private int importLegacyTasks(Set<Long> scheduled) {
        List<Job> jobs = jobMapper.selectList(new LambdaQueryWrapper<Job>()
                .eq(Job::getJobType, "BATCH_GEN_SHOT_IMG")
                .in(Job::getStatus, "PENDING", "RUNNING", "FAILED"));
        int imported = 0;
        for (Job job : jobs) {
            List<JobItem> items = jobItemMapper.selectList(new LambdaQueryWrapper<JobItem>()
                    .eq(JobItem::getJobId, job.getId()));
            for (JobItem item : items) {
                JsonNode input = readJson(item.getInputJson());
                JsonNode taskIds = input == null ? null : input.get("apiTaskIds");
                if (taskIds == null || !taskIds.isArray() || taskIds.isEmpty()) {
                    continue;
                }
                if (!shouldRecover(item)) {
                    continue;
                }
                String prompt = text(input, "prompt");
                String model = text(input, "model");
                String aspectRatio = text(input, "aspectRatio");
                int index = 0;
                for (JsonNode value : taskIds) {
                    String providerTaskId = value.asText();
                    if (providerTaskId == null || providerTaskId.isBlank()) {
                        index++;
                        continue;
                    }
                    ImageGenerationTask task = generationTaskService.importLegacyTask(
                            job,
                            item,
                            index++,
                            providerTaskId,
                            prompt,
                            model == null ? aiProperties.getImage().getDefaultModel() : model,
                            aspectRatio == null ? aiProperties.getImage().getDefaultAspectRatio() : aspectRatio
                    );
                    if (task != null && scheduled.add(task.getId())) {
                        mqProducer.sendImagePollNow(task.getId());
                        imported++;
                        log.info("已导入并恢复旧版图片任务 - jobId: {}, shotId: {}, providerTaskId: {}",
                                job.getId(), item.getTargetId(), providerTaskId);
                    }
                }
            }
        }
        return imported;
    }

    private boolean shouldRecover(JobItem item) {
        if (!"FAILED".equals(item.getStatus())) {
            return true;
        }
        String error = item.getErrorMessage();
        return error != null && (error.contains("超时")
                || error.contains("查询")
                || error.contains("解析")
                || error.contains("响应超过预期"));
    }

    private JsonNode readJson(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return objectMapper.readTree(value);
        } catch (Exception e) {
            log.warn("旧版图片任务inputJson无法解析: {}", e.getMessage());
            return null;
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }
}
