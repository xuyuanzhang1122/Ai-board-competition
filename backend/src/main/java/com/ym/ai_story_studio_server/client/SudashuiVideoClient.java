package com.ym.ai_story_studio_server.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.service.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 速大水 API 视频生成客户端。
 *
 * <p>对接 sudashuiapi 公开文档中的 Seedance 2.0 系列模型：
 * <ul>
 *   <li>{@code sd-2-720p} / {@code sd-2-1080p} - 标准模型（不支持真人素材）</li>
 *   <li>{@code sd-api-2-720p} / {@code sd-api-2-1080p} - 绕过人脸限制的模型</li>
 *   <li>{@code sd-2-fast-720p} / {@code sd-api-2-fast-720p} - fast 档模型</li>
 * </ul>
 *
 * <p><strong>接口：</strong>
 * <ul>
 *   <li>创建任务: {@code POST https://api.sudashuiapi.com/v1/video/generations}</li>
 *   <li>查询任务: {@code GET https://api.sudashuiapi.com/v1/video/generations/{task_id}}</li>
 * </ul>
 *
 * <p><strong>参数约束：</strong>
 * <ul>
 *   <li>分辨率由模型名决定，不额外传 resolution</li>
 *   <li>画面比例/参考素材通过 {@code metadata.payload}（JSON 字符串）传递，
 *       {@code mode} 固定使用 {@code references}（本项目当前只用图片参考图，不用视频/音频/首尾帧）</li>
 *   <li>参考图沿用现有 storageService 外链解析，无需额外调用上游文件上传接口</li>
 *   <li>时长限制 4-15 秒</li>
 * </ul>
 *
 * @author AI Story Studio
 * @since 1.0.0
 */
@Slf4j
@Component
public class SudashuiVideoClient {

    private static final int REFERENCE_URL_EXPIRATION_MINUTES = 120;
    private static final int MIN_DURATION_SECONDS = 4;
    private static final int MAX_DURATION_SECONDS = 15;

    public static final String MODEL_STANDARD_720P = "sd-2-720p";
    public static final String MODEL_STANDARD_1080P = "sd-2-1080p";
    public static final String MODEL_BYPASS_720P = "sd-api-2-720p";
    public static final String MODEL_BYPASS_1080P = "sd-api-2-1080p";
    public static final String MODEL_FAST_720P = "sd-2-fast-720p";
    public static final String MODEL_BYPASS_FAST_720P = "sd-api-2-fast-720p";

    /** 支持的视频模型白名单 */
    public static final Set<String> SEEDANCE_VIDEO_MODELS = Set.of(
            MODEL_STANDARD_720P,
            MODEL_STANDARD_1080P,
            MODEL_BYPASS_720P,
            MODEL_BYPASS_1080P,
            MODEL_FAST_720P,
            MODEL_BYPASS_FAST_720P
    );

    /** 上游支持的画幅比例 */
    private static final Set<String> SUPPORTED_ASPECT_RATIOS = Set.of(
            "1:1", "3:4", "4:3", "9:16", "16:9", "21:9", "adaptive"
    );

    private final RestClient restClient;
    private final RestClient anonymousDownloadClient;
    private final StorageService storageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SudashuiVideoClient(AiProperties aiProperties, StorageService storageService) {
        this.storageService = storageService;
        AiProperties.SudashuiVideo config = aiProperties.getSudashuiVideo();
        String baseUrl = config.getBaseUrl() == null ? "" : config.getBaseUrl().trim();
        String apiKey = config.getApiKey() == null ? "" : config.getApiKey().trim();
        if (baseUrl.isBlank()) {
            log.warn("SudashuiVideoClient initialized without base-url; set ai.sudashui-video.base-url before video calls");
        }
        if (apiKey.isBlank()) {
            log.warn("SudashuiVideoClient initialized without an API key; set ai.sudashui-video.api-key before video calls");
        }

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(positiveTimeout(config.getConnectTimeout(), 10_000L)));
        requestFactory.setReadTimeout(Duration.ofMillis(positiveTimeout(config.getReadTimeout(), 120_000L)));

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .requestFactory(requestFactory)
                .build();
        this.anonymousDownloadClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
        log.info("SudashuiVideoClient initialized - baseUrl: {}", baseUrl);
    }

    /** 视频任务响应（创建与查询共用同一形状） */
    public record VideoTaskResponse(
            String taskId,
            String status,
            Integer progress,
            String videoUrl,
            String errorMessage
    ) {
        public String resolvedTaskId() {
            return taskId;
        }

        public String resolvedVideoUrl() {
            return videoUrl;
        }
    }

    /** 视频二进制内容响应 */
    public record VideoContentResponse(byte[] content, String contentType) {}

    /**
     * 创建视频生成任务
     *
     * <p>调用 {@code POST /v1/video/generations}。参考图沿用现有 images 列表，
     * 逐项转换为外部服务可访问的对象存储 URL，通过 {@code metadata.payload.imageUrls} 传递。
     *
     * @param prompt 提示词
     * @param model 模型名
     * @param aspectRatio 画幅比例（自动归一化到上游支持集合）
     * @param seconds 时长（秒，已按模型约束解析）
     * @param size 输出分辨率提示（上游分辨率由模型名决定，此参数不使用）
     * @param referenceImageUrls 参考图URL列表
     * @return 任务响应（含taskId）
     */
    public VideoTaskResponse createVideo(
            String prompt,
            String model,
            String aspectRatio,
            Integer seconds,
            String size,
            List<String> referenceImageUrls
    ) {
        validateVideoModel(model);
        if (prompt == null || prompt.isBlank()) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "视频提示词不能为空");
        }
        if (prompt.length() > 4096) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "视频提示词不能超过4096字符");
        }

        List<String> images = referenceImageUrls == null
                ? new ArrayList<>()
                : referenceImageUrls.stream()
                        .filter(url -> url != null && !url.isBlank())
                        .map(url -> storageService.resolveExternalAccessUrl(
                                url, REFERENCE_URL_EXPIRATION_MINUTES))
                        .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        int resolvedSeconds = resolveVideoDuration(model, seconds);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("aspectRatio", normalizeAspectRatio(aspectRatio));
        payload.put("mode", "references");
        if (!images.isEmpty()) {
            payload.put("imageUrls", images);
        }

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("model", model);
        requestBody.put("prompt", prompt);
        requestBody.put("duration", resolvedSeconds);
        try {
            requestBody.put("metadata", Map.of("payload", objectMapper.writeValueAsString(payload)));
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "视频任务参数序列化失败: " + e.getMessage(), e);
        }

        try {
            String body = restClient.post()
                    .uri("/v1/video/generations")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, response) -> {
                        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                "视频任务提交失败: HTTP " + response.getStatusCode()
                                        + " " + new String(response.getBody().readAllBytes()));
                    })
                    .body(String.class);

            VideoTaskResponse response = parseTaskResponse(body);
            if (response.taskId() == null || response.taskId().isBlank()) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                        "视频任务提交失败: " + (response.errorMessage() != null ? response.errorMessage() : body));
            }
            return response;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                    "视频任务提交失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询视频任务状态
     *
     * <p>调用 {@code GET /v1/video/generations/{task_id}}。
     */
    public VideoTaskResponse queryTaskStatus(String taskId) {
        if (taskId == null || taskId.isBlank()) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "视频任务ID不能为空");
        }
        try {
            String body = restClient.get()
                    .uri("/v1/video/generations/{taskId}", taskId)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, response) -> {
                        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                "视频任务查询失败: HTTP " + response.getStatusCode()
                                        + " " + new String(response.getBody().readAllBytes()));
                    })
                    .body(String.class);
            return parseTaskResponse(body);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                    "视频任务查询失败: " + e.getMessage(), e);
        }
    }

    /**
     * 下载视频内容
     *
     * <p>查询结果中的 {@code result_url}/{@code creations[0].url} 指向 sudashuiapi 的文件域名，
     * 直接匿名下载即可。
     */
    public VideoContentResponse downloadVideoContent(String taskId) {
        return downloadVideoContent(queryTaskStatus(taskId));
    }

    /** 使用已取得的完成态响应下载视频，避免成功时额外查询一次任务状态。 */
    public VideoContentResponse downloadVideoContent(VideoTaskResponse status) {
        if (status == null) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "视频任务状态不能为空");
        }
        String videoUrl = status.resolvedVideoUrl();

        if (videoUrl != null && !videoUrl.isBlank()) {
            return fetchBinary(videoUrl);
        }
        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                "视频任务已完成但响应缺少视频URL: " + status.resolvedTaskId());
    }

    /**
     * 解析各模型允许的时长
     *
     * <p>上游要求 4-15 秒，超出范围会被夹紧到边界。
     */
    public int resolveVideoDuration(String model, Integer requestedDuration) {
        validateVideoModel(model);
        int seconds = requestedDuration == null ? 5 : requestedDuration;
        return Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, seconds));
    }

    /**
     * 该模型是否原生支持多张参考图
     *
     * <p>references 模式下 imageUrls 最多支持 9 张，当前六个模型均适用。
     */
    public static boolean supportsMultipleReferenceImages(String model) {
        return SEEDANCE_VIDEO_MODELS.contains(model);
    }

    /** 校验模型是否在白名单中 */
    public void validateVideoModel(String model) {
        if (model == null || !SEEDANCE_VIDEO_MODELS.contains(model)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "不支持的视频模型: " + model + "，可用模型: " + SEEDANCE_VIDEO_MODELS);
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 归一化画幅比例到上游支持集合（1:1/3:4/4:3/9:16/16:9/21:9/adaptive）
     */
    private String normalizeAspectRatio(String aspectRatio) {
        if (aspectRatio == null || aspectRatio.isBlank()) {
            return "16:9";
        }
        String normalized = aspectRatio.trim();
        if (SUPPORTED_ASPECT_RATIOS.contains(normalized)) {
            return normalized;
        }
        return switch (normalized) {
            case "2:1", "19.5:9", "20:9" -> "21:9";
            case "1:2", "9:19.5", "9:20" -> "9:16";
            case "3:2" -> "4:3";
            case "2:3" -> "3:4";
            case "keep_ratio" -> "adaptive";
            default -> "16:9";
        };
    }

    /**
     * 解析创建/查询响应。
     *
     * <p>创建成功时响应是扁平结构（{@code task_id}/{@code status}/{@code progress} 在根节点）；
     * 查询响应包裹在 {@code data} 节点下，业务失败时的失败原因在 {@code fail_reason}/{@code creations}。
     * 字段兼容 id/task_id、status/state、progress、result_url/video_url/url/output_url（含 creations[0].url）、
     * fail_reason/message。
     */
    private VideoTaskResponse parseTaskResponse(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);

            String taskId = firstTextWrapped(root, "task_id", "id");
            String status = firstTextWrapped(root, "status", "state");
            Integer progress = firstIntegerWrapped(root, "progress", "percent");
            String videoUrl = firstTextWrapped(
                    root, "result_url", "video_url", "url", "output_url");
            String errorMessage = cleanErrorMessage(firstTextWrapped(root, "fail_reason", "message"));

            return new VideoTaskResponse(taskId, status, progress, videoUrl, errorMessage);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                    "视频响应解析失败: " + e.getMessage(), e);
        }
    }

    /**
     * 创建失败时 message 字段可能是一段被转义过的 JSON 字符串
     * （如 {@code "{\"state\":\"failed\",...,\"message\":\"duration must be from 4 to 15 seconds.\"}"}），
     * 尝试解开一层取出内部真正的错误信息，解析失败则原样返回。
     */
    private String cleanErrorMessage(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            try {
                JsonNode nested = objectMapper.readTree(trimmed);
                String nestedMessage = firstText(nested, "message", "err_code");
                if (nestedMessage != null) return nestedMessage;
            } catch (Exception ignored) {
                // 不是可解析的JSON，原样返回外层文本。
            }
        }
        return raw;
    }

    private String firstTextWrapped(JsonNode node, String... fields) {
        String direct = firstText(node, fields);
        if (direct != null) return direct;
        for (JsonNode child : wrappedChildren(node)) {
            String nested = firstTextWrapped(child, fields);
            if (nested != null) return nested;
        }
        return null;
    }

    private Integer firstIntegerWrapped(JsonNode node, String... fields) {
        for (String field : fields) {
            JsonNode value = node.get(field);
            if (value != null && !value.isNull() && (value.isNumber() || value.isTextual())) {
                String text = value.asText().replace("%", "").trim();
                try {
                    return Integer.parseInt(text);
                } catch (NumberFormatException ignored) {
                    // Try the next compatible field.
                }
            }
        }
        for (JsonNode child : wrappedChildren(node)) {
            Integer nested = firstIntegerWrapped(child, fields);
            if (nested != null) return nested;
        }
        return null;
    }

    private List<JsonNode> wrappedChildren(JsonNode node) {
        List<JsonNode> children = new ArrayList<>();
        for (String field : List.of("data", "creations")) {
            JsonNode value = node.get(field);
            if (value == null || value.isNull()) continue;
            if (value.isArray() && !value.isEmpty()) children.add(value.get(0));
            if (value.isObject()) children.add(value);
        }
        return children;
    }

    private String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            JsonNode value = node.get(field);
            if (value != null && !value.isNull()) {
                String text = value.asText();
                if (text != null && !text.isBlank()) {
                    return text;
                }
            }
        }
        return null;
    }

    /** 带鉴权拉取二进制内容（绝对URL或相对路径均可） */
    private VideoContentResponse fetchBinary(String uri) {
        try {
            boolean absoluteUrl = uri.startsWith("http://") || uri.startsWith("https://");
            ResponseEntity<byte[]> responseEntity;
            if (absoluteUrl) {
                // 完成态视频URL可能带有已编码的查询参数，uri(String) 会被当作URI模板
                // 重新编码破坏原始编码；uri(URI) 不会再次编码，直接使用调用方传入的原始URL。
                responseEntity = anonymousDownloadClient.get()
                        .uri(URI.create(uri))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                    "视频内容下载失败: HTTP " + response.getStatusCode());
                        })
                        .toEntity(byte[].class);
            } else {
                responseEntity = restClient.get()
                        .uri(uri)
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                    "视频内容下载失败: HTTP " + response.getStatusCode());
                        })
                        .toEntity(byte[].class);
            }

            byte[] content = responseEntity.getBody();
            if (content == null || content.length == 0) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "视频内容为空");
            }
            MediaType mediaType = responseEntity.getHeaders().getContentType();
            String contentType = mediaType != null ? mediaType.toString() : "video/mp4";
            return new VideoContentResponse(content, contentType);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                    "视频内容下载失败: " + e.getMessage(), e);
        }
    }

    private long positiveTimeout(Long configured, long fallback) {
        return configured != null && configured > 0 ? configured : fallback;
    }
}
