package com.ym.ai_story_studio_server.budget;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.provider.TextModelRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** Conservative configured cost bounds, never an invented actual supplier bill. */
@Component
public class TextBudgetPolicy {
    private final TextBudgetProperties properties;
    private final Clock clock;

    @Autowired
    public TextBudgetPolicy(TextBudgetProperties properties) {
        this(properties, Clock.systemUTC());
    }

    TextBudgetPolicy(TextBudgetProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public record Quote(String model, String revision, Instant verifiedAt, String reference,
                        String responseModel, long maxInputTokens, int maxOutputTokens,
                        BigDecimal inputRate, BigDecimal outputRate, BigDecimal ceilingCny) {}

    public Quote quote(String model, int maxTokens) {
        var rate = properties.getQuotes() == null ? null : properties.getQuotes().get(model);
        Instant now = clock.instant();
        if (!properties.isEnabled() || rate == null || !text(rate.getRevision(), 128)
                || !text(rate.getReference(), 512) || !text(rate.getResponseModel(), 128)
                || rate.getVerifiedAt() == null || rate.getVerifiedAt().isAfter(now)
                || rate.getVerifiedAt().isBefore(now.minus(Duration.ofDays(7)))
                || rate.getMaxBilledInputTokens() == null || rate.getMaxBilledInputTokens() < 1
                || rate.getMaxBilledInputTokens() > 10_000_000
                || !validRate(rate.getInputCnyPerMillion()) || !validRate(rate.getOutputCnyPerMillion())
                || maxTokens < 1 || maxTokens > 32768) {
            throw new BusinessException(ResultCode.CONFIG_ERROR, "文本预算或已核验价格配置缺失、过期或不合法");
        }
        BigDecimal ceiling = rate.getInputCnyPerMillion().multiply(BigDecimal.valueOf(rate.getMaxBilledInputTokens()))
                .add(rate.getOutputCnyPerMillion().multiply(BigDecimal.valueOf(maxTokens)))
                .divide(BigDecimal.valueOf(1_000_000), 6, RoundingMode.CEILING);
        return new Quote(model, rate.getRevision(), rate.getVerifiedAt(), rate.getReference(),
                rate.getResponseModel(), rate.getMaxBilledInputTokens(), maxTokens,
                rate.getInputCnyPerMillion(), rate.getOutputCnyPerMillion(), ceiling);
    }

    private boolean validRate(BigDecimal value) {
        return value != null && value.signum() > 0 && value.scale() <= 6
                && value.compareTo(BigDecimal.valueOf(1_000_000)) <= 0;
    }

    private boolean text(String value, int maximum) {
        return value != null && !value.isBlank() && value.length() <= maximum;
    }
}
