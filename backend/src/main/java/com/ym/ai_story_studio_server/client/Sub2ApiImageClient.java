package com.ym.ai_story_studio_server.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.service.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * sub2api 渠道 GPT Image 2 4K 图片生成客户端（{@code https://qs.szscp.com/v1}）。
 *
 * <p>该渠道是 sub2api (Wei-Shaw/sub2api) 改造的 OpenAI 兼容网关，上游为 GPT Image 2。
 * 对外展示为独立模型 {@code gpt-image-2-4k}（区别于 GeeknowClient 已占用的 {@code gpt-image-2}），
 * 但请求体里实际传给上游的 model 字段固定为 {@code gpt-image-2}。
 *
 * <p><strong>接口（均为标准 OpenAI Images API 形状，经实测确认）：</strong>
 * <ul>
 *   <li>无参考图: {@code POST /v1/images/generations}（JSON）</li>
 *   <li>带参考图: {@code POST /v1/images/edits}（multipart/form-data，图生图）</li>
 * </ul>
 *
 * <p><strong>已知限制（实测得出，非猜测）：</strong>
 * <ul>
 *   <li>{@code background=transparent} 上游 gpt-image-2 不支持，直接拒绝而非透传报错</li>
 *   <li>{@code output_format} 仅在 generations 上可靠，edits 接口不透传该参数</li>
 * </ul>
 */
@Slf4j
@Component
public class Sub2ApiImageClient {

    public static final String MODEL_GPT_IMAGE_2_4K = "gpt-image-2-4k";
    private static final String UPSTREAM_MODEL = "gpt-image-2";

    public static final Set<String> SUPPORTED_MODELS = Set.of(MODEL_GPT_IMAGE_2_4K);

    /** 支持的尺寸预设（方图/横屏/竖屏/超宽/宽屏/横幅/标准/海报/竖版/长图），4K 档字面像素值。 */
    public static final Set<String> SUPPORTED_SIZES = Set.of(
            "2880x2880", "3220x2575", "2160x3840", "3840x1646", "3840x2160",
            "3325x2494", "3526x2352", "2575x3220", "2494x3325", "2352x3526"
    );
    private static final String DEFAULT_SIZE = "2880x2880";

    public static final Set<String> SUPPORTED_QUALITIES = Set.of("auto", "low", "standard", "high");
    public static final Set<String> SUPPORTED_OUTPUT_FORMATS = Set.of("png", "jpeg", "webp");
    /** transparent 在校验阶段单独拒绝（见类注释),这里只列出上游实测可用的取值。 */
    public static final Set<String> SUPPORTED_BACKGROUNDS = Set.of("auto", "opaque");

    private static final int MIN_COUNT = 1;
    private static final int MAX_COUNT = 4;

    private final RestClient restClient;
    private final RestClient anonymousDownloadClient;
    private final StorageService storageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public Sub2ApiImageClient(AiProperties aiProperties, StorageService storageService) {
        this.storageService = storageService;
        AiProperties.Sub2ApiImage config = aiProperties.getSub2ApiImage();
        String baseUrl = config.getBaseUrl() == null ? "" : config.getBaseUrl().trim();
        String apiKey = config.getApiKey() == null ? "" : config.getApiKey().trim();
        if (baseUrl.isBlank()) {
            log.warn("Sub2ApiImageClient initialized without base-url; set ai.sub2api-image.base-url before generation calls");
        }
        if (apiKey.isBlank()) {
            log.warn("Sub2ApiImageClient initialized without an API key; set ai.sub2api-image.api-key before generation calls");
        }

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(positiveTimeout(config.getConnectTimeout(), 15_000L)));
        requestFactory.setReadTimeout(Duration.ofMillis(positiveTimeout(config.getReadTimeout(), 300_000L)));

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .requestFactory(requestFactory)
                .messageConverters(Sub2ApiImageClient::relaxJsonContentTypes)
                .build();
        this.anonymousDownloadClient = RestClient.builder().requestFactory(requestFactory).build();
        log.info("Sub2ApiImageClient initialized - baseUrl: {}", baseUrl);
    }

    /**
     * 生成图片（1-4张）。无参考图走 JSON generations 接口，有参考图走 multipart edits 接口。
     *
     * @return 每张图片的 url 或 b64_json（由调用方按现有逻辑识别并落 OSS）
     */
    public List<String> generateImages(
            String prompt,
            String model,
            String size,
            String quality,
            String outputFormat,
            String background,
            Integer count,
            List<String> referenceImageUrls
    ) {
        validateModel(model);
        if (prompt == null || prompt.isBlank() || prompt.length() > 4000) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "图片提示词长度必须在1-4000字符之间");
        }
        String resolvedSize = validateSize(size);
        String resolvedQuality = validateQuality(quality);
        String resolvedOutputFormat = validateOutputFormat(outputFormat);
        String resolvedBackground = validateBackground(background);
        int resolvedCount = validateCount(count);
        List<String> references = safeReferences(referenceImageUrls);

        Sub2ApiImageResponse response = references.isEmpty()
                ? generateViaGenerations(prompt, resolvedSize, resolvedQuality, resolvedOutputFormat, resolvedBackground, resolvedCount)
                : generateViaEdits(prompt, resolvedSize, resolvedQuality, resolvedBackground, resolvedCount, references);

        if (response == null || response.data() == null || response.data().isEmpty()) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "sub2api图片生成返回空结果");
        }
        List<String> images = response.data().stream()
                .filter(java.util.Objects::nonNull)
                .map(item -> hasText(item.url()) ? item.url() : item.b64Json())
                .filter(Sub2ApiImageClient::hasText)
                .toList();
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "sub2api图片响应不包含url或b64_json");
        }
        return images;
    }

    private Sub2ApiImageResponse generateViaGenerations(
            String prompt, String size, String quality, String outputFormat, String background, int count
    ) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", UPSTREAM_MODEL);
        requestBody.put("prompt", prompt);
        requestBody.put("n", count);
        requestBody.put("size", size);
        requestBody.put("quality", quality);
        // 该渠道 url 形式的结果落在不固定且访问缓慢的CDN域名(kayops/ydn99等)上，
        // 下载易无限挂起；b64_json 让图片随响应直接返回，绕开CDN下载。
        requestBody.put("response_format", "b64_json");
        if (hasText(outputFormat)) {
            requestBody.put("output_format", outputFormat);
        }
        if (hasText(background)) {
            requestBody.put("background", background);
        }

        try {
            return restClient.post()
                    .uri("/images/generations")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                        throw providerError("sub2api图片生成失败", new String(httpResponse.getBody().readAllBytes()));
                    })
                    .body(Sub2ApiImageResponse.class);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "sub2api图片生成调用失败: " + e.getMessage(), e);
        }
    }

    private Sub2ApiImageResponse generateViaEdits(
            String prompt, String size, String quality, String background, int count, List<String> referenceImageUrls
    ) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("model", UPSTREAM_MODEL);
        parts.add("prompt", prompt);
        parts.add("n", String.valueOf(count));
        parts.add("size", size);
        parts.add("quality", quality);
        // 与 generations 一致使用 b64_json，避免结果CDN下载挂起。
        parts.add("response_format", "b64_json");
        // output_format 在 edits 接口上不可靠(实测超时/不支持),这里不透传,避免拖垮图生图链路。
        if (hasText(background)) {
            parts.add("background", background);
        }
        for (int i = 0; i < referenceImageUrls.size(); i++) {
            ReferenceImage image = loadReferenceImage(referenceImageUrls.get(i));
            HttpHeaders imageHeaders = new HttpHeaders();
            imageHeaders.setContentType(MediaType.parseMediaType(image.contentType()));
            Resource resource = new NamedByteArrayResource(image.content(), "reference" + i + extensionFor(image.contentType()));
            parts.add("image", new HttpEntity<>(resource, imageHeaders));
        }

        try {
            return restClient.post()
                    .uri("/images/edits")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(parts)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                        throw providerError("sub2api图生图失败", new String(httpResponse.getBody().readAllBytes()));
                    })
                    .body(Sub2ApiImageResponse.class);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "sub2api图生图调用失败: " + e.getMessage(), e);
        }
    }

    // ==================== 校验 ====================

    /** 在创建 Job 或投递 MQ 之前做确定性校验（与 GeeknowClient 同名方法语义一致），返回归一化尺寸。 */
    public String validateImageConfiguration(String model, String size) {
        validateModel(model);
        return validateSize(size);
    }

    private void validateModel(String model) {
        if (!SUPPORTED_MODELS.contains(model)) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "不支持的sub2api图片模型: " + model);
        }
    }

    private String validateSize(String size) {
        if (!hasText(size)) {
            return DEFAULT_SIZE;
        }
        String normalized = mapAspectRatioToSize(size.trim());
        if (!SUPPORTED_SIZES.contains(normalized)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "gpt-image-2-4k不支持的尺寸: " + size + "，可用值: " + SUPPORTED_SIZES);
        }
        return normalized;
    }

    /**
     * 分镜/角色/场景等链路仍以画幅比例(16:9等)为参数传递，
     * 这里映射到最接近的4K尺寸预设；已是WxH字面值的原样返回。
     */
    private static String mapAspectRatioToSize(String value) {
        return switch (value) {
            case "1:1" -> "2880x2880";
            case "4:3" -> "3325x2494";
            case "3:4" -> "2494x3325";
            case "3:2" -> "3526x2352";
            case "2:3" -> "2352x3526";
            case "16:9" -> "3840x2160";
            case "9:16" -> "2160x3840";
            case "21:9" -> "3840x1646";
            default -> value;
        };
    }

    private String validateQuality(String quality) {
        if (!hasText(quality)) {
            return "auto";
        }
        if (!SUPPORTED_QUALITIES.contains(quality)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "gpt-image-2-4k不支持的质量档位: " + quality + "，可用值: " + SUPPORTED_QUALITIES);
        }
        return quality;
    }

    private String validateOutputFormat(String outputFormat) {
        if (!hasText(outputFormat)) {
            return null;
        }
        if (!SUPPORTED_OUTPUT_FORMATS.contains(outputFormat)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "gpt-image-2-4k不支持的输出格式: " + outputFormat + "，可用值: " + SUPPORTED_OUTPUT_FORMATS);
        }
        return outputFormat;
    }

    private String validateBackground(String background) {
        if (!hasText(background)) {
            return null;
        }
        if ("transparent".equalsIgnoreCase(background)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "gpt-image-2-4k暂不支持透明背景(上游GPT Image 2不支持transparent)");
        }
        if (!SUPPORTED_BACKGROUNDS.contains(background)) {
            throw new BusinessException(ResultCode.PARAM_INVALID,
                    "gpt-image-2-4k不支持的背景选项: " + background + "，可用值: " + SUPPORTED_BACKGROUNDS);
        }
        return background;
    }

    private int validateCount(Integer count) {
        int resolved = count == null ? 1 : count;
        return Math.max(MIN_COUNT, Math.min(MAX_COUNT, resolved));
    }

    private List<String> safeReferences(List<String> references) {
        if (references == null) return List.of();
        return references.stream().filter(Sub2ApiImageClient::hasText).toList();
    }

    // ==================== 参考图读取 ====================

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
                byte[] content = java.util.Base64.getDecoder().decode(reference.substring(comma + 1));
                return buildReferenceImage(content, contentType);
            }
            try (InputStream inputStream = storageService.download(reference)) {
                return buildReferenceImage(inputStream.readAllBytes(), inferImageContentType(reference));
            } catch (Exception storageError) {
                // 参考图可能是带签名的外链(查询参数含已编码字符);uri(URI) 原样透传,避免二次编码破坏签名。
                byte[] content = anonymousDownloadClient.get()
                        .uri(URI.create(reference))
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

    private static String inferImageContentType(String url) {
        String normalized = url == null ? "" : url.split("\\?", 2)[0].toLowerCase();
        if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return MediaType.IMAGE_JPEG_VALUE;
        if (normalized.endsWith(".webp")) return "image/webp";
        if (normalized.endsWith(".gif")) return "image/gif";
        return MediaType.IMAGE_PNG_VALUE;
    }

    private static String extensionFor(String contentType) {
        return switch (contentType.toLowerCase()) {
            case MediaType.IMAGE_JPEG_VALUE -> ".jpg";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> ".png";
        };
    }

    // ==================== 错误处理 ====================

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
            log.debug("sub2api error response is not JSON: {}", body);
        }
        return body;
    }

    /**
     * sub2api 偶尔把 JSON 错误响应标成非 application/json 的 content-type，
     * 放宽 Jackson 转换器可接受的媒体类型，避免解析失败掩盖真实错误信息。
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

    private static long positiveTimeout(Long configured, long fallback) {
        return configured != null && configured > 0 ? configured : fallback;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record ReferenceImage(byte[] content, String contentType) {}

    private static final class NamedByteArrayResource extends ByteArrayResource {
        private final String filename;

        NamedByteArrayResource(byte[] byteArray, String filename) {
            super(byteArray);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Sub2ApiImageResponse(String id, Long created, List<Item> data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Item(String url, @JsonProperty("b64_json") String b64Json) {}
    }
}
