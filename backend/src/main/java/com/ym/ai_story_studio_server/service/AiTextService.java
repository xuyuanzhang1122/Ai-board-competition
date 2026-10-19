package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.provider.TextGenerationResult;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateRequest;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateResponse;
import com.ym.ai_story_studio_server.dto.ai.TextTaskSnapshot;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.util.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * AI文本生成服务
 *
 * <p>提供AI文本生成能力,支持多种大语言模型(LLM)
 *
 * <p><strong>核心功能:</strong>
 * <ul>
 *   <li>调用当前配置的文本 provider 生成内容</li>
 *   <li>自动应用配置中的默认参数</li>
 *   <li>创建和管理任务记录</li>
 *   <li>自动进行<strong>固定积分计费</strong></li>
 *   <li>记录使用情况和费用明细</li>
 * </ul>
 *
 * <p><strong>支持的模型:</strong>
 * <ul>
 *   <li>DeepSeek / MiMo 官方文本模型；供应商需显式启用</li>
 * </ul>
 *
 * <p><strong>参数说明:</strong>
 * <ul>
 *   <li>maxTokens - <strong>系统内置最大值(4096)</strong>,前端无需传入</li>
 *   <li>temperature - 温度参数(0-1,值越大越随机,默认0.7)</li>
 *   <li>topP - 核采样参数(0-1,默认0.9)</li>
 * </ul>
 *
 * <p><strong>使用示例:</strong>
 * <pre>
 * // ✅ 新的请求格式（无需传入maxTokens）
 * TextGenerateRequest request = new TextGenerateRequest(
 *     "写一个科幻短故事,主角是一个AI",
 *     0.8,     // temperature
 *     0.95,    // topP
 *     1L       // projectId
 * );
 *
 * TextGenerateResponse response = aiTextService.generateText(request);
 * System.out.println("生成的文本: " + response.text());
 * System.out.println("消耗积分: " + response.costPoints());  // 参赛版用户积分费用为零
 * </pre>
 *
 * <p><strong>计费规则:</strong>
 * <ul>
 *   <li>✅ <strong>参赛免费模式</strong>: 用户积分费用为零，供应商用量单独记录</li>
 *   <li>费用从用户积分钱包扣除,具体单价由pricing_rules表配置</li>
 *   <li>quantity始终为1,表示"一次文本生成"</li>
 * </ul>
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Slf4j
@Service
public class AiTextService {

    private final TextGenerationProvider textProvider;
    private final ChargingService chargingService;
    private final JobMapper jobMapper;
    private final AiProperties aiProperties;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final Executor textTaskExecutor;

    public AiTextService(TextGenerationProvider textProvider, ChargingService chargingService,
                         JobMapper jobMapper, AiProperties aiProperties,
                         com.fasterxml.jackson.databind.ObjectMapper objectMapper,
                         @Qualifier("textTaskExecutor") Executor textTaskExecutor) {
        this.textProvider = textProvider;
        this.chargingService = chargingService;
        this.jobMapper = jobMapper;
        this.aiProperties = aiProperties;
        this.objectMapper = objectMapper;
        this.textTaskExecutor = textTaskExecutor;
    }

