// {{CODE-Cycle-Integration:
//   Task_ID: [#AI-SERVICE-001]
//   Timestamp: [2025-12-28 22:00:00]
//   Phase: [D-Develop]
//   Context-Analysis: "创建AI服务配置属性类,用于读取 provider 与文本/图片/视频模型配置。"
//   Principle_Applied: "SOLID原则-单一职责, Spring Boot配置绑定最佳实践"
// }}
// {{START_MODIFICATIONS}}
package com.ym.ai_story_studio_server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * AI服务配置属性类
 *
 * <p>从application.yml读取 GeekNow 以及文本、图片、视频模型配置。
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "ai")
public class AiProperties {

    /**
     * Geeknow 默认 provider 配置
     */
    private Geeknow geeknow = new Geeknow();

    /**
     * sudashuiapi Seedance 视频 provider 配置（视频生成专用）
     */
    private SudashuiVideo sudashuiVideo = new SudashuiVideo();

    /**
     * sub2api GPT Image 2 4K 渠道配置（图片生成专用）
     */
    private Sub2ApiImage sub2ApiImage = new Sub2ApiImage();

    /**
     * 文本生成模型配置
     */
    private Text text = new Text();

    /**
     * 图片生成模型配置
     */
    private Image image = new Image();

    /**
     * 视频生成模型配置
     */
    private Video video = new Video();

    /**
     * Geeknow 默认 provider 配置类
     */
    @Data
    public static class Geeknow {
        /**
         * API基础URL
         */
        private String baseUrl = "https://www.geeknow.top";

        /**
         * GeekNow 备用 API 基础URL，仅在主域名连接失败或返回5xx时使用。
         */
        private String fallbackBaseUrl = "https://geeknow.ai";

        /**
         * API密钥
         */
        private String apiKey;

        /**
         * 请求超时时间（毫秒）
         */
        private Long timeout = 60000L;

        /**
         * 连接超时时间（毫秒）
         */
        private Long connectTimeout = 10000L;

        /**
         * 读取超时时间（毫秒）
         */
        private Long readTimeout = 60000L;
    }

    /**
     * 文本生成模型配置类
     */
    @Data
    public static class Text {
        /**
         * 默认模型
         */
        private String model = "deepseek-flash";

        /**
         * 最大token数
         */
        private Integer maxTokens = 4096;

        /**
         * 温度参数（0-1，越高越随机）
         */
        private Double temperature = 0.7;

        /**
         * 采样参数
         */
        private Double topP = 0.9;
    }

    /**
     * 图片生成模型配置类
     */
    @Data
    public static class Image {
        /**
         * 默认模型
         */
        private String defaultModel = "gemini-3-pro-image-preview";

        /**
         * 默认画幅比例
         */
        private String defaultAspectRatio = "16:9";

        /**
         * 默认生成数量
         */
        private Integer defaultCount = 1;

        /**
         * 异步图片任务轮询间隔（毫秒）
         */
        private Long pollInterval = 5000L;

        /**
         * 异步图片任务最大轮询次数
         */
        private Integer maxPollCount = 100;

    }

    /**
     * sudashuiapi Seedance 视频 provider 配置类。
     *
     * <p>接口为 {@code POST /v1/video/generations} 与
     * {@code GET /v1/video/generations/{task_id}}。
     */
    @Data
    public static class SudashuiVideo {
        /**
         * API基础URL
         */
        private String baseUrl = "https://api.sudashuiapi.com";

        /**
         * API密钥
         */
        private String apiKey;

        /**
         * 请求超时时间（毫秒）
         */
        private Long connectTimeout = 10_000L;

        /**
         * 读超时时间（毫秒）
         */
        private Long readTimeout = 120_000L;
    }

    /**
     * sub2api GPT Image 2 4K 渠道配置类（OpenAI 兼容 /v1/images/*）。
     */
    @Data
    public static class Sub2ApiImage {
        /**
         * API基础URL
         */
        private String baseUrl = "https://qs.szscp.com/v1";

        /**
         * API密钥
         */
        private String apiKey;

        /**
         * 连接超时时间（毫秒）
         */
        private Long connectTimeout = 15_000L;

        /**
         * 读取超时时间（毫秒；4K多图/图生图上游生成耗时可超过3分钟，
         * 响应以b64_json整体返回，需给足等待时间）
         */
        private Long readTimeout = 300_000L;
    }

    /**
     * 视频生成模型配置类
     */
    @Data
    public static class Video {
        /**
         * 默认模型
         */
        private String model = "sd-api-2-fast-720p";

        /**
         * 默认画幅比例
         */
        private String defaultAspectRatio = "16:9";

        /**
         * 默认时长（秒）
         */
        private Integer defaultDuration = 5;

        /**
         * 最大时长（秒）
         */
        private Integer maxDuration = 15;

        /**
         * 轮询间隔（毫秒）
         */
        private Long pollInterval = 15000L;

        /**
         * 最大轮询次数
         */
        private Integer maxPollCount = 80;

        /**
         * 项目风格 3DGC动漫 对应的视频生成前置提示词（留空则不追加）
         */
        private String stylePrompt3dgc = "";

        /**
         * 项目风格 写实 对应的视频生成前置提示词（留空则不追加）
         */
        private String stylePromptRealistic = "";

        /**
         * 按项目风格代码解析视频生成前置提示词；未知/空风格返回空字符串。
         */
        public String resolveStylePromptPrefix(String styleCode) {
            if (styleCode == null) {
                return "";
            }
            return switch (styleCode.trim().toUpperCase()) {
                case "3DGC" -> stylePrompt3dgc == null ? "" : stylePrompt3dgc;
                case "REALISTIC" -> stylePromptRealistic == null ? "" : stylePromptRealistic;
                default -> "";
            };
        }
    }

}

// {{END_MODIFICATIONS}}
