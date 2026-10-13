package com.ym.ai_story_studio_server.client;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.exception.RetryableAiException;
import com.ym.ai_story_studio_server.service.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.InputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GeekNow API client.
 *
 * <p>The request shapes in this class intentionally follow GeekNow's documented
 * model families. Unsupported legacy provider models are rejected instead of
 * being silently translated to another model.</p>
 */
@Slf4j
@Component
public class GeeknowClient {

    private static final String DEFAULT_BASE_URL = "https://www.geeknow.top";
    private static final int MAX_IMAGE_API_ATTEMPTS = 3;
    private static final long IMAGE_API_RETRY_BASE_DELAY_MS = 1000L;
    private static final Pattern MARKDOWN_IMAGE_URL = Pattern.compile("!\\[[^\\]]*]\\((https?://[^)\\s]+)\\)");
    private static final Pattern BARE_URL = Pattern.compile("https?://[^\\s)]+");
    private static final Pattern CUSTOM_ASPECT_RATIO = Pattern.compile("[0-9]+(?:\\.[0-9]+)?:[0-9]+(?:\\.[0-9]+)?");

    private static final Set<String> GEMINI_IMAGE_ASPECT_RATIOS = Set.of(
            "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"
    );
    private static final Set<String> GPT_IMAGE_ASPECT_RATIOS = Set.of(
            "1:1", "4:3", "3:2", "2:3", "16:9", "9:16"
    );
    private static final Set<String> FULL_IMAGE_ASPECT_RATIOS = Set.of(
            "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"
    );
    public static final Set<String> GEMINI_IMAGE_MODELS = Set.of(
            "gemini-3-pro-image-preview",
            "gemini-2.5-flash-image-preview",
            "gemini-3.1-flash-image-preview"
    );

    public static final Set<String> OPENAI_IMAGE_MODELS = Set.of(
            "gpt-image-2",
            "gpt-image-2-pro",
            "gpt-image-2-vip",
            "doubao-seedream-4-0-250828",
            "doubao-seedream-4-5-251128",
            "doubao-seedream-5-0-260128",
            "grok-4-2-image"
    );

    private final List<ClientEndpoint> geeknowEndpoints;
    private final StorageService storageService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    /** 无认证头的裸客户端，用于向预签名对象存储地址 PUT 文件。 */
    private final RestClient presignedUploadClient;

    public GeeknowClient(AiProperties aiProperties, StorageService storageService) {
        this.storageService = storageService;

        AiProperties.Geeknow config = aiProperties.getGeeknow();
        String baseUrl = config.getBaseUrl() == null || config.getBaseUrl().isBlank()
                ? DEFAULT_BASE_URL
                : config.getBaseUrl();
        String apiKey = config.getApiKey() == null ? "" : config.getApiKey().trim();
        if (apiKey.isBlank()) {
            log.warn("GeeknowClient initialized without an API key; set GEEKNOW_API_KEY before generation calls");
        }

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(positiveTimeout(config.getConnectTimeout(), 10_000L)));
        requestFactory.setReadTimeout(Duration.ofMillis(positiveTimeout(config.getReadTimeout(), 60_000L)));

        List<ClientEndpoint> endpoints = new ArrayList<>();
        endpoints.add(new ClientEndpoint("primary", baseUrl, buildGeeknowRestClient(baseUrl, apiKey, requestFactory)));
        String fallbackBaseUrl = config.getFallbackBaseUrl();
        if (hasText(fallbackBaseUrl) && !fallbackBaseUrl.equalsIgnoreCase(baseUrl)) {
            SimpleClientHttpRequestFactory fallbackFactory = new SimpleClientHttpRequestFactory();
            fallbackFactory.setConnectTimeout(Duration.ofMillis(positiveTimeout(config.getConnectTimeout(), 10_000L)));
            fallbackFactory.setReadTimeout(Duration.ofMillis(positiveTimeout(config.getReadTimeout(), 60_000L)));
            endpoints.add(new ClientEndpoint(
                    "fallback",
                    fallbackBaseUrl,
                    buildGeeknowRestClient(fallbackBaseUrl, apiKey, fallbackFactory)
            ));
        }
        this.geeknowEndpoints = List.copyOf(endpoints);
        log.info("GeeknowClient initialized with endpoints: {}", endpoints.stream().map(ClientEndpoint::baseUrl).toList());