    /**
     * 异步提交文本任务（服务层入口）
     *
     * <p>立即返回jobId，在后台异步处理生成任务
     *
     * @param request 文本生成请求参数
     * @return 文本生成响应（仅包含jobId和model）
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public TextGenerateResponse generateTextAsync(TextGenerateRequest request) {
        Long userId = UserContext.getUserId();
        log.info("异步文本生成任务提交 - userId: {}, promptLength: {}",
                userId, request.prompt().length());

        TextTaskSnapshot snapshot = prepareSnapshot(request);
        String model = snapshot.model();
        Job job = createJob(userId, request.projectId(), snapshot, "TEXT_GENERATION", "PENDING");
        log.info("Job created - jobId: {}, jobType: TEXT_GENERATION", job.getId());

        // Dispatch identifiers only; the worker reloads the saved snapshot.
        try {
            textTaskExecutor.execute(() -> executeQueuedTextJob(job.getId(), userId, job.getProjectId()));
        } catch (RejectedExecutionException e) {
            jobMapper.failPendingTextJob(job.getId(), userId, job.getProjectId(),
                    "文本任务队列已满或正在关闭，请重新提交");
            throw new BusinessException(ResultCode.SYSTEM_ERROR,
                    "文本任务暂时无法受理，请稍后重试（任务 ID：" + job.getId() + "）");
        }

        // 4. 立即返回jobId
        return new TextGenerateResponse(
                null,  // text将在异步生成后写入Job
                null,  // tokensUsed
                model,
                null,  // costPoints将在生成完成后计算
                job.getId()  // 返回jobId
        );
    }

    public Job createQueuedParsingJob(Long userId, Long projectId, String prompt) {
        TextTaskSnapshot snapshot = prepareSnapshot(new TextGenerateRequest(prompt, null, null, projectId));
        return createJob(userId, projectId, snapshot, "PARSE_TEXT", "PENDING");
    }

    /** Called inside the chat acceptance transaction; dispatch is owned by the durable poller. */
    public Job createQueuedConversationJob(Long userId, String model,
            java.util.List<TextGenerationProvider.ChatTurn> messages) {
        if (messages == null || messages.isEmpty() || !"user".equals(messages.get(messages.size()-1).role())) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "对话上下文无效");
        }
        String prompt = messages.get(messages.size()-1).content();
        TextTaskSnapshot defaults = prepareSnapshot(new TextGenerateRequest(prompt, null, null, null, model));
        TextTaskSnapshot snapshot = new TextTaskSnapshot(2, defaults.model(), prompt, defaults.maxTokens(),
                defaults.temperature(), defaults.topP(), messages);
        return createJob(userId, null, snapshot, "TEXT_GENERATION", "PENDING");
    }

    private TextTaskSnapshot prepareSnapshot(TextGenerateRequest request) {
        AiProperties.Text config = aiProperties.getText();
        String model = request.model() != null ? request.model() : config.getModel();
        TextTaskSnapshot snapshot = new TextTaskSnapshot(1, model, request.prompt(), config.getMaxTokens(),
                request.temperature() != null ? request.temperature() : config.getTemperature(),
                request.topP() != null ? request.topP() : config.getTopP());
        textProvider.validateModelConfiguration(model);
        textProvider.validateRequest(snapshot.prompt(), model, snapshot.maxTokens(), snapshot.temperature(), snapshot.topP());
        return snapshot;
    }

    /** Consume one saved task. Neither broker payload nor current defaults supply generation parameters. */
    public void executeQueuedTextJob(Long jobId, Long userId, Long projectId) {
        Job job = jobMapper.selectById(jobId);
        if (job == null) return;
        if (userId == null || projectId == null || !Objects.equals(userId, job.getUserId())
                || !Objects.equals(projectId, job.getProjectId())
                || !("PARSE_TEXT".equals(job.getJobType()) || "TEXT_GENERATION".equals(job.getJobType()))) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "文本任务归属不匹配");
        }
        if (!"PENDING".equals(job.getStatus())) return;

        TextTaskSnapshot snapshot;
        try {
            var metadata = objectMapper.readTree(job.getMetaJson());
            snapshot = objectMapper.treeToValue(metadata.path("textSnapshot"), TextTaskSnapshot.class);
            if (snapshot == null || (snapshot.version() != 1 && snapshot.version() != 2)
                    || !Objects.equals(metadata.path("model").asText(null), snapshot.model())) {
                throw new BusinessException(ResultCode.PARAM_INVALID, "文本任务快照不受支持，请重新提交");
            }
            textProvider.validateModelConfiguration(snapshot.model());
            textProvider.validateRequest(snapshot.prompt(), snapshot.model(), snapshot.maxTokens(), snapshot.temperature(), snapshot.topP());
        } catch (Exception e) {
            String reason = e instanceof BusinessException ? e.getMessage() : "文本任务缺少有效快照，请重新提交";
            jobMapper.failPendingTextJob(jobId, userId, projectId, reason);
            return;
        }
        if (jobMapper.claimPendingTextJob(jobId, userId, projectId) != 1) return;

        Long previousUser = UserContext.getUserId();
        UserContext.setUserId(userId);
        try {
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("model", snapshot.model());
            metadata.put("prompt", snapshot.prompt());
            metadata.put("maxTokens", snapshot.maxTokens());
            metadata.put("temperature", snapshot.temperature());
            metadata.put("topP", snapshot.topP());
            ChargingService.ChargingResult charge = chargingService.charge(ChargingService.ChargingRequest.builder()
                    .jobId(jobId).bizType("TEXT_GENERATION").modelCode(snapshot.model())
                    .quantity(1).metaData(metadata).build());
            job.setCostPoints(charge.getTotalCost());
            TextGenerationResult result = snapshot.version() == 2
                    ? textProvider.generateConversation(snapshot.messages(), snapshot.model(), snapshot.maxTokens(), snapshot.temperature(), snapshot.topP())
                    : textProvider.generateText(snapshot.prompt(), snapshot.model(), snapshot.maxTokens(), snapshot.temperature(), snapshot.topP());
            updateJobSuccess(job, snapshot.model(), snapshot.prompt(), result.text(),
                    result.tokensUsed() == null ? 0 : result.tokensUsed(), result);
        } catch (Exception e) {
            updateJobFailed(job, e instanceof BusinessException ? e.getMessage() : "文本任务执行失败，请核对任务记录");
        } finally {
            if (previousUser == null) UserContext.clear();
            else UserContext.setUserId(previousUser);
        }
    }

    /**
     * 生成文本
     *
     * <p>调用大语言模型生成文本内容,完整流程包括:
     * <ol>
     *   <li>参数验证和默认值应用</li>
     *   <li>创建任务记录</li>
     *   <li>调用当前文本 provider 生成文本</li>
     *   <li>进行<strong>固定积分计费</strong>(每次生成扣除固定积分,不按token数计费)</li>
     *   <li>更新任务状态为成功</li>
     *   <li>返回生成结果</li>
     * </ol>
     *
     * <p><strong>计费模式变更说明:</strong>
     * <ul>
     *   <li>✅ <strong>参赛免费模式</strong>: 不扣除用户积分，quantity=1 表示请求次数</li>
     *   <li>❌ <strong>旧模式(按token)</strong>: 按实际或估算token数计费,已废弃</li>
     * </ul>
     *
     * <p><strong>maxTokens参数说明:</strong>
     * <ul>
     *   <li>maxTokens已改为系统内置,固定使用配置文件中的最大值(默认4096)</li>
     *   <li>前端无需传入此参数,由后端统一控制</li>
     * </ul>
     *
     * <p><strong>注意事项:</strong>
     * <ul>
     *   <li>挂起调用方事务，任务快照和执行结果独立提交，不随业务回滚消失</li>
     *   <li>HTTP 调用期间不持有业务数据库事务；失败任务保留为 FAILED</li>
     *   <li>参赛版不扣除用户积分，供应商用量单独记录</li>
     * </ul>
     *
     * @param request 文本生成请求参数
     * @return 文本生成响应(包含生成的文本、消耗token数、费用等)
     * @throws BusinessException 当API调用失败或参数错误时抛出
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public TextGenerateResponse generateText(TextGenerateRequest request) {
        Long userId = UserContext.getUserId();
        log.info("Starting text generation - userId: {}, promptLength: {}",
                userId, request.prompt().length());

        // 1. 应用默认配置
        AiProperties.Text textConfig = aiProperties.getText();
        String model = request.model() != null ? request.model() : textConfig.getModel();
        textProvider.validateModelConfiguration(model);
        // ✅ maxTokens改为系统内置,固定使用配置文件最大值,前端不再传入
        Integer maxTokens = textConfig.getMaxTokens();
        Double temperature = request.temperature() != null ? request.temperature() : textConfig.getTemperature();
        Double topP = request.topP() != null ? request.topP() : textConfig.getTopP();
        textProvider.validateRequest(request.prompt(), model, maxTokens, temperature, topP);

        log.debug("Applied config - model: {}, maxTokens: {}, temperature: {}, topP: {}",
                model, maxTokens, temperature, topP);

        // 2. 创建任务记录 (✅ 修复: 传入 prompt)
        Job job = createJob(userId, request.projectId(),
                new TextTaskSnapshot(1, model, request.prompt(), maxTokens, temperature, topP), "TEXT_GENERATION", "RUNNING");
        log.info("Job created - jobId: {}, jobType: TEXT_GENERATION", job.getId());

        try {
            // 3. 应用参赛免费策略（用户积分费用为零）
            log.debug("Applying competition free policy...");
            Map<String, Object> chargingMetaData = new HashMap<>();
            chargingMetaData.put("model", model);
            chargingMetaData.put("maxTokens", maxTokens);
            chargingMetaData.put("temperature", temperature);
            chargingMetaData.put("topP", topP);
            chargingMetaData.put("prompt", request.prompt());

            ChargingService.ChargingResult chargingResult = chargingService.charge(
                    ChargingService.ChargingRequest.builder()
                            .jobId(job.getId())
                            .bizType("TEXT_GENERATION")
                            .modelCode(model)
                            .quantity(1)  // 请求次数，不代表实际 token 用量
                            .metaData(chargingMetaData)
                            .build()
            );

            job.setCostPoints(chargingResult.getTotalCost());
            log.info("Competition free policy applied - jobId: {}, userCostPoints: {}",
                    job.getId(), chargingResult.getTotalCost());

            // 4. 调用当前文本 provider
            log.debug("Calling configured text provider");
            TextGenerationResult apiResponse = textProvider.generateText(
                    request.prompt(),
                    model,
                    maxTokens,
                    temperature,
                    topP
            );

            // 提取生成的文本
            String generatedText = apiResponse.text();

            Integer tokensUsed = apiResponse.tokensUsed() == null ? 0 : apiResponse.tokensUsed();

            log.info("Text generation succeeded - jobId: {}, tokensUsed: {}, textLength: {}",
                    job.getId(), tokensUsed, generatedText.length());

            // 5. 更新任务状态为成功 (✅ 修复: 传入 model, prompt, text)
            updateJobSuccess(job, model, request.prompt(), generatedText, tokensUsed, apiResponse);

            // 6. 返回响应
            return new TextGenerateResponse(
                    generatedText,
                    tokensUsed,
                    model,
                    chargingResult.getTotalCost(),
                    job.getId()  // 工具箱需要用任务ID绑定会话与历史
            );

        } catch (BusinessException e) {
            updateJobFailed(job, e.getMessage());
            throw e;
        } catch (Exception e) {
            // 任务失败,更新任务状态
            log.error("Text generation failed - jobId: {}", job.getId(), e);
            updateJobFailed(job, e.getMessage());
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "文本生成失败: " + e.getMessage(), e);
        }
    }

    /**
     * 创建任务记录
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param snapshot 冻结的文本生成参数
     * @param jobType 文本任务类型
     * @param status 初始任务状态
     * @return 任务对象
     */
    private Job createJob(Long userId, Long projectId, TextTaskSnapshot snapshot, String jobType, String status) {
        Job job = new Job();
        job.setUserId(userId);
        // 工具箱功能时projectId为null,使用0表示"不关联项目"
        job.setProjectId(projectId != null ? projectId : 0L);
        job.setJobType(jobType);
        job.setStatus(status);
        job.setProgress(0);
        job.setTotalItems(1);
        job.setDoneItems(0);

        // ✅ 修复: 使用 ObjectMapper 安全地序列化 JSON (自动处理特殊字符转义)
        try {
            Map<String, Object> metaData = new HashMap<>();
            metaData.put("model", snapshot.model());
            metaData.put("prompt", snapshot.prompt());
            metaData.put("textSnapshot", snapshot);
            job.setMetaJson(objectMapper.writeValueAsString(metaData));
        } catch (Exception e) {
            log.error("Failed to serialize meta_json", e);
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "文本任务快照保存失败");
        }

        jobMapper.insert(job);
        return job;
    }

    /**
     * 更新任务状态为成功
     *
     * @param job 任务对象
     * @param model 使用的模型
     * @param prompt 用户提示词
     * @param text 生成的文本内容
     * @param tokensUsed 使用的token数
     */
    private void updateJobSuccess(Job job, String model, String prompt, String text, Integer tokensUsed, TextGenerationResult result) {
        job.setStatus("SUCCEEDED");
        job.setProgress(100);
        job.setDoneItems(1);

        // ✅ 修复: 使用 ObjectMapper 安全地序列化 JSON
        try {
            Map<String, Object> metaData = objectMapper.readValue(job.getMetaJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            metaData.put("model", model);
            metaData.put("prompt", prompt);
            metaData.put("text", text);
            metaData.put("tokensUsed", tokensUsed);
            metaData.put("usageKnown", result.tokensUsed() != null);
            metaData.put("provider", result.provider());
            metaData.put("upstreamModel", result.model());
            metaData.put("providerRequestId", result.requestId());
            metaData.put("inputTokens", result.inputTokens());
            metaData.put("outputTokens", result.outputTokens());
            metaData.put("budgetReservationId", result.budgetReservationId());
            job.setMetaJson(objectMapper.writeValueAsString(metaData));
        } catch (Exception e) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "文本任务结果保存失败");
        }

        jobMapper.finishClaimedTextJob(job);
    }

    /**
     * 更新任务状态为失败
     *
     * @param job 任务对象
     * @param errorMessage 错误信息
     */
    private void updateJobFailed(Job job, String errorMessage) {
        job.setStatus("FAILED");
        job.setErrorMessage(errorMessage);
        try {
            Map<String, Object> metadata = objectMapper.readValue(job.getMetaJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            metadata.put("executionError", errorMessage);
            job.setMetaJson(objectMapper.writeValueAsString(metadata));
        } catch (Exception ignored) {
            // Preserve the saved snapshot even if the extra failure summary cannot be encoded.
        }
        jobMapper.finishClaimedTextJob(job);
    }
}
