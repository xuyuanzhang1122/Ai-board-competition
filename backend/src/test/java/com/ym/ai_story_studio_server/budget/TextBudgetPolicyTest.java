package com.ym.ai_story_studio_server.budget;

import com.ym.ai_story_studio_server.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.*;

class TextBudgetPolicyTest {
    static final Instant NOW = Instant.parse("2026-10-19T00:00:00Z");

    static TextBudgetProperties configured() {
        var props = new TextBudgetProperties();
        props.setEnabled(true);
        var quote = new TextBudgetProperties.RateQuote();
        quote.setRevision("offline-test-v1");
        quote.setVerifiedAt(NOW);
        quote.setReference("Synthetic test data, not supplier pricing");
        quote.setResponseModel("deepseek-flash");
        quote.setMaxBilledInputTokens(1000L);
        quote.setInputCnyPerMillion(new BigDecimal("2"));
        quote.setOutputCnyPerMillion(new BigDecimal("4"));
        props.getQuotes().put("deepseek-flash", quote);
        return props;
    }

    static TextBudgetPolicy policy(TextBudgetProperties props) {
        return new TextBudgetPolicy(props, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void requiresExplicitBudgetEnablementAndVerifiedQuote() {
        assertThatThrownBy(() -> policy(new TextBudgetProperties()).quote("deepseek-flash", 128))
                .isInstanceOf(BusinessException.class);
        var props = configured();
        assertThatThrownBy(() -> policy(props).quote("mimo-v2.6-pro", 128)).isInstanceOf(BusinessException.class);
        props.getQuotes().get("deepseek-flash").setReference(" ");
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
    }

    @Test
    void bindsModelCodesWithHyphensAndUtcVerificationTimeInTheNewNamespace() {
        String base = "competition.text-budget.quotes.deepseek-flash.";
        var values = new java.util.HashMap<String, Object>();
        values.put("competition.text-budget.enabled", "true");
        values.put(base + "revision", "synthetic-binding-v1");
        values.put(base + "verified-at", NOW.toString());
        values.put(base + "reference", "Synthetic binding test");
        values.put(base + "response-model", "deepseek-flash");
        values.put(base + "max-billed-input-tokens", "1000");
        values.put(base + "input-cny-per-million", "2");
        values.put(base + "output-cny-per-million", "4");
        var source = new org.springframework.boot.context.properties.source.MapConfigurationPropertySource(values);
        var props = new org.springframework.boot.context.properties.bind.Binder(source).bind("competition.text-budget",
                org.springframework.boot.context.properties.bind.Bindable.of(TextBudgetProperties.class)).get();
        assertThat(props.getQuotes()).containsKey("deepseek-flash");
        assertThat(policy(props).quote("deepseek-flash", 128).ceilingCny()).isEqualByComparingTo("0.002512");
    }

    @Test
    void pricesFullInputBoundPlusOutputLimitAndRoundsUpNotDown() {
        var props = configured();
        var quote = policy(props).quote("deepseek-flash", 128);
        assertThat(quote.ceilingCny()).isEqualByComparingTo("0.002512");
        assertThat(quote.maxInputTokens()).isEqualTo(1000);
        props.getQuotes().get("deepseek-flash").setMaxBilledInputTokens(1L);
        props.getQuotes().get("deepseek-flash").setInputCnyPerMillion(new BigDecimal("0.000001"));
        props.getQuotes().get("deepseek-flash").setOutputCnyPerMillion(new BigDecimal("0.000001"));
        assertThat(policy(props).quote("deepseek-flash", 1).ceilingCny()).isEqualByComparingTo("0.000001");
        assertThat(quote.maxInputTokens()).isEqualTo(1000); // immutable reservation snapshot
    }

    @Test
    void rejectsStaleFutureNegativeOverpreciseAndUnboundedQuotes() {
        var props = configured();
        var rate = props.getQuotes().get("deepseek-flash");
        rate.setVerifiedAt(NOW.minusSeconds(7 * 86400L + 1));
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
        rate.setVerifiedAt(NOW.plusSeconds(1));
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
        rate.setVerifiedAt(NOW);
        rate.setInputCnyPerMillion(BigDecimal.ZERO);
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
        rate.setInputCnyPerMillion(new BigDecimal("-1"));
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
        rate.setInputCnyPerMillion(new BigDecimal("0.1234567"));
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
        rate.setInputCnyPerMillion(BigDecimal.ONE); rate.setMaxBilledInputTokens(Long.MAX_VALUE);
        assertThatThrownBy(() -> policy(props).quote("deepseek-flash", 128)).isInstanceOf(BusinessException.class);
    }
}
