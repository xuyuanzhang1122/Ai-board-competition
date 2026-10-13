package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.mapper.ImageGenerationTaskMapper;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 持久化每次上游生图的状态，为 RabbitMQ at-least-once 投递提供幂等边界。
 *
 * <p>Rabbit 负责调度，数据库负责回答“这条消息是否已经做过”。两者缺一不可：
 * 只依赖 ack 会在进程崩溃时重复执行，只依赖数据库轮询则没有队列背压。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImageGenerationTaskService {

    public static final String SUBMITTING = "SUBMITTING";
    public static final String SUBMITTED = "SUBMITTED";
    public static final String POLLING = "POLLING";
    public static final String COMPLETING = "COMPLETING";
    public static final String SUCCEEDED = "SUCCEEDED";
    public static final String FAILED = "FAILED";
    public static final String CANCELED = "CANCELED";

    private static final int SUBMISSION_LEASE_SECONDS = 120;
    private static final int COMPLETION_LEASE_SECONDS = 300;

    private final ImageGenerationTaskMapper taskMapper;
    private final JobItemMapper jobItemMapper;
    private final JobMapper jobMapper;
    private final ObjectMapper objectMapper;

    public record SubmissionClaim(ImageGenerationTask task, boolean shouldSubmit) {}

    /**
     * 为一个生成序号建立唯一意图并抢占短租约。重复消息不会再次提交上游。
     */
    @Transactional
    public SubmissionClaim claimSubmission(
            Long jobId,
            Long shotId,
            int taskIndex,
            Long userId,
            Long projectId,
            String prompt,
            String model,
            String aspectRatio
    ) {
        JobItem item = findJobItem(jobId, shotId);
        if (item == null) {
            throw new IllegalStateException("图片任务子项不存在: jobId=" + jobId + ", shotId=" + shotId);
        }

        ImageGenerationTask existing = findByItemAndIndex(item.getId(), taskIndex);
        if (existing != null) {
            if (existing.getProviderTaskId() != null && !existing.getProviderTaskId().isBlank()) {
                return new SubmissionClaim(existing, false);
            }
            if (taskMapper.reclaimSubmission(existing.getId(), SUBMISSION_LEASE_SECONDS) == 1) {
                return new SubmissionClaim(taskMapper.selectById(existing.getId()), true);
            }
            return new SubmissionClaim(existing, false);
        }

        ImageGenerationTask task = new ImageGenerationTask();
        task.setJobId(jobId);
        task.setJobItemId(item.getId());
        task.setUserId(userId);
        task.setProjectId(projectId);
        task.setShotId(shotId);
        task.setTaskIndex(taskIndex);
        task.setStatus(SUBMITTING);
        task.setPollCount(0);
        task.setQueryFailureCount(0);
        task.setPrompt(prompt);
        task.setModel(model);
        task.setAspectRatio(aspectRatio);
        task.setLeaseUntil(LocalDateTime.now().plusSeconds(SUBMISSION_LEASE_SECONDS));
        try {
            taskMapper.insert(task);
            markItemRunning(item);
            return new SubmissionClaim(task, true);
        } catch (DuplicateKeyException race) {
            ImageGenerationTask winner = findByItemAndIndex(item.getId(), taskIndex);
            return new SubmissionClaim(winner, false);
        }
    }

    @Transactional
    public ImageGenerationTask recordSubmitted(Long taskId, String providerTaskId) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new IllegalStateException("本地图片调度任务不存在: " + taskId);
        }
        if (task.getProviderTaskId() != null && !task.getProviderTaskId().isBlank()) {
            return task;
        }
        task.setProviderTaskId(providerTaskId);
        task.setStatus(SUBMITTED);
        task.setLeaseUntil(null);
        task.setErrorMessage(null);
        taskMapper.updateById(task);
        return task;
    }

    @Transactional
    public void releaseSubmission(Long taskId, String errorMessage) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || task.getProviderTaskId() != null || isTerminal(task.getStatus())) {
            return;
        }
        // 保留 SUBMITTING，但立即过期租约，让 TTL 重试消息可以接管。
        task.setLeaseUntil(LocalDateTime.now().minusSeconds(1));
        task.setErrorMessage(errorMessage);
        taskMapper.updateById(task);
    }

    public ImageGenerationTask get(Long id) {
        return taskMapper.selectById(id);
    }

    public List<ImageGenerationTask> findByJobItem(Long jobItemId) {
        return taskMapper.selectList(new LambdaQueryWrapper<ImageGenerationTask>()
                .eq(ImageGenerationTask::getJobItemId, jobItemId)
                .orderByAsc(ImageGenerationTask::getTaskIndex));
    }

    public List<ImageGenerationTask> findRecoverableTasks() {
        return taskMapper.selectRecoverableActiveTasks();
    }

    public List<ImageGenerationTask> findStaleSubmissions() {
        return taskMapper.selectStaleActiveSubmissions();
    }

    public boolean isJobActive(Long jobId) {
        Job job = jobMapper.selectById(jobId);
        return job != null && !isItemTerminal(job.getStatus());
    }

    public boolean isJobItemTerminal(Long jobId, Long shotId) {
        JobItem item = findJobItem(jobId, shotId);
        return item == null || isItemTerminal(item.getStatus());
    }

    /**
     * 队列里可能残留父任务结束前发布的轮询消息。先封闭本地状态再 ack，绝不再查询上游。
     */
    @Transactional
    public boolean cancelIfOwnerTerminal(Long taskId) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || isTerminal(task.getStatus())) return task != null;
        Job job = jobMapper.selectById(task.getJobId());
        JobItem item = jobItemMapper.selectById(task.getJobItemId());
        if (job != null && item != null
                && !isItemTerminal(job.getStatus())
                && !isItemTerminal(item.getStatus())) {
            return false;
        }
        task.setStatus(CANCELED);
        task.setErrorMessage("父任务或分镜任务已结束，停止上游请求");
        task.setLeaseUntil(null);
        task.setFinishedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        return true;
    }

    @Transactional
    public void markPollPending(Long taskId, int pollCount) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || isTerminal(task.getStatus())) {
            return;
        }
        task.setStatus(POLLING);
        task.setPollCount(Math.max(task.getPollCount() == null ? 0 : task.getPollCount(), pollCount));
        task.setQueryFailureCount(0);
        task.setLeaseUntil(null);
        taskMapper.updateById(task);
    }

    @Transactional
    public int markQueryFailure(Long taskId, String message) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || isTerminal(task.getStatus())) {
            return task == null || task.getQueryFailureCount() == null ? 0 : task.getQueryFailureCount();
        }
        int failures = (task.getQueryFailureCount() == null ? 0 : task.getQueryFailureCount()) + 1;
        task.setStatus(POLLING);
        task.setQueryFailureCount(failures);
        task.setErrorMessage(message);
        task.setLeaseUntil(null);
        taskMapper.updateById(task);
        return failures;
    }

    public boolean claimCompletion(Long taskId) {
        return taskMapper.claimCompletion(taskId, COMPLETION_LEASE_SECONDS) == 1;
    }

    @Transactional
    public void releaseCompletion(Long taskId, String errorMessage) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || isTerminal(task.getStatus())) {
            return;
        }
        task.setStatus(POLLING);
        task.setLeaseUntil(null);
        task.setErrorMessage(errorMessage);
        taskMapper.updateById(task);
    }

    @Transactional
    public void markSucceeded(Long taskId, String resultUrl) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || SUCCEEDED.equals(task.getStatus())) {
            return;
        }
        // 先锁分镜子项，使同一分镜的多张图串行聚合，适用于多实例消费。
        jobItemMapper.selectByIdForUpdate(task.getJobItemId());
        task.setStatus(SUCCEEDED);
        task.setResultUrl(resultUrl);
        task.setErrorMessage(null);
        task.setLeaseUntil(null);
        task.setFinishedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        refreshAggregates(task.getJobItemId(), task.getJobId());
    }

    @Transactional
    public void markFailed(Long taskId, String errorMessage) {
        ImageGenerationTask task = taskMapper.selectById(taskId);
        if (task == null || isTerminal(task.getStatus())) {
            return;
        }
        jobItemMapper.selectByIdForUpdate(task.getJobItemId());
        task.setStatus(FAILED);
        task.setErrorMessage(errorMessage);
        task.setLeaseUntil(null);
        task.setFinishedAt(LocalDateTime.now());
        taskMapper.updateById(task);
        refreshAggregates(task.getJobItemId(), task.getJobId());
    }

    /** 提交重试耗尽时，把尚未拿到 providerTaskId 的序号持久化为失败。 */
    @Transactional
    public void failUnsubmittedAttempts(Long jobId, Long shotId, int expectedCount, String errorMessage) {
        JobItem item = findJobItem(jobId, shotId);
        if (item == null) {
            return;
        }
        jobItemMapper.selectByIdForUpdate(item.getId());
        for (int index = 0; index < expectedCount; index++) {
            ImageGenerationTask task = findByItemAndIndex(item.getId(), index);
            if (task == null) {
                task = new ImageGenerationTask();
                task.setJobId(jobId);
                task.setJobItemId(item.getId());
                task.setUserId(jobMapper.selectById(jobId).getUserId());
                task.setProjectId(jobMapper.selectById(jobId).getProjectId());
                task.setShotId(shotId);
                task.setTaskIndex(index);
                task.setStatus(FAILED);
                task.setPollCount(0);
                task.setQueryFailureCount(0);
                task.setErrorMessage(errorMessage);
                task.setFinishedAt(LocalDateTime.now());
                taskMapper.insert(task);
            } else if (task.getProviderTaskId() == null && !isTerminal(task.getStatus())) {
                task.setStatus(FAILED);
                task.setErrorMessage(errorMessage);
                task.setLeaseUntil(null);
                task.setFinishedAt(LocalDateTime.now());
                taskMapper.updateById(task);
            }
        }
        refreshAggregates(item.getId(), jobId);
    }

    /** 导入旧版 JobItem.inputJson 中的 taskId，专用于无损升级/抢救已成功任务。 */
    @Transactional
    public ImageGenerationTask importLegacyTask(
            Job job,
            JobItem item,
            int taskIndex,
            String providerTaskId,
            String prompt,
            String model,
            String aspectRatio
    ) {
        ImageGenerationTask existing = findByItemAndIndex(item.getId(), taskIndex);
        if (existing != null) {
            return existing;
        }
        ImageGenerationTask task = new ImageGenerationTask();
        task.setJobId(job.getId());
        task.setJobItemId(item.getId());
        task.setUserId(job.getUserId());
        task.setProjectId(job.getProjectId());
        task.setShotId(item.getTargetId());
        task.setTaskIndex(taskIndex);
        task.setProviderTaskId(providerTaskId);
        task.setStatus(SUBMITTED);
        task.setPollCount(0);
        task.setQueryFailureCount(0);
        task.setPrompt(prompt);
        task.setModel(model);
        task.setAspectRatio(aspectRatio);
        taskMapper.insert(task);

        item.setStatus("RUNNING");
        item.setErrorMessage(null);
        item.setFinishedAt(null);
        if (item.getStartedAt() == null) {
            item.setStartedAt(LocalDateTime.now());
        }
        jobItemMapper.updateById(item);
        job.setStatus("RUNNING");
        job.setFinishedAt(null);
        job.setErrorMessage(null);
        jobMapper.updateById(job);
        return task;
    }

    private void markItemRunning(JobItem item) {
        if ("PENDING".equals(item.getStatus())) {
            item.setStatus("RUNNING");
            item.setStartedAt(LocalDateTime.now());
            jobItemMapper.updateById(item);
        }
    }

    private void refreshAggregates(Long jobItemId, Long jobId) {
        JobItem item = jobItemMapper.selectById(jobItemId);
        List<ImageGenerationTask> tasks = findByJobItem(jobItemId);
        if (item == null || tasks.isEmpty() || tasks.stream().anyMatch(task -> !isTerminal(task.getStatus()))) {
            return;
        }

        List<String> resultUrls = tasks.stream()
                .filter(task -> SUCCEEDED.equals(task.getStatus()))
                .map(ImageGenerationTask::getResultUrl)
                .filter(url -> url != null && !url.isBlank())
                .toList();
        item.setStatus(resultUrls.isEmpty() ? "FAILED" : "SUCCEEDED");
        item.setFinishedAt(LocalDateTime.now());
        item.setErrorMessage(tasks.stream()
                .filter(task -> FAILED.equals(task.getStatus()))
                .map(ImageGenerationTask::getErrorMessage)
                .filter(message -> message != null && !message.isBlank())
                .findFirst().orElse(null));
        mergeResultUrls(item, resultUrls);
        jobItemMapper.updateById(item);
        if (item.getErrorMessage() == null) {
            // MyBatis-Plus 默认忽略 null 字段，成功恢复时需显式清掉旧超时错误。
            jobItemMapper.update(null, new LambdaUpdateWrapper<JobItem>()
                    .eq(JobItem::getId, item.getId())
                    .set(JobItem::getErrorMessage, null));
        }

        Job parent = jobMapper.selectByIdForUpdate(jobId);
        if (parent == null) {
            return;
        }
        List<JobItem> items = jobItemMapper.selectList(
                new LambdaQueryWrapper<JobItem>().eq(JobItem::getJobId, jobId));
        long done = items.stream().filter(candidate -> isItemTerminal(candidate.getStatus())).count();
        long succeeded = items.stream().filter(candidate -> "SUCCEEDED".equals(candidate.getStatus())).count();
        long failed = items.stream().filter(candidate -> "FAILED".equals(candidate.getStatus())).count();
        parent.setDoneItems((int) done);
        parent.setProgress((int) Math.round(done * 100.0 / items.size()));

        List<String> allUrls = new ArrayList<>();
        for (JobItem candidate : items) {
            allUrls.addAll(readResultUrls(candidate.getInputJson()));
        }
        if (!allUrls.isEmpty()) {
            parent.setResultUrl(allUrls.get(0));
        }

        if (done == items.size()) {
            parent.setStatus(succeeded > 0 ? "SUCCEEDED" : "FAILED");
            parent.setProgress(100);
            parent.setFinishedAt(LocalDateTime.now());
            if (failed > 0) {
                String firstError = items.stream()
                        .filter(candidate -> "FAILED".equals(candidate.getStatus()))
                        .map(JobItem::getErrorMessage)
                        .filter(message -> message != null && !message.isBlank())
                        .findFirst().orElse("图片生成失败");
                parent.setErrorMessage(succeeded > 0 ? failed + " 个分镜图生成失败: " + firstError : firstError);
            } else {
                parent.setErrorMessage(null);
            }
        } else {
            parent.setStatus("RUNNING");
            parent.setFinishedAt(null);
        }

        try {
            parent.setMetaJson(objectMapper.writeValueAsString(Map.of(
                    "successCount", succeeded,
                    "failCount", failed,
                    "allImageUrls", allUrls,
                    "imageCount", allUrls.size()
            )));
        } catch (Exception e) {
            log.warn("图片父任务聚合JSON写入失败 - jobId: {}", jobId, e);
        }
        jobMapper.updateById(parent);
        if (parent.getErrorMessage() == null) {
            jobMapper.update(null, new LambdaUpdateWrapper<Job>()
                    .eq(Job::getId, parent.getId())
                    .set(Job::getErrorMessage, null));
        }
    }

    private void mergeResultUrls(JobItem item, List<String> resultUrls) {
        try {
            Map<String, Object> input = item.getInputJson() == null || item.getInputJson().isBlank()
                    ? new HashMap<>()
                    : objectMapper.readValue(item.getInputJson(), new TypeReference<>() {});
            input.put("resultUrls", resultUrls);
            item.setInputJson(objectMapper.writeValueAsString(input));
        } catch (Exception e) {
            log.warn("图片子任务结果JSON写入失败 - itemId: {}", item.getId(), e);
        }
    }

    private List<String> readResultUrls(String inputJson) {
        if (inputJson == null || inputJson.isBlank()) {
            return List.of();
        }
        try {
            var node = objectMapper.readTree(inputJson).get("resultUrls");
            if (node == null || !node.isArray()) {
                return List.of();
            }
            List<String> urls = new ArrayList<>();
            node.forEach(value -> {
                if (!value.isNull() && !value.asText().isBlank()) urls.add(value.asText());
            });
            return urls;
        } catch (Exception e) {
            return List.of();
        }
    }

    private JobItem findJobItem(Long jobId, Long shotId) {
        return jobItemMapper.selectOne(new LambdaQueryWrapper<JobItem>()
                .eq(JobItem::getJobId, jobId)
                .eq(JobItem::getTargetType, "SHOT")
                .eq(JobItem::getTargetId, shotId)
                .last("LIMIT 1"));
    }

    private ImageGenerationTask findByItemAndIndex(Long jobItemId, int taskIndex) {
        return taskMapper.selectOne(new LambdaQueryWrapper<ImageGenerationTask>()
                .eq(ImageGenerationTask::getJobItemId, jobItemId)
                .eq(ImageGenerationTask::getTaskIndex, taskIndex)
                .last("LIMIT 1"));
    }

    public boolean isTerminal(String status) {
        return SUCCEEDED.equals(status) || FAILED.equals(status) || CANCELED.equals(status);
    }

    private boolean isItemTerminal(String status) {
        return "SUCCEEDED".equals(status)
                || "COMPLETED".equals(status)
                || "FAILED".equals(status)
                || "CANCELED".equals(status);
    }
}
