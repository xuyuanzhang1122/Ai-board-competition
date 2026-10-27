package com.ym.ai_story_studio_server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Business defaults only. Provider endpoints and credentials live in their own verified namespaces. */
@Data
@Configuration
@ConfigurationProperties(prefix = "ai")
public class AiProperties {
    private Text text = new Text();
    private Image image = new Image();
    private Video video = new Video();

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
        private String defaultModel; // No unverified media default.

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
     * 视频生成模型配置类
     */
    @Data
    public static class Video {
        /**
         * 默认模型
         */
        private String model; // No unverified media default.

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

    }

}