        SimpleClientHttpRequestFactory uploadFactory = new SimpleClientHttpRequestFactory();
        uploadFactory.setConnectTimeout(Duration.ofMillis(positiveTimeout(config.getConnectTimeout(), 10_000L)));
        uploadFactory.setReadTimeout(Duration.ofMillis(positiveTimeout(config.getReadTimeout(), 60_000L)));
        this.presignedUploadClient = RestClient.builder().requestFactory(uploadFactory).build();
    }

    /**
     * 把图片上传到 GeekNow 对象存储，换取可直接喂给图像/视频接口的公网 URL。
     *
     * <p>两步：{@code POST /api/upload/presign} 签发预签名 PUT 地址 →
     * 对该地址 PUT 文件字节。异步图片接口只接受 http(s) 素材 URL，
     * 本地存储的参考图需先经此方法转换。
     *
     * @return 上传后的 public_url
     */
    public String uploadImageForPublicUrl(byte[] content, String fileName, String contentType) {
        if (content == null || content.length == 0) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "上传图片内容为空");
        }
        String finalContentType = hasText(contentType) ? contentType : "image/png";

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("file_name", hasText(fileName) ? fileName : "reference.png");
        requestBody.put("content_type", finalContentType);
        requestBody.put("expires_in", 900);

        PresignApiResponse presign;
        try {
            presign = executeWithFailover(client -> client.post()
                            .uri("/api/upload/presign")
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(requestBody)
                            .retrieve()
                            .onStatus(HttpStatusCode::isError, (request, httpResponse) -> throwProviderStatus(
                                    "GeekNow预签名上传地址获取失败",
                                    httpResponse.getStatusCode(),
                                    new String(httpResponse.getBody().readAllBytes())
                            ))
                            .body(PresignApiResponse.class),
                    "预签名上传");
        } catch (BusinessException e) {
            throw e;
        } catch (RetryableGeeknowException | RestClientException e) {
            throw new RetryableAiException("GeekNow预签名上传地址暂时不可用: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow预签名上传地址获取失败: " + e.getMessage(), e);
        }
        if (presign == null || !Boolean.TRUE.equals(presign.success())
                || presign.data() == null
                || !hasText(presign.data().uploadUrl())
                || !hasText(presign.data().publicUrl())) {
            String message = presign != null && hasText(presign.message())
                    ? presign.message()
                    : "响应缺少上传地址";
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow预签名上传地址获取失败: " + message);
        }

        try {
            presignedUploadClient.put()
                    .uri(java.net.URI.create(presign.data().uploadUrl()))
                    .contentType(MediaType.parseMediaType(finalContentType))
                    .body(content)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                "GeekNow图片上传失败(status: " + httpResponse.getStatusCode() + "): "
                                        + new String(httpResponse.getBody().readAllBytes()));
                    })
                    .toBodilessEntity();
        } catch (BusinessException e) {
            throw e;
        } catch (RestClientException e) {
            throw new RetryableAiException("GeekNow图片上传网络故障: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow图片上传失败: " + e.getMessage(), e);
        }
        return presign.data().publicUrl();
    }

    public ImageApiResponse generateImage(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        validateImageModel(model);
        if (prompt == null || prompt.isBlank() || prompt.length() > 4000) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "图片提示词长度必须在1-4000字符之间");
        }
        String normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
        validateImageAspectRatio(model, normalizedAspectRatio);
        if (GEMINI_IMAGE_MODELS.contains(model)) {
            return generateGeminiImage(prompt, model, normalizedAspectRatio, referenceImageUrls);
        }
        return generateOpenAICompatibleImage(prompt, model, normalizedAspectRatio, referenceImageUrls);
    }

    /** Submit an image task through GeekNow's documented asynchronous image endpoint. */
    public ImageTaskApiResponse submitImageTask(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        validateImageModel(model);
        String normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
        validateImageAspectRatio(model, normalizedAspectRatio);
        Map<String, Object> requestBody = buildImageRequest(prompt, model, normalizedAspectRatio, referenceImageUrls, false);
        try {
            ImageTaskApiResponse response = executeWithFailover(client -> client.post()
                            .uri("/v1/images/generations/async")
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(requestBody)
                            .retrieve()
                            .onStatus(HttpStatusCode::isError, (request, httpResponse) -> throwProviderStatus(
                                    "GeekNow异步图片任务提交失败",
                                    httpResponse.getStatusCode(),
                                    new String(httpResponse.getBody().readAllBytes())
                            ))
                            .body(ImageTaskApiResponse.class),
                    "异步图片任务提交");
            if (response == null) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow异步图片任务提交返回空响应");
            }
            return response;
        } catch (BusinessException e) {
            throw e;
        } catch (RetryableGeeknowException | RestClientException e) {
            throw new RetryableAiException("GeekNow异步图片任务提交网络故障: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow异步图片任务提交失败: " + e.getMessage(), e);
        }
    }

    public ImageTaskApiResponse queryImageTask(String taskId) {
        String rawBody;
        try {
            rawBody = executeWithFailover(client -> client.get()
                            .uri("/v1/images/generations/async/{taskId}", taskId)
                            .retrieve()
                            .onStatus(HttpStatusCode::isError, (request, httpResponse) -> throwProviderStatus(
                                    "GeekNow异步图片任务查询失败",
                                    httpResponse.getStatusCode(),
                                    new String(httpResponse.getBody().readAllBytes())
                            ))
                            .body(String.class),
                    "异步图片任务查询");
        } catch (BusinessException e) {
            throw e;
        } catch (RetryableGeeknowException | RestClientException e) {
            throw new RetryableAiException("GeekNow异步图片任务查询网络故障: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow异步图片任务查询失败: " + e.getMessage(), e);
        }
        if (!hasText(rawBody)) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow异步图片任务查询返回空响应");
        }
        // 先按文档结构绑定；实际返回与文档不一致时降级为宽松解析（并记录原始响应体便于排查）
        try {
            return normalizeImageTaskResponse(objectMapper.readValue(rawBody, ImageTaskApiResponse.class));
        } catch (Exception bindError) {
            log.warn("GeekNow异步图片任务响应与文档结构不一致,改用宽松解析 - taskId: {}, 绑定错误: {}, body: {}",
                    taskId, bindError.getMessage(), truncateForLog(rawBody));
            return normalizeImageTaskResponse(parseImageTaskLenient(rawBody, taskId));
        }
    }

    /**
     * GeekNow 的部分图片模型在任务完成后直接返回 OpenAI 图片结果，
     * 即只有 {@code data:[{url:...}]} 而没有 {@code status}。这种响应已经是
     * 成功终态；若仍把 null status 当作进行中，调度器会一直轮询到超时。
     */
    private ImageTaskApiResponse normalizeImageTaskResponse(ImageTaskApiResponse response) {
        if (response == null || hasText(response.status()) || response.data() == null || response.data().isEmpty()) {
            return response;
        }
        boolean hasImage = response.data().stream()
                .filter(java.util.Objects::nonNull)
                .anyMatch(item -> hasText(item.url()) || hasText(item.b64Json()));
        if (!hasImage) {
            return response;
        }
        return new ImageTaskApiResponse(
                response.id(),
                response.object(),
                response.model(),
                "completed",
                100,
                response.createdAt(),
                response.completedAt(),
                response.expiresAt(),
                response.size(),
                response.data(),
                response.error()
        );
    }

    /**
     * 宽松解析异步图片任务响应：容忍 {@code {success,message,data:{...}}} 包装层、
     * {@code data} 为单对象而非数组、数值字段为字符串等与文档不一致的形态。
     */
    private ImageTaskApiResponse parseImageTaskLenient(String rawBody, String taskId) {
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            JsonNode task = root;
            // /api/* 风格包装：真正的任务对象在 data 里
            if (root.has("success") && root.get("data") != null && root.get("data").isObject()) {
                task = root.get("data");
            }

            String id = firstText(task, "id", "task_id", "taskId");
            List<ImageTaskData> data = new ArrayList<>();
            JsonNode dataNode = task.get("data");
            if (dataNode != null) {
                if (dataNode.isArray()) {
                    for (JsonNode item : dataNode) {
                        addImageTaskData(data, item);
                    }
                } else if (dataNode.isObject()) {
                    addImageTaskData(data, dataNode);
                }
            }

            return new ImageTaskApiResponse(
                    hasText(id) ? id : taskId,
                    firstText(task, "object"),
                    firstText(task, "model"),
                    firstText(task, "status"),
                    intOrNull(task.get("progress")),
                    longOrNull(task.get("created_at")),
                    longOrNull(task.get("completed_at")),
                    longOrNull(task.get("expires_at")),
                    firstText(task, "size"),
                    data,
                    task.get("error")
            );
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                    "GeekNow异步图片任务响应无法解析: " + truncateForLog(rawBody), e);
        }
    }

    private void addImageTaskData(List<ImageTaskData> data, JsonNode item) {
        if (item == null || !item.isObject()) {
            return;
        }
        String url = firstText(item, "url", "image_url");
        String b64 = firstText(item, "b64_json");
        if (hasText(url) || hasText(b64)) {
            data.add(new ImageTaskData(url, b64, firstText(item, "revised_prompt")));
        }
    }

    private static String firstText(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.get(fieldName);
            if (value != null && !value.isNull() && !value.isContainerNode() && hasText(value.asText())) {
                return value.asText();
            }
        }
        return null;
    }

    private static Integer intOrNull(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) return node.asInt();
        try {
            String raw = node.asText().trim();
            if (raw.endsWith("%")) raw = raw.substring(0, raw.length() - 1).trim();
            return hasText(raw) ? (int) Double.parseDouble(raw) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 同时兼容文档中的整数进度和实际上游返回的 "10%"。 */
    public static final class FlexibleProgressDeserializer extends JsonDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != null && parser.currentToken().isNumeric()) {
                return parser.getIntValue();
            }
            String raw = parser.getValueAsString();
            if (raw == null || raw.isBlank()) return null;
            raw = raw.trim();
            if (raw.endsWith("%")) raw = raw.substring(0, raw.length() - 1).trim();
            try {
                return (int) Double.parseDouble(raw);
            } catch (NumberFormatException e) {
                return (Integer) context.handleWeirdStringValue(
                        Integer.class, raw, "图片任务progress必须是数字或百分数字符串");
            }
        }
    }

    private static Long longOrNull(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) return node.asLong();
        try {
            return hasText(node.asText()) ? Long.parseLong(node.asText()) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String truncateForLog(String body) {
        if (body == null) return "";
        return body.length() <= 2000 ? body : body.substring(0, 2000) + "...(截断)";
    }

    private ImageApiResponse generateGeminiImage(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", prompt));
        for (String reference : safeReferences(referenceImageUrls)) {
            ReferenceImage image = loadReferenceImage(reference);
            parts.add(Map.of("inlineData", Map.of(
                    "mimeType", image.contentType(),
                    "data", Base64.getEncoder().encodeToString(image.content())
            )));
        }

        String imageSize = "gemini-3-pro-image-preview".equals(model) ? "2K" : "1K";
        Map<String, Object> requestBody = Map.of(
                "contents", List.of(Map.of("role", "user", "parts", parts)),
                "generationConfig", Map.of(
                        "responseModalities", List.of("TEXT", "IMAGE"),
                        "imageConfig", Map.of("aspectRatio", aspectRatio, "imageSize", imageSize)
                )
        );

        try {
            GeminiNativeImageResponse response = executeWithFailover(client -> client.post()
                            .uri("/v1beta/models/{model}:generateContent", model)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(requestBody)
                            .retrieve()
                            .onStatus(HttpStatusCode::isError, (request, httpResponse) -> throwProviderStatus(
                                    "GeekNow Gemini图片生成失败",
                                    httpResponse.getStatusCode(),
                                    new String(httpResponse.getBody().readAllBytes())
                            ))
                            .body(GeminiNativeImageResponse.class),
                    "Gemini图片生成");
            if (response == null) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow Gemini图片生成返回空响应");
            }
            return new ImageApiResponse(response.extractImages(), model);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow Gemini图片生成调用失败: " + e.getMessage(), e);
        }
    }

    private ImageApiResponse generateOpenAICompatibleImage(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        Map<String, Object> requestBody = buildImageRequest(prompt, model, aspectRatio, referenceImageUrls);
        for (int attempt = 1; attempt <= MAX_IMAGE_API_ATTEMPTS; attempt++) {
            try {
                OpenAIImageResponse response = executeWithFailover(client -> client.post()
                                .uri("/v1/images/generations")
                                .contentType(MediaType.APPLICATION_JSON)
                                .body(requestBody)
                                .retrieve()
                                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> throwProviderStatus(
                                        "GeekNow图片生成失败",
                                        httpResponse.getStatusCode(),
                                        new String(httpResponse.getBody().readAllBytes())
                                ))
                                .body(OpenAIImageResponse.class),
                        "图片生成");
                if (response == null || response.data() == null || response.data().isEmpty()) {
                    throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow图片生成返回空结果");
                }
                List<ImageApiResponse.ImageData> images = response.data().stream()
                        .map(OpenAIImageResponse.Data::normalize)
                        .filter(item -> item.url() != null && !item.url().isBlank())
                        .toList();
                if (images.isEmpty()) {
                    throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow图片响应不包含url或b64_json");
                }
                return new ImageApiResponse(images, model);
            } catch (BusinessException e) {
                throw e;
            } catch (RetryableGeeknowException | RestClientException e) {
                if ((e instanceof RestClientException restError && !isTransientTransportFailure(restError))
                        || attempt == MAX_IMAGE_API_ATTEMPTS) {
                    throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow图片生成调用失败: " + e.getMessage(), e);
                }
                sleepForRetry(IMAGE_API_RETRY_BASE_DELAY_MS * attempt, "图片生成网络重试被中断");
            }
        }
        throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow图片生成重试失败");
    }

    private Map<String, Object> buildImageRequest(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls
    ) {
        return buildImageRequest(prompt, model, aspectRatio, referenceImageUrls, true);
    }

    /**
     * @param inlineReferences true=参考图内联为 data URI（同步接口）；
     *                         false=参考图保持公网 URL（异步接口拒收 data URI，
     *                         非 http(s) 的参考图会先上传 GeekNow 对象存储换取 URL）
     */
    private Map<String, Object> buildImageRequest(
            String prompt,
            String model,
            String aspectRatio,
            List<String> referenceImageUrls,
            boolean inlineReferences
    ) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", model);
        requestBody.put("prompt", prompt);
        requestBody.put("n", 1);
        requestBody.put("size", mapImageSize(model, aspectRatio));
        List<String> references = safeReferences(referenceImageUrls).stream()
                .map(reference -> inlineReferences
                        ? toDataUri(loadReferenceImage(reference))
                        : ensurePublicReferenceUrl(reference))
                .toList();
        if (!references.isEmpty()) {
            requestBody.put("image", references);
        }
        if (!"gpt-image-2-vip".equals(model)) {
            requestBody.put("response_format", "url");
        }
        return requestBody;
    }

    /** 异步图片接口只接受 http(s) 素材 URL：已是公网 URL 的原样透传，否则读取后上传换 URL。 */
    private String ensurePublicReferenceUrl(String reference) {
        if (reference.startsWith("http://") || reference.startsWith("https://")) {
            return reference;
        }
        ReferenceImage image = loadReferenceImage(reference);
        return uploadImageForPublicUrl(
                image.content(),
                "reference" + extensionFor(image.contentType()),
                image.contentType()
        );
    }

    private ReferenceImage loadReferenceImage(String reference) {
        if (!hasText(reference)) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "参考图不能为空");
        }
        try {
            if (reference.startsWith("data:")) {
                int comma = reference.indexOf(',');
                if (comma < 0) {
                    throw new IllegalArgumentException("data URI缺少逗号分隔符");
                }
                String metadata = reference.substring(5, comma);
                String contentType = metadata.split(";", 2)[0];
                return buildReferenceImage(Base64.getDecoder().decode(reference.substring(comma + 1)), contentType);
            }

            try (InputStream inputStream = storageService.download(reference)) {
                return buildReferenceImage(inputStream.readAllBytes(), inferImageContentType(reference));
            } catch (Exception storageError) {
                // reference 可能是带签名的外链(查询参数中含已编码字符，如 %2F)，
                // uri(String) 会当作URI模板重新编码破坏签名；uri(URI) 原样透传。
                byte[] content = RestClient.create().get()
                        .uri(java.net.URI.create(reference))
                        .retrieve()
                        .body(byte[].class);
                return buildReferenceImage(content, inferImageContentType(reference));
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "参考图读取失败: " + e.getMessage(), e);
        }
    }

    private ReferenceImage buildReferenceImage(byte[] content, String contentType) {
        if (content == null || content.length == 0) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "参考图内容为空");
        }
        String normalizedType = hasText(contentType) && contentType.startsWith("image/")
                ? contentType
                : MediaType.IMAGE_PNG_VALUE;
        return new ReferenceImage(content, normalizedType);
    }

    private String mapImageSize(String model, String aspectRatio) {
        if (model.startsWith("doubao-seedream-") || "grok-4-2-image".equals(model)) {
            return switch (aspectRatio) {
                case "4:3" -> "2304x1728";
                case "3:4" -> "1728x2304";
                case "16:9" -> "2560x1440";
                case "9:16" -> "1440x2560";
                case "3:2" -> "2496x1664";
                case "2:3" -> "1664x2496";
                case "21:9" -> "3024x1296";
                default -> "2048x2048";
            };
        }
        if ("gpt-image-2-pro".equals(model)) {
            return switch (aspectRatio) {
                case "4:3" -> "2048x1536";
                case "3:4", "2:3" -> "1712x2560";
                case "16:9" -> "2048x1152";
                case "9:16" -> "1152x2048";
                case "3:2", "21:9" -> "2560x1712";
                default -> "2048x2048";
            };
        }
        if ("gpt-image-2-vip".equals(model)) {
            return switch (aspectRatio) {
                case "4:3" -> "1024x768";
                case "3:4" -> "768x1024";
                case "3:2" -> "1008x672";
                case "2:3" -> "672x1008";
                case "16:9" -> "1280x720";
                case "9:16" -> "720x1280";
                case "21:9" -> "1344x576";
                default -> "1024x1024";
            };
        }
        return switch (aspectRatio) {
            case "4:3" -> "1536x1152";
            case "3:4", "2:3" -> "1024x1536";
            case "16:9", "21:9" -> "1920x1080";
            case "9:16" -> "1080x1920";
            case "3:2" -> "1536x1024";
            default -> "1024x1024";
        };
    }

    private String normalizeAspectRatio(String aspectRatio) {
        return hasText(aspectRatio) ? aspectRatio : "1:1";
    }

    private List<String> safeReferences(List<String> references) {
        if (references == null) return List.of();
        return references.stream().filter(GeeknowClient::hasText).toList();
    }

    private void validateImageModel(String model) {
        if (!GEMINI_IMAGE_MODELS.contains(model) && !OPENAI_IMAGE_MODELS.contains(model)) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "GeekNow文档未支持的图片模型: " + model);
        }
    }

    private void validateImageAspectRatio(String model, String aspectRatio) {
        Set<String> supported = GEMINI_IMAGE_MODELS.contains(model)
                ? GEMINI_IMAGE_ASPECT_RATIOS
                : ("gpt-image-2".equals(model) || "gpt-image-2-pro".equals(model))
                    ? GPT_IMAGE_ASPECT_RATIOS
                    : FULL_IMAGE_ASPECT_RATIOS;
        if (!supported.contains(aspectRatio)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    model + "不支持图片比例" + aspectRatio + "，可用值: " + supported);
        }
    }

    /** 在创建 Job 或上传参考图之前做确定性校验，避免无效请求进入 Rabbit。 */
    public String validateImageConfiguration(String model, String aspectRatio) {
        validateImageModel(model);
        String normalized = normalizeAspectRatio(aspectRatio);
        validateImageAspectRatio(model, normalized);
        return normalized;
    }

    private RestClient buildGeeknowRestClient(
            String baseUrl,
            String apiKey,
            SimpleClientHttpRequestFactory requestFactory
    ) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .requestFactory(requestFactory)
                .messageConverters(GeeknowClient::relaxJsonContentTypes)
                .build();
    }

    /**
     * GeekNow 有时把 JSON 响应错误地标成 application/octet-stream（或 text/plain），
     * 导致 RestClient 找不到能把响应体反序列化成目标 DTO 的转换器——图片其实已经生成
     * 成功，却因为解析失败被判为 FAILED。这里让 Jackson 转换器额外接受这些 content-type，
     * 错误标注的 JSON 就能正常解析。真正的二进制（byte[]）读取仍由排在更前面的
     * ByteArrayHttpMessageConverter 处理，不受影响。
     */
    private static void relaxJsonContentTypes(List<HttpMessageConverter<?>> converters) {
        for (HttpMessageConverter<?> converter : converters) {
            if (converter instanceof MappingJackson2HttpMessageConverter jackson) {
                List<MediaType> mediaTypes = new ArrayList<>(jackson.getSupportedMediaTypes());
                for (MediaType extra : List.of(MediaType.APPLICATION_OCTET_STREAM, MediaType.TEXT_PLAIN)) {
                    if (!mediaTypes.contains(extra)) {
                        mediaTypes.add(extra);
                    }
                }
                jackson.setSupportedMediaTypes(mediaTypes);
            }
        }
    }

    private <T> T executeWithFailover(Function<RestClient, T> operation, String operationName) {
        RuntimeException lastFailure = null;
        for (int i = 0; i < geeknowEndpoints.size(); i++) {
            ClientEndpoint endpoint = geeknowEndpoints.get(i);
            try {
                return operation.apply(endpoint.client());
            } catch (RetryableGeeknowException | RestClientException e) {
                lastFailure = e;
                boolean hasFallback = i + 1 < geeknowEndpoints.size();
                if (!hasFallback) throw e;
                log.warn("GeekNow {} endpoint failed during {}, falling back from {} to {}: {}",
                        endpoint.name(), operationName, endpoint.baseUrl(), geeknowEndpoints.get(i + 1).baseUrl(), e.getMessage());
            }
        }
        throw lastFailure == null
                ? new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow " + operationName + "没有可用端点")
                : lastFailure;
    }

    private void throwProviderStatus(String prefix, HttpStatusCode status, String body) {
        if (status.is5xxServerError()) {
            throw new RetryableGeeknowException(prefix + ": " + extractErrorMessage(body));
        }
        throw providerError(prefix, body);
    }

    private BusinessException providerError(String prefix, String body) {
        return new BusinessException(ResultCode.AI_SERVICE_ERROR, prefix + ": " + extractErrorMessage(body));
    }

    private String extractErrorMessage(String body) {
        if (!hasText(body)) return "未知错误";
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode error = root.get("error");
            if (error != null) {
                if (error.isTextual()) return error.asText();
                JsonNode message = error.get("message");
                if (message != null && !message.asText().isBlank()) return message.asText();
            }
            JsonNode message = root.get("message");
            if (message != null && !message.asText().isBlank()) return message.asText();
        } catch (Exception ignored) {
            log.debug("GeekNow error response is not JSON: {}", body);
        }
        return body;
    }

    private boolean isTransientTransportFailure(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof java.io.IOException) return true;
            current = current.getCause();
        }
        return false;
    }

    private void sleepForRetry(long millis, String interruptionMessage) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, interruptionMessage, e);
        }
    }

    private static long positiveTimeout(Long configured, long fallback) {
        return configured != null && configured > 0 ? configured : fallback;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String toDataUri(ReferenceImage image) {
        return "data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.content());
    }

    private static String inferImageContentType(String url) {
        String normalized = url == null ? "" : url.split("\\?", 2)[0].toLowerCase();
        if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return MediaType.IMAGE_JPEG_VALUE;
        if (normalized.endsWith(".webp")) return "image/webp";
        if (normalized.endsWith(".gif")) return "image/gif";
        return MediaType.IMAGE_PNG_VALUE;
    }

    private static String extensionFor(String contentType) {
        return switch (contentType.toLowerCase()) {
            case MediaType.IMAGE_JPEG_VALUE -> "jpg";
            case "image/webp" -> "webp";
            case "image/gif" -> "gif";
            default -> "png";
        };
    }

    private record ReferenceImage(byte[] content, String contentType) {}

    private record ClientEndpoint(String name, String baseUrl, RestClient client) {}

    private static final class RetryableGeeknowException extends RuntimeException {
        private RetryableGeeknowException(String message) {
            super(message);
        }
    }

    public record ImageApiResponse(List<ImageData> data, String model) {
        public record ImageData(String url, String revisedPrompt) {}
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OpenAIImageResponse(Long created, List<Data> data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Data(
                String url,
                @JsonProperty("b64_json") String b64Json,
                @JsonProperty("revised_prompt") String revisedPrompt
        ) {
            private ImageApiResponse.ImageData normalize() {
                return new ImageApiResponse.ImageData(hasText(url) ? url : b64Json, revisedPrompt);
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PresignApiResponse(Boolean success, String message, PresignData data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record PresignData(
                String method,
                @JsonProperty("upload_url") String uploadUrl,
                @JsonProperty("object_key") String objectKey,
                @JsonProperty("public_url") String publicUrl,
                @JsonProperty("expires_in") Integer expiresIn,
                @JsonProperty("content_type") String contentType
        ) {}
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ImageTaskApiResponse(
            @JsonAlias({"task_id", "taskId"}) String id,
            String object,
            String model,
            String status,
            @JsonDeserialize(using = FlexibleProgressDeserializer.class) Integer progress,
            @JsonProperty("created_at") Long createdAt,
            @JsonProperty("completed_at") Long completedAt,
            @JsonProperty("expires_at") Long expiresAt,
            String size,
            List<ImageTaskData> data,
            JsonNode error
    ) {
        public String errorMessage() {
            if (error == null || error.isNull()) return null;
            if (error.isTextual()) return error.asText();
            JsonNode message = error.get("message");
            return message == null ? error.toString() : message.asText();
        }

        public ImageApiResponse toImageResponse() {
            List<ImageApiResponse.ImageData> images = data == null ? List.of() : data.stream()
                    .map(ImageTaskData::normalize)
                    .filter(item -> hasText(item.url()))
                    .toList();
            return new ImageApiResponse(images, model);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeminiNativeImageResponse(List<Candidate> candidates) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Candidate(Content content) {}
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Content(List<Part> parts) {}
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Part(InlineData inlineData, String text) {}
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record InlineData(String mimeType, String data) {}

        public List<ImageApiResponse.ImageData> extractImages() {
            if (candidates == null || candidates.isEmpty()) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow Gemini响应的candidates为空");
            }
            List<ImageApiResponse.ImageData> images = new ArrayList<>();
            StringBuilder text = new StringBuilder();
            for (Candidate candidate : candidates) {
                if (candidate == null || candidate.content() == null || candidate.content().parts() == null) continue;
                for (Part part : candidate.content().parts()) {
                    if (part.inlineData() != null && hasText(part.inlineData().data())) {
                        images.add(new ImageApiResponse.ImageData(part.inlineData().data(), null));
                    }
                    if (hasText(part.text())) {
                        if (!text.isEmpty()) text.append(' ');
                        text.append(part.text().trim());
                    }
                }
            }
            String url = extractImageUrl(text.toString());
            if (url != null) images.add(new ImageApiResponse.ImageData(url, null));
            if (images.isEmpty()) {
                String detail = text.isEmpty() ? "" : ": " + text;
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "GeekNow Gemini响应未包含图片数据" + detail);
            }
            return images;
        }

        private static String extractImageUrl(String text) {
            if (!hasText(text)) return null;
            Matcher markdown = MARKDOWN_IMAGE_URL.matcher(text);
            if (markdown.find()) return markdown.group(1);
            Matcher bare = BARE_URL.matcher(text);
            return bare.find() ? bare.group() : null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ImageTaskData(
            String url,
            @JsonProperty("b64_json") String b64Json,
            @JsonProperty("revised_prompt") String revisedPrompt
    ) {
        private ImageApiResponse.ImageData normalize() {
            return new ImageApiResponse.ImageData(hasText(url) ? url : b64Json, revisedPrompt);
        }
    }
}
