package com.ym.ai_story_studio_server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 存储服务配置属性类
 *
 * <p>从application.yml中绑定storage配置项，支持多种存储提供商
 *
 * <p>配置示例：
 * <pre>
 * storage:
 *   provider: cos
 *   cos:
 *     secret-id: ${COS_SECRET_ID:}
 *     secret-key: ${COS_SECRET_KEY:}
 *     region: ap-guangzhou
 *     bucket: examplebucket-1250000000
 *     url-prefix: https://cdn.example.com   # 可选，CDN/自定义域名
 *   local:
 *     base-path: ./uploads
 *     url-prefix: /uploads
 * </pre>
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Data
@Component
@ConfigurationProperties(prefix = "storage")
public class StorageProperties {

    /**
     * 存储提供商类型
     * <p>支持: local (本地文件), cos (腾讯云COS)
     */
    private String provider = "local";

    /**
     * 腾讯云COS配置
     */
    private CosConfig cos = new CosConfig();

    /**
     * 本地文件存储配置
     */
    private LocalConfig local = new LocalConfig();

    /**
     * 腾讯云COS配置项
     *
     * <p>参考官方文档: <a href="https://cloud.tencent.com/document/product/436/11365">COS Java SDK</a>
     */
    @Data
    public static class CosConfig {

        /**
         * 访问密钥SecretId
         * <p>生产环境强烈建议通过环境变量配置: ${COS_SECRET_ID}
         */
        private String secretId;

        /**
         * 访问密钥SecretKey
         * <p>生产环境强烈建议通过环境变量配置: ${COS_SECRET_KEY}
         */
        private String secretKey;

        /**
         * 区域代码
         * <p>例如: ap-guangzhou、ap-beijing、ap-shanghai
         */
        private String region;

        /**
         * 存储桶名称（含APPID后缀）
         * <p>例如: examplebucket-1250000000
         */
        private String bucket;

        /**
         * URL前缀（可选）
         * <p>用于CDN加速或自定义域名，例如: https://cdn.example.com
         * <p>如果为空，则使用默认COS域名 https://{bucket}.cos.{region}.myqcloud.com
         */
        private String urlPrefix;
    }

    /**
     * 本地文件存储配置项
     */
    @Data
    public static class LocalConfig {

        /**
         * 本地文件保存根目录
         * <p>支持相对路径和绝对路径。相对路径基于应用启动目录解析。
         */
        private String basePath = "./uploads";

        /**
         * 对外访问URL前缀
         * <p>默认由Spring静态资源映射暴露为 /uploads/**
         */
        private String urlPrefix = "/uploads";
    }
}
