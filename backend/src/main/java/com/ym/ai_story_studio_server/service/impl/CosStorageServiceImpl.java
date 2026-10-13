package com.ym.ai_story_studio_server.service.impl;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.ClientConfig;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.auth.COSCredentials;
import com.qcloud.cos.exception.CosClientException;
import com.qcloud.cos.exception.CosServiceException;
import com.qcloud.cos.http.HttpMethodName;
import com.qcloud.cos.http.HttpProtocol;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.model.PutObjectRequest;
import com.qcloud.cos.region.Region;
import com.ym.ai_story_studio_server.config.StorageProperties;
import com.ym.ai_story_studio_server.exception.StorageException;
import com.ym.ai_story_studio_server.service.StorageService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 腾讯云COS存储服务实现
 *
 * <p>基于腾讯云对象存储（COS）实现文件存储功能，包括:
 * <ul>
 *   <li>文件上传（支持流式上传）</li>
 *   <li>文件下载（返回输入流）</li>
 *   <li>文件删除</li>
 *   <li>预签名URL生成（临时授权访问）</li>
 * </ul>
 *
 * <p>安全特性:
 * <ul>
 *   <li>文件类型白名单验证</li>
 *   <li>UUID防重名机制</li>
 *   <li>按日期分层存储</li>
 * </ul>
 *
 * <p>官方文档: <a href="https://cloud.tencent.com/document/product/436/11365">COS Java SDK</a>
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "storage.provider", havingValue = "cos")
public class CosStorageServiceImpl implements StorageService {

    private static final String OBJECT_PREFIX = "aiboard";
    /** AI生成结果/Excel导入图片的独立前缀，对象存储侧按此前缀配置15天生命周期规则 */
    private static final String ASSET_PREFIX = "assets";
    private static final String DEFAULT_LOCAL_URL_PREFIX = "/uploads";

    private final StorageProperties storageProperties;
    private COSClient cosClient;
    private final ConcurrentMap<String, String> legacyLocalMigrationCache = new ConcurrentHashMap<>();

