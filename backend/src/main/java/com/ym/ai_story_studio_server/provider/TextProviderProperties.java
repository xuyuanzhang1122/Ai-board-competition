package com.ym.ai_story_studio_server.provider;

import lombok.Data;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Separate namespace deliberately avoids copied credentials from former clients. */
@Data
@Component
@ConfigurationProperties(prefix = "ai.text-providers")
public class TextProviderProperties {
    private boolean unlimitedText;
    private Endpoint deepseek = new Endpoint("https://api.deepseek.com");
    private Endpoint mimo = new Endpoint("https://api.xiaomimimo.com/v1");

    @Data
    public static class Endpoint {
        private boolean enabled;
        private String baseUrl;
        @ToString.Exclude
        private String apiKey;

        public Endpoint(String baseUrl) {
            this.baseUrl = baseUrl;
        }
    }
}
