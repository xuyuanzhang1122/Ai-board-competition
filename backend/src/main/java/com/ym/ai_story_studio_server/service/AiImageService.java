package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.ym.ai_story_studio_server.provider.ImageGenerationResult;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.ImageGenerateRequest;
import com.ym.ai_story_studio_server.dto.ai.ImageGenerateResponse;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.util.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI图片生成服务
 *
 * <p>提供AI图片生成能力,支持多种图片生成模型
 *
 * <p><strong>核心功能:</strong>
 * <ul>
 *   <li>按 图片供应商 模型家族契约生成图片</li>
 *   <li>支持文生图和图生图两种模式</li>
 *   <li>自动下载生成的图片并上传到OSS</li>
 *   <li>自动应用配置中的默认参数</li>
 *   <li>创建和管理任务记录</li>
 *   <li>自动进行积分计费</li>
 * </ul>
 *
 * <p><strong>支持的模型:</strong> 以 {@link ImageGenerationProvider} 的图片模型白名单为准。
 *
 * <p><strong>支持的画幅比例:</strong>
 * <ul>
 *   <li>1:1 - 正方形</li>
 *   <li>16:9 - 横向宽屏</li>
 *   <li>9:16 - 竖向</li>
 *   <li>21:9 - 超宽屏(默认)</li>
 * </ul>
 *
 * <p><strong>使用示例:</strong>
 * <pre>
 * // 文生图
 * ImageGenerateRequest request = new ImageGenerateRequest(
 *     "一个科幻风格的未来城市，赛博朋克，霓虹灯",
 *     "gemini-3-pro-image-preview",  // 可选,默认从配置读取
 *     "16:9",                         // 可选,默认16:9
 *     null                            // 参考图URL(可选)
 * );
 *
 * ImageGenerateResponse response = aiImageService.generateImage(request);
 * System.out.println("图片URL: " + response.imageUrl());
 * System.out.println("消耗积分: " + response.costPoints());
 *
 * // 图生图
 * ImageGenerateRequest request = new ImageGenerateRequest(
 *     "将图片风格改为水彩画",
 *     "doubao-seedream-4-5-251128",
 *     "1:1",
 *     "https://example.com/reference.jpg"  // 参考图
 * );
 * </pre>
 *
 * <p><strong>计费规则:</strong>
 * 按张数计费,费用从用户积分钱包扣除,具体单价由pricing_rules表配置
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiImageService {

    private final ImageGenerationProvider imageProvider;
    private final ChargingService chargingService;
    private final StorageService storageService;
    private final JobMapper jobMapper;
    private final AiProperties aiProperties;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    // 用于规避@Async的self-invocation陷阱:同类内部调用不经过Spring代理,@Async会静默失效,
    // 导致executeImageGenerationAsync同步阻塞在调用线程里(参考AsyncImageTaskService的相同用法)。
    private final ObjectProvider<AiImageService> selfProvider;
    private final HttpClient imageDownloadHttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /**
     * 异步生成图片（工具箱使用）
     *
     * <p>立即返回jobId，在后台异步处理生成任务
     *
     * @param request 图片生成请求参数
     * @return 图片生成响应（仅包含jobId和model）
     */
    public ImageGenerateResponse generateImageAsync(ImageGenerateRequest request) {
        Long userId = UserContext.getUserId();
        log.info("异步图片生成任务提交 - userId: {}, promptLength: {}",
                userId, request.prompt().length());

        // 1. 应用默认配置
        AiProperties.Image imageConfig = aiProperties.getImage();
        String model = request.model() != null ? request.model() : imageConfig.getDefaultModel();
        String aspectRatio = request.aspectRatio() != null ? request.aspectRatio() : imageConfig.getDefaultAspectRatio();
        imageProvider.validateImageConfiguration(model, aspectRatio);

        // 2. 创建任务记录
        Job job = createJob(userId, request.projectId(), model, aspectRatio, request.prompt());
        log.info("Job created - jobId: {}, jobType: IMAGE_GENERATION", job.getId());

        // 3. 异步执行生成
        // 注意: 必须通过selfProvider获取代理bean调用,直接this.executeImageGenerationAsync(...)
        // 会绕过Spring AOP代理导致@Async失效,使整个生成流程同步阻塞在当前请求线程里,
        // 耗时超过nginx默认60s的proxy_read_timeout就会给前端返回504(即使后端最终生成成功)。
        selfProvider.getObject().executeImageGenerationAsync(job.getId(), request, model, aspectRatio);

        // 4. 立即返回jobId
        return new ImageGenerateResponse(
                null,  // imageUrls将在异步生成后写入Job
                null,  // primaryImageUrl
                job.getId(),
                model,
                aspectRatio,
                null   // costPoints将在生成完成后计算
        );
    }

    /**
     * 异步执行图片生成任务
     */
    @org.springframework.scheduling.annotation.Async("taskExecutor")
    public void executeImageGenerationAsync(Long jobId, ImageGenerateRequest request, String model, String aspectRatio) {
        try {
            // 从数据库加载Job
            Job job = jobMapper.selectById(jobId);
            if (job == null) {
                log.error("任务不存在 - jobId: {}", jobId);
                return;
            }

            imageProvider.validateImageConfiguration(model, aspectRatio);

            // 设置用户上下文
            UserContext.setUserId(job.getUserId());

            log.info("开始异步生成图片 - jobId: {}", jobId);

            // ✅ 步骤1: 先进行积分扣费检查(预扣费)
            Map<String, Object> metaData = new HashMap<>();
            metaData.put("model", model);
            metaData.put("aspectRatio", aspectRatio);
            metaData.put("prompt", request.prompt());

            ChargingService.ChargingResult chargingResult = chargingService.charge(
                    ChargingService.ChargingRequest.builder()
                            .jobId(job.getId())
                            .bizType("IMAGE_GENERATION")
                            .modelCode(model)
                            .quantity(1)
                            .metaData(metaData)
                            .build()
            );

            log.info("预扣费完成 - jobId: {}, cost: {}, balanceAfter: {}", 
                    jobId, chargingResult.getTotalCost(), chargingResult.getBalanceAfter());

            // ✅ 步骤2: 调用图片生成API(按模型分发到对应渠道)
            List<String> allImageData = callImageProvider(request, model, aspectRatio);

            log.info("图片生成成功 - jobId: {}, totalImages: {}", jobId, allImageData.size());

            // ✅ 步骤3: 批量处理所有图片结果并上传到OSS
            List<String> ossImageUrls = new java.util.ArrayList<>();
            for (int i = 0; i < allImageData.size(); i++) {
                String imageData = allImageData.get(i);
                String ossUrl = processImageResult(imageData, jobId, i);
                ossImageUrls.add(ossUrl);
            }

            String primaryImageUrl = ossImageUrls.get(0);

            log.info("所有图片已上传到OSS - jobId: {}", jobId);

            // ✅ 步骤4: 更新任务状态为成功
            job.setCostPoints(chargingResult.getTotalCost()); // 设置消耗积分
            updateJobSuccess(job, model, aspectRatio, request.prompt(), primaryImageUrl, ossImageUrls);

            log.info("异步图片生成完成 - jobId: {}, cost: {}", jobId, chargingResult.getTotalCost());

        } catch (Exception e) {
            log.error("异步图片生成失败 - jobId: {}", jobId, e);
            Job job = jobMapper.selectById(jobId);
            if (job != null) {
                UserContext.setUserId(job.getUserId());
                updateJobFailed(job, e.getMessage());
            }
        } finally {
            UserContext.clear();
        }
    }

    /**
     * 生成图片
     *
     * <p>调用图片生成模型创建图像,完整流程包括:
     * <ol>
     *   <li>参数验证和默认值应用</li>
     *   <li>创建任务记录</li>
     *   <li>按模型家族调用 图片供应商 图片接口</li>
     *   <li>从返回的URL下载图片</li>
     *   <li>上传图片到OSS存储</li>
     *   <li>进行积分计费</li>
     *   <li>更新任务状态为成功</li>
     *   <li>返回生成结果</li>
     * </ol>
     *
     * <p><strong>注意事项:</strong>
     * <ul>
     *   <li>该方法使用@Transactional确保任务创建和计费的原子性</li>
     *   <li>如果API调用失败,任务状态会更新为FAILED</li>
     *   <li>积分余额不足会抛出异常,不会创建任务</li>
     *   <li>生成的图片会自动上传到OSS,原始URL不会返回</li>
     * </ul>
     *
     * @param request 图片生成请求参数
     * @return 图片生成响应(包含OSS图片URL、消耗积分等)
     * @throws BusinessException 当API调用失败、余额不足或参数错误时抛出
     */
    @Transactional(rollbackFor = Exception.class)
    public ImageGenerateResponse generateImage(ImageGenerateRequest request) {
        Long userId = UserContext.getUserId();
        log.info("Starting image generation - userId: {}, promptLength: {}",
                userId, request.prompt().length());

        // 1. 应用默认配置
        AiProperties.Image imageConfig = aiProperties.getImage();
        String model = request.model() != null ? request.model() : imageConfig.getDefaultModel();
        String aspectRatio = request.aspectRatio() != null ? request.aspectRatio() : imageConfig.getDefaultAspectRatio();
        imageProvider.validateImageConfiguration(model, aspectRatio);

        log.debug("Applied config - model: {}, aspectRatio: {}", model, aspectRatio);

        // 2. 创建任务记录 (✅ 修复: 传入 prompt)
        Job job = createJob(userId, request.projectId(), model, aspectRatio, request.prompt());
        log.info("Job created - jobId: {}, jobType: IMAGE_GENERATION", job.getId());

        try {
            // 3. 进行积分计费(预扣费) - ✅ 先扣费后生成
            log.debug("Starting charging process (pre-charge)...");
            Map<String, Object> chargingMetaData = new HashMap<>();
            chargingMetaData.put("model", model);
            chargingMetaData.put("aspectRatio", aspectRatio);
            chargingMetaData.put("prompt", request.prompt());
            if (!request.referenceImageUrlList().isEmpty()) {
                chargingMetaData.put("referenceImages", request.referenceImageUrlList());
            }

            ChargingService.ChargingResult chargingResult = chargingService.charge(
                    ChargingService.ChargingRequest.builder()
                            .jobId(job.getId())
                            .bizType("IMAGE_GENERATION")
                            .modelCode(model)
                            .quantity(1)  // ✅ 按固定批次计费(1次),不按图片张数
                            .metaData(chargingMetaData)
                            .build()
            );

            log.info("Pre-charging completed - jobId: {}, cost: {} points, balanceAfter: {}",
                    job.getId(), chargingResult.getTotalCost(), chargingResult.getBalanceAfter());

            // 4. 调用图片生成API(按模型分发到对应渠道)
            log.debug("Calling image provider for model: {}", model);
            List<String> allImageData = callImageProvider(request, model, aspectRatio);

            log.info("Images generated - jobId: {}, totalImages: {}, firstDataType: {}",
                    job.getId(),
                    allImageData.size(),
                    isBase64(allImageData.get(0)) ? "base64" : "url");

            // 5. 批量处理所有图片结果(base64或URL)并上传到OSS
            log.debug("Processing {} image results and uploading to OSS...", allImageData.size());
            List<String> ossImageUrls = new java.util.ArrayList<>();

            for (int i = 0; i < allImageData.size(); i++) {
                String imageData = allImageData.get(i);
                String ossUrl = processImageResult(imageData, job.getId(), i);
                ossImageUrls.add(ossUrl);
                log.debug("Image uploaded to OSS - index: {}, jobId: {}, ossUrl: {}",
                        i, job.getId(), ossUrl);
            }

            log.info("All images uploaded to OSS - jobId: {}, totalImages: {}",
                    job.getId(), ossImageUrls.size());

            // 主图片URL(第一张,用于向后兼容)
            String primaryImageUrl = ossImageUrls.get(0);

            // 6. 更新任务状态为成功 (✅ 修复: 传入 model, aspectRatio, prompt, imageUrl, allImageUrls)
            updateJobSuccess(job, model, aspectRatio, request.prompt(), primaryImageUrl, ossImageUrls);

            // 7. 返回响应(包含所有生成的图片)
            return new ImageGenerateResponse(
                    ossImageUrls,          // 所有生成的图片URL
                    primaryImageUrl,        // 主图片URL(第一张,向后兼容)
                    job.getId(),
                    model,
                    aspectRatio,
                    chargingResult.getTotalCost()
            );

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            // 任务失败,更新任务状态
            log.error("Image generation failed - jobId: {}", job.getId(), e);
            updateJobFailed(job, e.getMessage());
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "图片生成失败: " + e.getMessage(), e);
        }
    }

    /**
     * 按模型分发到对应图片生成渠道，统一返回图片数据列表(URL或base64)。
     *
     * <p>仅委托给中立图片 provider；当前实现拒绝全部媒体调用，不存在旧渠道回退。
     */
    private List<String> callImageProvider(ImageGenerateRequest request, String model, String aspectRatio) {
        ImageGenerationResult apiResponse = imageProvider.generateImage(
                request.prompt(),
                model,
                aspectRatio,
                request.referenceImageUrlList(),
                request.quality(),
                request.outputFormat(),
                request.background(),
                request.count()
        );
        if (apiResponse == null || apiResponse.data() == null || apiResponse.data().isEmpty()) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "图片生成API返回的图片数据为空 - model: " + model);
        }
        List<String> allImageData = apiResponse.data().stream()
                .map(ImageGenerationResult.ImageData::url)
                .filter(url -> url != null && !url.isBlank())
                .toList();
        if (allImageData.isEmpty()) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "图片生成API返回的图片数据为空 - model: " + model);
        }
        return allImageData;
    }

    /**
     * 处理图片结果并上传到OSS
     *
     * <p>自动识别数据类型(base64或URL)并调用相应的处理方法
     *
     * @param imageData 图片数据(base64字符串或URL)
     * @param jobId 任务ID(用于生成文件名)
     * @param index 图片索引(当生成多张图片时使用,用于生成不同的文件名)
     * @return OSS存储的图片URL
     * @throws BusinessException 当处理失败时抛出
     */
    private String processImageResult(String imageData, Long jobId, int index) {
        // 判断1: 是否为base64编码
        if (isBase64(imageData)) {
            log.debug("Detected base64 image data - index: {}, length: {}", index, imageData.length());
            return uploadBase64ToOss(imageData, jobId, index);
        }

        // 判断2: 是否为URL
        if (isUrl(imageData)) {
            log.debug("Detected image URL - index: {}, url: {}", index, imageData);
            return downloadAndUploadToOss(imageData, jobId, index);
        }

        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                "无法识别的图片数据格式,既不是base64也不是URL");
    }

    /**
     * 处理图片结果并上传到OSS(单图模式,向后兼容)
     *
     * <p>自动识别数据类型(base64或URL)并调用相应的处理方法
     *
     * @param imageData 图片数据(base64字符串或URL)
     * @param jobId 任务ID(用于生成文件名)
     * @return OSS存储的图片URL
     * @throws BusinessException 当处理失败时抛出
     */
    private String processImageResult(String imageData, Long jobId) {
        return processImageResult(imageData, jobId, 0);
    }

    /**
     * 上传base64编码的图片到OSS
     *
     * @param base64Data base64编码的图片数据
     * @param jobId 任务ID(用于生成文件名)
     * @return OSS存储的图片URL
     * @throws BusinessException 当上传失败时抛出
     */
    private String uploadBase64ToOss(String base64Data, Long jobId, int index) {
        try {
            String contentType = dataUriContentType(base64Data);
            byte[] imageBytes = Base64.getDecoder().decode(stripDataUriPrefix(base64Data));
            log.debug("Base64 decoded - size: {} bytes", imageBytes.length);

            // 2. 包装为InputStream
            InputStream inputStream = new ByteArrayInputStream(imageBytes);

            // 3. 生成文件名(包含索引,用于区分多张图片)
            String fileName = String.format("ai_image_%d_%d%s", jobId, index, getExtensionFromContentType(contentType));

            // 4. 上传到OSS(assets前缀)
            String ossUrl = storageService.uploadAsset(inputStream, fileName, contentType);
            log.debug("Base64 image uploaded to OSS successfully - index: {}, ossUrl: {}", index, ossUrl);
            return ossUrl;

        } catch (IllegalArgumentException e) {
            log.error("Failed to decode base64 image data", e);
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "base64解码失败: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Failed to upload base64 image to OSS", e);
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "base64图片上传失败: " + e.getMessage(), e);
        }
    }

    /**
     * 判断字符串是否为base64编码
     *
     * <p>简化判断逻辑：如果不是URL且长度足够长，就认为是base64
     * （图片供应商 返回 URL、裸 Base64 或 data URI）
     *
     * @param data 待判断的字符串
     * @return true表示是base64编码
     */
    private boolean isBase64(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }

        // 简化判断：不是URL + 长度>100 = base64
        // 不使用正则表达式，避免大字符串性能问题
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
     * 判断字符串是否为URL
     *
     * @param data 待判断的字符串
     * @return true表示是URL
     */
    private boolean isUrl(String data) {
        if (data == null || data.isBlank()) {
            return false;
        }

        return data.startsWith("http://") || data.startsWith("https://");
    }

    /**
     * 从URL下载图片并上传到OSS
     *
     * @param imageUrl 图片URL
     * @param jobId 任务ID(用于生成文件名)
     * @return OSS存储的图片URL
     * @throws BusinessException 当下载或上传失败时抛出
     */
    private String downloadAndUploadToOss(String imageUrl, Long jobId, int index) {
        Exception lastException = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(imageUrl))
                        .timeout(Duration.ofSeconds(60))
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36")
                        .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
                        .GET()
                        .build();

                HttpResponse<byte[]> response = imageDownloadHttpClient.send(
                        request,
                        HttpResponse.BodyHandlers.ofByteArray()
                );
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                            "图片下载失败, HTTP状态码: " + response.statusCode());
                }

                String contentType = response.headers()
                        .firstValue("content-type")
                        .map(value -> value.split(";")[0].trim())
                        .filter(value -> !value.isBlank())
                        .orElse("image/jpeg");
                String extension = getExtensionFromContentType(contentType);
                String fileName = String.format("ai_image_%d_%d%s", jobId, index, extension);

                log.debug("Downloaded image - index: {}, url: {}, contentType: {}, size: {}, fileName: {}",
                        index, imageUrl, contentType, response.body().length, fileName);

                try (InputStream inputStream = new ByteArrayInputStream(response.body())) {
                    String ossUrl = storageService.uploadAsset(inputStream, fileName, contentType);
                    log.debug("Image uploaded to OSS successfully - ossUrl: {}", ossUrl);
                    return ossUrl;
                }
            } catch (Exception e) {
                lastException = e;
                log.warn("Download/upload generated image failed, will retry if possible - attempt: {}/3, url: {}, error: {}",
                        attempt, imageUrl, e.getMessage());
                if (attempt < 3) {
                    try {
                        Thread.sleep(1000L * attempt);
                    } catch (InterruptedException interruptedException) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }

        // 不回退到上游临时链接：那类链接通常有时效，落库后会在过期后失效。
        // 三次重试仍失败，直接判定生成失败，让上层走失败态而不是持久化一个会过期的URL。
        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                "图片下载或上传OSS失败: " + (lastException != null ? lastException.getMessage() : "未知错误"));
    }

    /**
     * 根据ContentType获取文件扩展名
     *
     * @param contentType MIME类型
     * @return 文件扩展名(带点)
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

    /**
     * 创建任务记录
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param model 使用的模型
     * @param aspectRatio 画幅比例
     * @param prompt 用户提示词
     * @return 任务对象
     */
    private Job createJob(Long userId, Long projectId, String model, String aspectRatio, String prompt) {
        Job job = new Job();
        job.setUserId(userId);
        job.setProjectId(projectId != null ? projectId : 0L);
        job.setJobType("IMAGE_GENERATION");
        job.setStatus("RUNNING");
        job.setProgress(0);
        job.setTotalItems(1);
        job.setDoneItems(0);

        // ✅ 修复: 使用 ObjectMapper 安全地序列化 JSON
        try {
            Map<String, Object> metaData = new HashMap<>();
            metaData.put("model", model);
            metaData.put("aspectRatio", aspectRatio);
            metaData.put("prompt", prompt);
            job.setMetaJson(objectMapper.writeValueAsString(metaData));
        } catch (Exception e) {
            log.error("Failed to serialize meta_json", e);
            job.setMetaJson(String.format("{\"model\":\"%s\",\"aspectRatio\":\"%s\"}", model, aspectRatio));
        }

        jobMapper.insert(job);
        return job;
    }

    /**
     * 更新任务状态为成功
     *
     * @param job 任务对象
     * @param model 使用的模型
     * @param aspectRatio 画幅比例
     * @param prompt 用户提示词
     * @param imageUrl OSS主图片URL(第一张)
     * @param allImageUrls 所有生成的图片URL列表
     */
    private void updateJobSuccess(Job job, String model, String aspectRatio, String prompt, String imageUrl, List<String> allImageUrls) {
        job.setStatus("SUCCEEDED");
        job.setProgress(100);
        job.setDoneItems(1);
        job.setResultUrl(imageUrl); // ✅ 设置resultUrl(主图片)

        // ✅ 将所有图片URL保存到meta_json中
        try {
            Map<String, Object> metaData = new HashMap<>();
            metaData.put("model", model);
            metaData.put("aspectRatio", aspectRatio);
            metaData.put("prompt", prompt);
            metaData.put("resultUrl", imageUrl);
            metaData.put("allImageUrls", allImageUrls); // 保存所有图片URL
            metaData.put("imageCount", allImageUrls.size()); // 图片总数
            job.setMetaJson(objectMapper.writeValueAsString(metaData));
        } catch (Exception e) {
            log.error("Failed to serialize meta_json", e);
        }

        jobMapper.updateById(job);
        log.info("任务状态已更新为SUCCEEDED - jobId: {}, resultUrl: {}, totalImages: {}", job.getId(), imageUrl, allImageUrls.size());
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
        jobMapper.updateById(job);
    }
}