    /**
     * 支持的文件类型白名单
     */
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            // 图片格式
            "image/jpeg", "image/jpg", "image/png", "image/gif",
            "image/webp", "image/bmp", "image/svg+xml",
            // 视频格式
            "video/mp4", "video/webm", "video/ogg", "video/avi",
            "video/quicktime", "video/x-msvideo"
    );

    /**
     * 日期格式化器（用于生成文件路径）
     */
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    public CosStorageServiceImpl(StorageProperties storageProperties) {
        this.storageProperties = storageProperties;
    }

    /**
     * 初始化COS客户端
     */
    @PostConstruct
    public void init() {
        log.info("正在初始化腾讯云COS存储服务...");

        StorageProperties.CosConfig cosConfig = storageProperties.getCos();
        if (cosConfig == null) {
            log.warn("COS配置为空，COS存储服务将不可用");
            return;
        }

        try {
            validateConfig(cosConfig);
        } catch (StorageException e) {
            log.warn("COS配置验证失败: {}，COS存储服务将不可用", e.getMessage());
            return;
        }

        try {
            if (cosClient == null) {
                COSCredentials credentials = new BasicCOSCredentials(
                        cosConfig.getSecretId(), cosConfig.getSecretKey());
                ClientConfig clientConfig = new ClientConfig(new Region(cosConfig.getRegion()));
                clientConfig.setHttpProtocol(HttpProtocol.https);
                cosClient = new COSClient(credentials, clientConfig);
                log.info("COS客户端已创建");
            }

            // 测试连接并验证存储桶（网络不可用时跳过验证，服务继续启动）
            try {
                if (!cosClient.doesBucketExist(cosConfig.getBucket())) {
                    log.warn("存储桶不存在: {}，COS上传功能可能不可用", cosConfig.getBucket());
                } else {
                    log.info("腾讯云COS存储服务初始化成功 - Bucket: {}, Region: {}",
                            cosConfig.getBucket(), cosConfig.getRegion());
                }
            } catch (Exception e) {
                log.warn("无法验证COS存储桶（网络可能不可用）: {}，服务将继续启动", e.getMessage());
            }

        } catch (Exception e) {
            log.warn("COS初始化异常: {}，COS存储服务将不可用", e.getMessage());
        }
    }

    /**
     * 关闭COS客户端
     */
    @PreDestroy
    public void shutdown() {
        if (cosClient != null) {
            try {
                cosClient.shutdown();
                log.info("腾讯云COS存储服务已关闭");
            } catch (Exception e) {
                log.error("关闭COS客户端时发生错误", e);
            }
        }
    }

    @Override
    public String upload(InputStream inputStream, String fileName, String contentType) {
        return uploadWithPrefix(inputStream, fileName, contentType, OBJECT_PREFIX);
    }

    @Override
    public String uploadAsset(InputStream inputStream, String fileName, String contentType) {
        return uploadWithPrefix(inputStream, fileName, contentType, ASSET_PREFIX);
    }

    private String uploadWithPrefix(InputStream inputStream, String fileName, String contentType, String prefix) {
        log.info("开始上传文件: fileName={}, contentType={}, prefix={}", fileName, contentType, prefix);

        validateContentType(contentType);

        String fileKey = generateFileKey(fileName, prefix);
        log.debug("生成文件Key: {}", fileKey);

        try {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentType(contentType);

            StorageProperties.CosConfig cosConfig = storageProperties.getCos();
            PutObjectRequest putObjectRequest = new PutObjectRequest(
                    cosConfig.getBucket(), fileKey, inputStream, metadata);
            cosClient.putObject(putObjectRequest);

            String fileUrl = generateFileUrl(fileKey);
            log.info("文件上传成功: fileKey={}, url={}", fileKey, fileUrl);
            return fileUrl;

        } catch (CosServiceException e) {
            log.error("COS上传失败: ErrorCode={}, ErrorMessage={}", e.getErrorCode(), e.getErrorMessage(), e);
            throw new StorageException("UPLOAD_FAILED", "文件上传失败: " + e.getErrorMessage(), e);
        } catch (CosClientException e) {
            log.error("COS客户端上传异常", e);
            throw new StorageException("UPLOAD_FAILED", "文件上传失败: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("文件上传失败", e);
            throw new StorageException("UPLOAD_FAILED", "文件上传失败: " + e.getMessage(), e);
        }
    }

    @Override
    public String uploadImageBytes(byte[] imageBytes, String fileName) {
        log.info("开始上传字节数组: fileName={}, size={} bytes", fileName, imageBytes.length);

        try (ByteArrayInputStream bais = new ByteArrayInputStream(imageBytes)) {
            return upload(bais, fileName, "image/png");
        } catch (StorageException e) {
            throw e;
        } catch (Exception e) {
            log.error("字节数组上传失败", e);
            throw new StorageException("UPLOAD_FAILED", "字节数组上传失败: " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream download(String fileUrl) {
        log.info("开始下载文件: url={}", fileUrl);

        try {
            if (isLegacyLocalUrl(fileUrl)) {
                Path source = resolveLegacyLocalPath(fileUrl);
                if (!Files.isRegularFile(source)) {
                    throw new StorageException("LEGACY_FILE_NOT_FOUND", "历史本地文件不存在: " + fileUrl);
                }
                return Files.newInputStream(source);
            }

            String fileKey = extractFileKeyFromUrl(fileUrl);
            log.debug("提取文件Key: {}", fileKey);

            StorageProperties.CosConfig cosConfig = storageProperties.getCos();
            InputStream inputStream = cosClient.getObject(cosConfig.getBucket(), fileKey)
                    .getObjectContent();

            log.info("文件下载成功: fileKey={}", fileKey);
            return inputStream;

        } catch (CosServiceException e) {
            log.error("COS下载失败: ErrorCode={}, ErrorMessage={}", e.getErrorCode(), e.getErrorMessage(), e);
            throw new StorageException("DOWNLOAD_FAILED", "文件下载失败: " + e.getErrorMessage(), e);
        } catch (StorageException e) {
            throw e;
        } catch (Exception e) {
            log.error("文件下载失败", e);
            throw new StorageException("DOWNLOAD_FAILED", "文件下载失败: " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String fileUrl) {
        log.info("开始删除文件: url={}", fileUrl);

        try {
            String fileKey = extractFileKeyFromUrl(fileUrl);
            log.debug("提取文件Key: {}", fileKey);

            StorageProperties.CosConfig cosConfig = storageProperties.getCos();
            cosClient.deleteObject(cosConfig.getBucket(), fileKey);

            log.info("文件删除成功: fileKey={}", fileKey);

        } catch (CosServiceException e) {
            log.error("COS删除失败: ErrorCode={}, ErrorMessage={}", e.getErrorCode(), e.getErrorMessage(), e);
            throw new StorageException("DELETE_FAILED", "文件删除失败: " + e.getErrorMessage(), e);
        } catch (StorageException e) {
            throw e;
        } catch (Exception e) {
            log.error("文件删除失败", e);
            throw new StorageException("DELETE_FAILED", "文件删除失败: " + e.getMessage(), e);
        }
    }

    @Override
    public String generatePresignedUrl(String fileKey, int expirationMinutes) {
        log.info("生成预签名URL: fileKey={}, expirationMinutes={}", fileKey, expirationMinutes);

        try {
            Date expiration = new Date(System.currentTimeMillis() + expirationMinutes * 60 * 1000L);

            StorageProperties.CosConfig cosConfig = storageProperties.getCos();
            URL url = cosClient.generatePresignedUrl(
                    cosConfig.getBucket(), fileKey, expiration, HttpMethodName.GET);

            log.info("预签名URL生成成功: fileKey={}", fileKey);
            return url.toString();

        } catch (CosClientException e) {
            log.error("预签名URL生成失败", e);
            throw new StorageException("PRESIGNED_URL_FAILED", "预签名URL生成失败: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("预签名URL生成失败", e);
            throw new StorageException("PRESIGNED_URL_FAILED", "预签名URL生成失败: " + e.getMessage(), e);
        }
    }

    @Override
    public String resolveExternalAccessUrl(String fileUrl, int expirationMinutes) {
        if (!StringUtils.hasText(fileUrl)) {
            throw new StorageException("INVALID_URL", "文件URL不能为空");
        }
        if (fileUrl.startsWith("data:")) {
            return fileUrl;
        }
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
            if (!isManagedCosUrl(fileUrl)) {
                return fileUrl;
            }
            return generatePresignedUrl(extractFileKeyFromUrl(fileUrl), expirationMinutes);
        }
        if (isLegacyLocalUrl(fileUrl)) {
            String migratedUrl = legacyLocalMigrationCache.computeIfAbsent(
                    fileUrl,
                    this::migrateLegacyLocalFile
            );
            return generatePresignedUrl(extractFileKeyFromUrl(migratedUrl), expirationMinutes);
        }

        return generatePresignedUrl(normalizeObjectKey(fileUrl), expirationMinutes);
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 验证COS配置完整性
     */
    private void validateConfig(StorageProperties.CosConfig cosConfig) {
        if (!StringUtils.hasText(cosConfig.getSecretId())) {
            throw new StorageException("INVALID_CONFIG", "COS secretId不能为空");
        }
        if (!StringUtils.hasText(cosConfig.getSecretKey())) {
            throw new StorageException("INVALID_CONFIG", "COS secretKey不能为空");
        }
        if (!StringUtils.hasText(cosConfig.getRegion())) {
            throw new StorageException("INVALID_CONFIG", "COS region不能为空");
        }
        if (!StringUtils.hasText(cosConfig.getBucket())) {
            throw new StorageException("INVALID_CONFIG", "COS bucket不能为空");
        }
    }

    /**
     * 验证文件类型是否在白名单中
     */
    private void validateContentType(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            throw new StorageException("INVALID_CONTENT_TYPE", "文件类型不能为空");
        }

        String mainType = contentType.split(";")[0].trim().toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.contains(mainType)) {
            throw new StorageException("INVALID_CONTENT_TYPE",
                    "不支持的文件类型: " + contentType + "。支持的类型: " + ALLOWED_CONTENT_TYPES);
        }
    }

    /**
     * 生成唯一的文件Key
     *
     * <p>格式: {@code {prefix}/{year}/{month}/{day}/{uuid}_{originalFileName}}
     */
    private String generateFileKey(String originalFileName, String prefix) {
        String datePath = LocalDateTime.now().format(DATE_FORMATTER);
        String uuid = UUID.randomUUID().toString();
        String cleanFileName = cleanFileName(originalFileName);
        return String.format("%s/%s/%s_%s", prefix, datePath, uuid, cleanFileName);
    }

    /**
     * 清理文件名（移除路径和非法字符）
     */
    private String cleanFileName(String fileName) {
        if (!StringUtils.hasText(fileName)) {
            return "unnamed_file";
        }
        String name = fileName;
        int lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (lastSlash >= 0) {
            name = name.substring(lastSlash + 1);
        }
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    /**
     * 生成文件的公共访问URL
     *
     * <p>默认域名格式: {@code https://{bucket}.cos.{region}.myqcloud.com/{key}}
     */
    private String generateFileUrl(String fileKey) {
        StorageProperties.CosConfig cosConfig = storageProperties.getCos();

        if (StringUtils.hasText(cosConfig.getUrlPrefix())) {
            return cosConfig.getUrlPrefix() + "/" + fileKey;
        }

        return String.format("https://%s.cos.%s.myqcloud.com/%s",
                cosConfig.getBucket(), cosConfig.getRegion(), fileKey);
    }

    /**
     * 从完整URL中提取文件Key
     */
    private String extractFileKeyFromUrl(String fileUrl) {
        if (!StringUtils.hasText(fileUrl)) {
            throw new StorageException("INVALID_URL", "文件URL不能为空");
        }

        try {
            URL url = new URL(fileUrl);
            String path = url.getPath();
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            return path;
        } catch (Exception e) {
            throw new StorageException("INVALID_URL", "无法从URL提取文件Key: " + fileUrl, e);
        }
    }

    private boolean isManagedCosUrl(String fileUrl) {
        try {
            URI uri = URI.create(fileUrl);
            String host = uri.getHost();
            if (!StringUtils.hasText(host)) {
                return false;
            }

            StorageProperties.CosConfig cosConfig = storageProperties.getCos();
            if (StringUtils.hasText(cosConfig.getUrlPrefix())) {
                String configuredHost = URI.create(cosConfig.getUrlPrefix()).getHost();
                if (host.equalsIgnoreCase(configuredHost)) {
                    return true;
                }
            }
            String defaultHost = String.format("%s.cos.%s.myqcloud.com",
                    cosConfig.getBucket(), cosConfig.getRegion());
            return host.equalsIgnoreCase(defaultHost);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isLegacyLocalUrl(String fileUrl) {
        String prefix = localUrlPrefix();
        return fileUrl.equals(prefix) || fileUrl.startsWith(prefix + "/");
    }

    private String migrateLegacyLocalFile(String fileUrl) {
        Path source = resolveLegacyLocalPath(fileUrl);
        if (!Files.isRegularFile(source)) {
            throw new StorageException("LEGACY_FILE_NOT_FOUND", "历史本地文件不存在: " + fileUrl);
        }

        String contentType;
        try {
            contentType = Files.probeContentType(source);
        } catch (IOException e) {
            contentType = null;
        }
        if (!StringUtils.hasText(contentType)) {
            contentType = inferContentType(source.getFileName().toString());
        }

        try (InputStream inputStream = Files.newInputStream(source)) {
            String migratedUrl = upload(inputStream, source.getFileName().toString(), contentType);
            log.info("历史本地资源已迁移到COS: local={}, cosKey={}",
                    fileUrl, extractFileKeyFromUrl(migratedUrl));
            return migratedUrl;
        } catch (IOException e) {
            throw new StorageException("LEGACY_MIGRATION_FAILED",
                    "历史本地文件迁移COS失败: " + e.getMessage(), e);
        }
    }

    private Path resolveLegacyLocalPath(String fileUrl) {
        String prefix = localUrlPrefix();
        String fileKey = fileUrl.substring(prefix.length()).replaceFirst("^/+", "");
        StorageProperties.LocalConfig localConfig = storageProperties.getLocal();
        String basePath = localConfig != null && StringUtils.hasText(localConfig.getBasePath())
                ? localConfig.getBasePath()
                : "./uploads";
        Path localRoot = Paths.get(basePath).toAbsolutePath().normalize();
        Path source = localRoot.resolve(fileKey).normalize();
        if (!source.startsWith(localRoot)) {
            throw new StorageException("INVALID_FILE_KEY", "非法本地文件路径");
        }
        return source;
    }

    private String localUrlPrefix() {
        StorageProperties.LocalConfig localConfig = storageProperties.getLocal();
        String prefix = localConfig != null && StringUtils.hasText(localConfig.getUrlPrefix())
                ? localConfig.getUrlPrefix()
                : DEFAULT_LOCAL_URL_PREFIX;
        String normalized = prefix.replaceAll("/+$", "");
        return normalized.startsWith("/") ? normalized : "/" + normalized;
    }

    private String normalizeObjectKey(String fileKey) {
        return fileKey.replace('\\', '/').replaceFirst("^/+", "");
    }

    private String inferContentType(String fileKey) {
        String normalized = fileKey.toLowerCase();
        if (normalized.endsWith(".png")) return "image/png";
        if (normalized.endsWith(".webp")) return "image/webp";
        if (normalized.endsWith(".gif")) return "image/gif";
        if (normalized.endsWith(".svg")) return "image/svg+xml";
        if (normalized.endsWith(".mp4")) return "video/mp4";
        return "image/jpeg";
    }
}
