package com.ym.ai_story_studio_server.budget;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/** No real prices are supplied by defaults; each quote needs account-side verification. */
@Data
@Component
@ConfigurationProperties(prefix = "competition.text-budget")
public class TextBudgetProperties {
    private boolean enabled;
    private Map<String, RateQuote> quotes = new HashMap<>();

    @Data
    public static class RateQuote {
        private String revision;
        private Instant verifiedAt;
        private String reference;
        private String responseModel;
        private Long maxBilledInputTokens;
        private BigDecimal inputCnyPerMillion;
        private BigDecimal outputCnyPerMillion;
    }
}
