// {{CODE-Cycle-Integration:
//   Task_ID: [#FIX_ASYNC_VIDEO_001]
//   Timestamp: [2025-12-29 13:30:00]
//   Phase: [D-Develop]
//   Context-Analysis: "创建独立的异步视频任务处理服务类,解决@Async在同一类内部调用失效的问题。职责:轮询视频生成任务状态、处理成功/失败回调、更新任务进度。"
//   Principle_Applied: "SRP单一职责原则, Spring @Async最佳实践, 线程安全(UserContext手动传递), 幂等性保证"
// }}
// {{START_MODIFICATIONS}}

package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.provider.VideoGenerationProvider;
import com.ym.ai_story_studio_server.provider.VideoTaskResult;
import com.ym.ai_story_studio_server.provider.VideoContentResult;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.entity.JobItem;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobItemMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.util.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 异步视频任务处理服务
 *
 * <p>专门负责视频生成任务的异步轮询和状态更新,与AiVideoService分离以确保@Async注解生效
 *
 * <p><strong>核心功能:</strong>
 * <ul>
 *   <li>异步轮询视频生成任务状态</li>
 *   <li>根据API状态自动映射任务进度(pending→10%, processing→50%, completed→100%)</li>
 *   <li>处理生成成功回调:下载视频、上传OSS、积分扣费</li>
 *   <li>处理生成失败回调:记录错误信息、更新任务状态</li>
 *   <li>支持超时自动失败</li>
 * </ul>
 *
 * <p><strong>为什么需要独立的Service类?</strong>
 * <ul>
 *   <li>Spring的@Async基于AOP代理实现</li>
 *   <li>同一类内部的方法调用(this.method())不会经过Spring代理</li>
 *   <li>因此@Async注解在同一类内部调用时会失效,方法会同步执行</li>
 *   <li>将异步方法提取到独立Service类中,通过Spring注入调用,确保代理生效</li>
 * </ul>
 *
 * <p><strong>线程安全注意事项:</strong>
 * <ul>
 *   <li>异步方法运行在独立线程中,无法访问主线程的ThreadLocal(如UserContext)</li>
 *   <li>因此userId等关键参数必须通过方法参数显式传递</li>
 *   <li>在需要使用UserContext的地方(如chargingService.charge()),手动设置并清理</li>
 * </ul>
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncVideoTaskService {

    private final VideoGenerationProvider videoProvider;
    private final ChargingService chargingService;
    private final StorageService storageService;
    private final JobMapper jobMapper;
    private final JobItemMapper jobItemMapper;
    private final AssetCreationService assetCreationService;
    private final AiProperties aiProperties;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final ObjectProvider<AsyncVideoTaskService> selfProvider;

    /** Context needed to attach a completed video to a shot and aggregate a batch parent. */
    public record VideoCompletionContext(
            Long projectId,
            Long shotId,
            Long parentJobId,
            String prompt
    ) {}

    /**
     * 服务启动时恢复中断的视频生成任务
     * 
     * <p>参考huobao-drama-master项目的RecoverPendingTasks实现
     * 
     * <p><strong>恢复逻辑:</strong>
     * <ul>
     *   <li>查找所有RUNNING状态且有apiTaskId的视频生成任务</li>
     *   <li>为每个任务启动异步轮询</li>
     * </ul>
     */
    @EventListener(ApplicationReadyEvent.class)
    public void recoverPendingVideoTasks() {
        try {
            // 恢复已经拿到 apiTaskId 但尚未终态的视频任务。VIDEO_GENERATION
            // 是批量视频创建的实际子任务，不能只恢复 SINGLE_SHOT_VIDEO。
            List<Job> pendingJobs = jobMapper.selectList(
                    new LambdaQueryWrapper<Job>()
                            .in(Job::getStatus, "PENDING", "RUNNING")
                            .in(Job::getJobType, "SINGLE_SHOT_VIDEO", "VIDEO_GENERATION")
            );
            
            if (pendingJobs.isEmpty()) {
                log.info("服务启动: 没有需要恢复的视频生成任务");
                return;
            }
            
            log.info("服务启动: 发现 {} 个需要恢复的视频生成任务", pendingJobs.size());
            
            for (Job job : pendingJobs) {
                try {
                    // 从metaJson中提取必要信息
                    String apiTaskId = extractFieldFromJson(job.getMetaJson(), "apiTaskId");
                    String model = extractFieldFromJson(job.getMetaJson(), "model");
                    String aspectRatio = extractFieldFromJson(job.getMetaJson(), "aspectRatio");
                    String durationStr = extractFieldFromJson(job.getMetaJson(), "duration");
                    Integer duration = durationStr != null ? Integer.parseInt(durationStr) : 5;
                    Long shotId = parseLong(extractFieldFromJson(job.getMetaJson(), "shotId"));
                    Long parentJobId = parseLong(extractFieldFromJson(job.getMetaJson(), "parentJobId"));
                    String prompt = extractFieldFromJson(job.getMetaJson(), "prompt");
                    
                    if (apiTaskId == null || apiTaskId.isBlank()) {
                        String errorMessage = "视频任务缺少上游taskId，无法恢复";
                        log.warn("{} - jobId: {}", errorMessage, job.getId());
                        job.setStatus("FAILED");
                        job.setProgress(100);
                        job.setDoneItems(1);
                        job.setErrorMessage(errorMessage);
                        job.setFinishedAt(java.time.LocalDateTime.now());
                        jobMapper.updateById(job);
                        if (parentJobId != null && shotId != null) {
                            markParentItemFailed(parentJobId, shotId, errorMessage);
                        }
                        continue;
                    }
                    
                    log.info("恢复视频生成任务轮询 - jobId: {}, apiTaskId: {}", job.getId(), apiTaskId);
                    
                    // 启动异步轮询
                    selfProvider.getObject().pollVideoGenerationTask(
                            job.getId(),
                            apiTaskId,
                            model != null ? model : aiProperties.getVideo().getModel(),
                            aspectRatio != null ? aspectRatio : "16:9",
                            duration,
                            job.getUserId(),
                            shotId == null ? null : new VideoCompletionContext(
                                    job.getProjectId(), shotId, parentJobId, prompt)
                    );
                    
                } catch (Exception e) {
                    log.error("恢复任务失败 - jobId: {}", job.getId(), e);
                }
            }
            
            log.info("服务启动: 视频生成任务恢复完成");
            
        } catch (Exception e) {
            log.error("服务启动: 恢复视频生成任务失败", e);
        }
    }

    /**
     * 轮询视频生成任务(异步方法)
     *
     * <p>在后台线程中定期查询API任务状态,直到成功或失败
     *
     * <p><strong>进度映射规则:</strong>
     * <ul>
     *   <li>pending(等待中) → 10%</li>
     *   <li>processing(生成中) → 50% (✅ API返回processing而非running)</li>
     *   <li>completed(成功) → 100% (✅ API返回completed而非succeeded)</li>
     *   <li>error(失败) → 0%</li>
     * </ul>
     *
     * <p><strong>安全保障:</strong>
     * <ul>
     *   <li>✅ 幂等性:每次更新前先查询最新状态,避免重复处理</li>
     *   <li>✅ 异常隔离:任何异常都会被捕获并记录到任务状态</li>
     *   <li>✅ 资源清理:确保UserContext在finally块中清理</li>
     *   <li>✅ 超时保护:超过最大轮询次数自动标记为失败</li>
     * </ul>
     *
     * @param jobId 本地任务ID
     * @param apiTaskId API返回的任务ID
     * @param model 模型名称
     * @param aspectRatio 画幅比例
     * @param duration 视频时长
     * @param userId 用户ID(用于积分扣费时设置UserContext)
     */
    @Async("taskExecutor")
    public void pollVideoGenerationTask(
            Long jobId,
            String apiTaskId,
            String model,
            String aspectRatio,
            Integer duration,
            Long userId
    ) {
        pollVideoGenerationTask(jobId, apiTaskId, model, aspectRatio, duration, userId, null);
    }

    @Async("taskExecutor")
    public void pollVideoGenerationTask(
            Long jobId,
            String apiTaskId,
            String model,
            String aspectRatio,
            Integer duration,
            Long userId,
            VideoCompletionContext completionContext
    ) {
        log.info("========== 异步轮询任务启动 ==========");
        log.info("jobId: {}, apiTaskId: {}, userId: {}", jobId, apiTaskId, userId);
        log.info("线程: {}", Thread.currentThread().getName());
        log.info("=====================================");

        AiProperties.Video videoConfig = aiProperties.getVideo();
        Long pollInterval = videoConfig.getPollInterval();
        Integer maxPollCount = videoConfig.getMaxPollCount();

        int pollCount = 0;
        boolean terminalHandled = false;

        try {
            while (pollCount < maxPollCount) {
                pollCount++;

                // 等待一段时间后再查询(避免过于频繁的API调用)
                Thread.sleep(pollInterval);

                // 查询任务状态
                log.info("轮询第 {}/{} 次 - jobId: {}, apiTaskId: {}",
                        pollCount, maxPollCount, jobId, apiTaskId);

                // 带容错的轮询(单次失败不终止整个任务,参考huobao-drama-master)
                VideoTaskResult statusResponse = null;
                try {
                    // 视频生成耗时较长，每个轮询周期只查询一次；瞬时失败留到下个周期再试。
                    statusResponse = videoProvider.queryTaskStatus(apiTaskId);
                } catch (Exception e) {
                    log.warn("任务查询失败，本轮不立即重试 - jobId: {}, 错误: {}",
                            jobId, e.getMessage());
                }
                
                // 如果查询失败但未超过最大轮询次数,继续下一轮(参考huobao的continue逻辑)
                if (statusResponse == null) {
                    log.warn("本次轮询查询失败,继续下一轮 - jobId: {}, pollCount: {}", jobId, pollCount);
                    continue;  // 不抛异常，继续下一次轮询
                }

                String status = statusResponse.status();
                log.info("✅ API返回状态: {} - jobId: {}, videoUrl存在: {}",
                        status, jobId, statusResponse.resolvedVideoUrl() != null);

                Integer progress = statusResponse.progress() != null
                        ? Math.max(0, Math.min(100, statusResponse.progress()))
                        : mapStatusToProgress(status);

                // ✅ 安全保障:每次更新前先查询最新状态(幂等性)
                Job job = jobMapper.selectById(jobId);
                if (job == null) {
                    log.error("任务不存在,停止轮询 - jobId: {}", jobId);
                    if (completionContext != null && completionContext.parentJobId() != null) {
                        markParentItemFailed(completionContext.parentJobId(), completionContext.shotId(), "视频子任务不存在");
                    }
                    terminalHandled = true;
                    break;
                }

                // 检查任务是否已被取消
                if ("CANCELED".equals(job.getStatus())) {
                    log.info("任务已被取消,停止轮询 - jobId: {}", jobId);
                    break;
                }

                // 检查任务是否完成
                if ("completed".equalsIgnoreCase(status)
                        || "succeeded".equalsIgnoreCase(status)
                        || "success".equalsIgnoreCase(status)) {
                    // ? 任务成功:处理视频下载、上传OSS、积分扣费 (修复: 传入 aspectRatio)
                    handleVideoGenerationSuccess(jobId, statusResponse, model, aspectRatio, duration,
                            userId, apiTaskId, completionContext);
                    terminalHandled = true;
                    break;

                } else if ("error".equalsIgnoreCase(status)
                        || "failed".equalsIgnoreCase(status)
                        || "failure".equalsIgnoreCase(status)
                        || "cancelled".equalsIgnoreCase(status)
                        || "canceled".equalsIgnoreCase(status)) {
                    // ? 任务失败:记录错误信息
                    String providerMessage = statusResponse.errorMessage();
                    String errorMsg = providerMessage != null && !providerMessage.isBlank()
                            ? providerMessage
                            : "视频生成失败(status: " + status + ")";
                    handleVideoGenerationFailure(jobId, errorMsg, completionContext);
                    terminalHandled = true;
                    break;
                }

                // 更新任务进度和状态
                updateJobProgress(job, status, progress);

                log.info("任务进度已更新 - jobId: {}, status: {}, progress: {}%",
                        jobId, status, progress);

                // 继续轮询...
            }

            // ✅ 超时保护:超过最大轮询次数
            if (!terminalHandled && pollCount >= maxPollCount) {
                log.warn("轮询超时 - jobId: {}, apiTaskId: {}, 已轮询{}次", jobId, apiTaskId, pollCount);
                handleVideoGenerationFailure(jobId, "视频生成超时(API响应超过预期时间)", completionContext);
            }

        } catch (InterruptedException e) {
            log.error("轮询被中断 - jobId: {}", jobId, e);
            Thread.currentThread().interrupt();
            handleVideoGenerationFailure(jobId, "任务被中断", completionContext);

        } catch (Exception e) {
            log.error("轮询失败 - jobId: {}", jobId, e);
            handleVideoGenerationFailure(jobId, "轮询任务失败: " + e.getMessage(), completionContext);
        }

        log.info("========== 异步轮询任务结束 ==========");
        log.info("jobId: {}, 总轮询次数: {}", jobId, pollCount);
        log.info("=====================================");
    }

    /**
     * 将API状态映射为进度百分比
     *
     * <p>上游未返回 progress 时，根据 GeekNow status 字段映射进度。
     *
     * @param status API返回的任务状态(queued/processing/completed/error)
     * @return 进度百分比(0-100)
     */
    private Integer mapStatusToProgress(String status) {
        if (status == null) {
            return 0;
        }

        return switch (status.toLowerCase()) {
            case "queued", "pending" -> 10;    // 等待中:10% (✅ API返回queued)
            case "processing", "in_progress" -> 50;           // 生成中:50%
            case "completed", "succeeded", "success" -> 100; // 成功:100%
            case "error", "failed", "cancelled" -> 100;
            default -> 0;
        };
    }

    /**
     * 更新任务进度和状态
     *
     * @param job 任务对象
     * @param apiStatus API返回的状态
     * @param progress 进度百分比
     */
    private void updateJobProgress(Job job, String apiStatus, Integer progress) {
        // 映射API状态到本地任务状态
        String localStatus = mapApiStatusToLocalStatus(apiStatus);

        job.setStatus(localStatus);
        job.setProgress(progress);

        // 如果任务从PENDING变为RUNNING,记录开始时间
        if ("RUNNING".equals(localStatus) && job.getStartedAt() == null) {
            job.setStartedAt(java.time.LocalDateTime.now());
        }

        jobMapper.updateById(job);
    }

    /**
     * 将API状态映射为本地任务状态
     *
     * @param apiStatus API状态(queued/processing/completed/error)
     * @return 本地任务状态(PENDING/RUNNING/SUCCEEDED/FAILED)
     */
    private String mapApiStatusToLocalStatus(String apiStatus) {
        if (apiStatus == null) {
            return "PENDING";
        }

        return switch (apiStatus.toLowerCase()) {
            case "queued", "pending" -> "PENDING";  // ✅ API返回queued
            case "processing", "in_progress" -> "RUNNING";
            case "completed", "succeeded", "success" -> "SUCCEEDED";
            case "error", "failed", "cancelled" -> "FAILED";
            default -> "PENDING";
        };
    }

    /**
     * 处理视频生成成功
     *
     * <p><strong>处理流程:</strong>
     * <ol>
     *   <li>从API响应中获取视频URL</li>
     *   <li>下载视频并上传到OSS</li>
     *   <li>进行积分扣费(需要手动设置UserContext)</li>
     *   <li>更新任务状态为SUCCEEDED,记录视频URL到metaJson</li>
     * </ol>
     *
     * <p><strong>安全保障:</strong>
     * <ul>
     *   <li>✅ UserContext手动设置和清理(finally块)</li>
     *   <li>✅ 异常捕获并转为任务失败状态</li>
     *   <li>✅ 完整的日志记录</li>
     * </ul>
     *
     * @param jobId 任务ID
     * @param statusResponse API状态响应
     * @param model 模型名称
     * @param aspectRatio 画幅比例
     * @param duration 视频时长
     * @param userId 用户ID
     */
    private void handleVideoGenerationSuccess(
            Long jobId,
            VideoTaskResult statusResponse,
            String model,
            String aspectRatio,
            Integer duration,
            Long userId,
            String apiTaskId,
            VideoCompletionContext completionContext
    ) {
        log.info("========== 视频生成成功处理开始 ==========");
        log.info("jobId: {}, userId: {}", jobId, userId);

        try {
            // 0. 幂等检查:该上游任务此前是否已经落过资产(服务重启恢复轮询、
            // 消息重投递等场景可能让同一个apiTaskId的成功回调被触发第二次)。
            // 命中则复用已有OSS URL,不再重新下载/上传/扣费,避免在OSS中留下
            // 无人引用的重复视频文件。
            String existingUrl = assetCreationService.findResultUrlBySourceTaskId(apiTaskId);
            boolean alreadyPersisted = existingUrl != null && !existingUrl.isBlank();
            String ossVideoUrl;

            if (alreadyPersisted) {
                ossVideoUrl = existingUrl;
                log.info("视频任务资产已落库,跳过重复下载/上传/计费 - apiTaskId: {}, url: {}",
                        apiTaskId, ossVideoUrl);
            } else {
                // 1. 下载视频并上传到对象存储。
                // 上游只公开任务查询端点，完成后从查询响应中的视频 URL 下载，
                // 再落到项目对象存储，避免业务资产依赖临时上游地址。
                log.debug("API返回的视频URL: {}", statusResponse.resolvedVideoUrl());
                VideoContentResult contentResponse =
                        videoProvider.downloadVideoContent(statusResponse);
                ossVideoUrl = uploadVideoBytesToOss(contentResponse, jobId);
                log.info("视频已上传到对象存储 - jobId: {}, url: {}", jobId, ossVideoUrl);
            }

            // A provider result is not complete until it is attached to the shot.
            // This makes the next frontend refresh observe READY instead of stale NONE.
            // createAssetWithVersion 本身按 sourceTaskId 幂等,重复调用安全。
            if (completionContext != null
                    && completionContext.projectId() != null
                    && completionContext.shotId() != null) {
                assetCreationService.createAssetWithVersion(
                        completionContext.projectId(),
                        "SHOT",
                        completionContext.shotId(),
                        "VIDEO",
                        ossVideoUrl,
                        completionContext.prompt(),
                        model,
                        aspectRatio,
                        userId,
                        apiTaskId
                );
                log.info("视频资产已写回分镜 - jobId: {}, shotId: {}",
                        jobId, completionContext.shotId());
            }

            if (!alreadyPersisted) {
                // 3. 进行积分计费(需要手动设置UserContext,因为这是异步线程)
                log.debug("开始积分扣费 - jobId: {}, userId: {}", jobId, userId);
                Map<String, Object> chargingMetaData = new HashMap<>();
                chargingMetaData.put("model", model);
                chargingMetaData.put("duration", duration);
                chargingMetaData.put("videoUrl", ossVideoUrl);

                // ✅ 安全保障:手动设置UserContext(异步线程中无法自动获取)
                UserContext.setUserId(userId);

                ChargingService.ChargingResult chargingResult = chargingService.charge(
                        ChargingService.ChargingRequest.builder()
                                .jobId(jobId)
                                .bizType("VIDEO_GENERATION")
                                .modelCode(model)
                                .quantity(duration)  // 按秒计费
                                .metaData(chargingMetaData)
                                .build()
                );

                log.info("积分扣费完成 - jobId: {}, 扣费: {} 积分", jobId, chargingResult.getTotalCost());
            }

            // 4. 更新任务状态为成功 (✅ 修复: 使用 ObjectMapper)
            Job job = jobMapper.selectById(jobId);
            if (job != null) {
                // 从现有的meta_json中提取prompt
                String prompt = extractFieldFromJson(job.getMetaJson(), "prompt");

                job.setStatus("SUCCEEDED");
                job.setProgress(100);
                job.setDoneItems(1);
                job.setResultUrl(ossVideoUrl);
                job.setFinishedAt(java.time.LocalDateTime.now());

                // ✅ 修复: 使用 ObjectMapper 安全地序列化 JSON
                try {
                    Map<String, Object> metaData = new HashMap<>();
                    metaData.put("model", model);
                    metaData.put("aspectRatio", aspectRatio);
                    metaData.put("duration", duration);
                    metaData.put("prompt", prompt != null ? prompt : "");
                    metaData.put("resultUrl", ossVideoUrl);
                    job.setMetaJson(objectMapper.writeValueAsString(metaData));
                } catch (Exception e) {
                    log.error("Failed to serialize meta_json", e);
                }

                jobMapper.updateById(job);
            }

            if (completionContext != null && completionContext.parentJobId() != null) {
                markParentItemSucceeded(
                        completionContext.parentJobId(),
                        completionContext.shotId(),
                        ossVideoUrl
                );
            }

            log.info("========== 视频生成成功处理完成 ==========");

        } catch (Exception e) {
            log.error("视频生成成功处理失败 - jobId: {}", jobId, e);
            handleVideoGenerationFailure(jobId, "视频处理失败: " + e.getMessage(), completionContext);
        } finally {
            // ✅ 安全保障:确保清理UserContext(避免内存泄漏)
            UserContext.clear();
        }
    }

    /**
     * 处理视频生成失败
     *
     * @param jobId 任务ID
     * @param errorMessage 错误信息
     */
    private void handleVideoGenerationFailure(
            Long jobId,
            String errorMessage,
            VideoCompletionContext completionContext
    ) {
        log.error("========== 视频生成失败 ==========");
        log.error("jobId: {}, 错误: {}", jobId, errorMessage);

        Job job = jobMapper.selectById(jobId);
        if (job != null) {
            job.setStatus("FAILED");
            job.setErrorMessage(errorMessage);
            job.setProgress(100);
            job.setDoneItems(1);
            job.setFinishedAt(java.time.LocalDateTime.now());
            jobMapper.updateById(job);
        }

        if (completionContext != null && completionContext.parentJobId() != null) {
            markParentItemFailed(
                    completionContext.parentJobId(),
                    completionContext.shotId(),
                    errorMessage
            );
        }

        log.error("====================================");
    }

    public synchronized void markParentItemRunning(Long parentJobId, Long shotId) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("RUNNING");
        if (item.getStartedAt() == null) {
            item.setStartedAt(java.time.LocalDateTime.now());
        }
        jobItemMapper.updateById(item);

        Job parent = jobMapper.selectById(parentJobId);
        if (parent != null && !isTerminal(parent.getStatus())) {
            parent.setStatus("RUNNING");
            if (parent.getStartedAt() == null) {
                parent.setStartedAt(java.time.LocalDateTime.now());
            }
            jobMapper.updateById(parent);
        }
    }

    public synchronized void markParentItemFailed(Long parentJobId, Long shotId, String errorMessage) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("FAILED");
        item.setErrorMessage(errorMessage);
        item.setFinishedAt(java.time.LocalDateTime.now());
        jobItemMapper.updateById(item);
        refreshParentAggregate(parentJobId);
    }

    private synchronized void markParentItemSucceeded(Long parentJobId, Long shotId, String resultUrl) {
        JobItem item = findParentItem(parentJobId, shotId);
        if (item == null || isTerminal(item.getStatus())) {
            return;
        }
        item.setStatus("SUCCEEDED");
        item.setFinishedAt(java.time.LocalDateTime.now());
        jobItemMapper.updateById(item);
        refreshParentAggregate(parentJobId, resultUrl);
    }

    private JobItem findParentItem(Long parentJobId, Long shotId) {
        JobItem item = jobItemMapper.selectOne(
                new LambdaQueryWrapper<JobItem>()
                        .eq(JobItem::getJobId, parentJobId)
                        .eq(JobItem::getTargetType, "SHOT")
                        .eq(JobItem::getTargetId, shotId)
                        .last("LIMIT 1")
        );
        if (item == null) {
            log.error("批量视频子项不存在 - parentJobId: {}, shotId: {}", parentJobId, shotId);
        }
        return item;
    }

    private void refreshParentAggregate(Long parentJobId) {
        refreshParentAggregate(parentJobId, null);
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
            if (failed > 0) {
                String firstError = items.stream()
                        .filter(item -> "FAILED".equals(item.getStatus()))
                        .map(JobItem::getErrorMessage)
                        .filter(message -> message != null && !message.isBlank())
                        .findFirst()
                        .orElse("视频生成失败");
                parent.setErrorMessage(succeeded > 0
                        ? failed + " 个视频生成失败: " + firstError
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

    private String uploadVideoBytesToOss(VideoContentResult contentResponse, Long jobId) {
        try {
            byte[] content = contentResponse.content();
            if (content == null || content.length == 0) {
                throw new BusinessException(ResultCode.OSS_ERROR, "视频内容为空");
            }

            String contentType = contentResponse.contentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = "video/mp4";
            }

            String extension = getExtensionFromContentType(contentType);
            String fileName = String.format("ai_video_%d%s", jobId, extension);

            try (java.io.InputStream inputStream = new java.io.ByteArrayInputStream(content)) {
                String ossUrl = storageService.uploadAsset(inputStream, fileName, contentType);
                log.debug("视频上传OSS成功 - ossUrl: {}", ossUrl);
                return ossUrl;
            }
        } catch (Exception e) {
            log.error("视频上传失败 - jobId: {}", jobId, e);
            throw new BusinessException(ResultCode.OSS_ERROR, "视频下载或上传失败: " + e.getMessage(), e);
        }
    }

    /**
     * 根据ContentType获取文件扩展名
     *
     * @param contentType MIME类型
     * @return 文件扩展名(带点)
     */
    private String getExtensionFromContentType(String contentType) {
        if (contentType == null) {
            return ".mp4";
        }

        return switch (contentType.toLowerCase()) {
            case "video/mp4" -> ".mp4";
            case "video/webm" -> ".webm";
            case "video/quicktime" -> ".mov";
            case "video/x-msvideo" -> ".avi";
            default -> ".mp4";
        };
    }

    /**
     * 从JSON字符串中提取指定字段的值(简单实现)
     *
     * @param json JSON字符串
     * @param fieldName 字段名
     * @return 字段值,如果不存在则返回null
     */
    private String extractFieldFromJson(String json, String fieldName) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode value = objectMapper.readTree(json).get(fieldName);
            return value == null || value.isNull() ? null : value.asText();
        } catch (Exception e) {
            log.warn("读取视频任务meta_json字段失败 - field: {}", fieldName, e);
            return null;
        }
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
// {{END_MODIFICATIONS}}
