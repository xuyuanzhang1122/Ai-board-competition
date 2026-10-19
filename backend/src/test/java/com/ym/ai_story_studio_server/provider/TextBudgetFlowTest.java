package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.budget.*;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.util.UserContext;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/** Real policy + production ledger SQL + mock HTTP; no application config or external service. */
class TextBudgetFlowTest {
    private JdbcTemplate jdbc;
    private TextBudgetLedger ledger;
    private OfficialTextProvider provider;
    private MockRestServiceServer server;

    @BeforeEach
    void setup() throws Exception {
        var source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(source);
        try (var connection = source.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V34__generation_budget_ledger.sql"));
        }
        ledger = new TextBudgetLedger(jdbc, new DataSourceTransactionManager(source));
        var budgets = new TextBudgetProperties();
        budgets.setEnabled(true);
        var rate = new TextBudgetProperties.RateQuote();
        rate.setRevision("synthetic-v1"); rate.setReference("Offline fixture, not actual prices");
        rate.setVerifiedAt(Instant.now()); rate.setResponseModel("deepseek-flash");
        rate.setMaxBilledInputTokens(1000L);
        rate.setInputCnyPerMillion(new BigDecimal("2")); rate.setOutputCnyPerMillion(new BigDecimal("4"));
        budgets.getQuotes().put("deepseek-flash", rate);
        var policy = new TextBudgetPolicy(budgets);
        var properties = new TextProviderProperties();
        properties.getDeepseek().setEnabled(true); properties.getDeepseek().setApiKey("test-only-key");
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new OfficialTextProvider(properties, builder, mock(TextModelAccess.class), policy, ledger);
        UserContext.setUserId(42L);
    }

    @AfterEach
    void close() { UserContext.clear(); if (jdbc != null) jdbc.execute("SHUTDOWN"); }

    @Test
    void actualLedgerCommitsBeforeHttpAndRejectsNextRequestAtCapacity() {
        jdbc.update("UPDATE generation_budget_accounts SET limit_cny=0.002512 WHERE id=1");
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andExpect(request -> assertThat(ledger.status().reservedCny()).isEqualByComparingTo("0.002512"))
                .andRespond(withSuccess("""
                    {"id":"req-real-flow","model":"deepseek-flash","choices":[{"message":{"content":"八仙传说"},"finish_reason":"stop"}],
                     "usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}
                    """, MediaType.APPLICATION_JSON));
        var result = provider.generateText("八仙过海", "deepseek-flash", 128, 0.7, 0.9);
        assertThat(result.budgetReservationId()).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT provider_request_id FROM generation_budget_reservations WHERE id=?",
                String.class, result.budgetReservationId())).isEqualTo("req-real-flow");
        assertThat(ledger.status().unresolvedCount()).isZero();
        assertThatThrownBy(() -> provider.generateText("第二次", "deepseek-flash", 128, 0.7, 0.9))
                .isInstanceOf(BusinessException.class).hasMessageContaining("预算");
        server.verify();
    }

    @Test
    void transportUncertaintyFreezesLedgerAndPreventsAnotherHttpPost() {
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andRespond(withException(new IOException("synthetic drop")));
        assertThatThrownBy(() -> provider.generateText("八仙过海", "deepseek-flash", 128, 0.7, 0.9))
                .isInstanceOf(BusinessException.class);
        assertThat(ledger.status().blockedReason()).isEqualTo("TRANSPORT_ERROR");
        assertThat(ledger.status().reservedCny()).isEqualByComparingTo("0.002512");
        assertThatThrownBy(() -> provider.generateText("再试一次", "deepseek-flash", 128, 0.7, 0.9))
                .isInstanceOf(BusinessException.class).hasMessageContaining("待核对");
        server.verify();
    }

    @Test
    void explicitlyInvalidTotalUsageIsNotSilentlyReconstructedAsSuccessfulUsage() {
        for (String invalid : new String[]{"-1", "1.5", "\"8\"", "2147483648"}) {
            jdbc.update("UPDATE generation_budget_accounts SET blocked_reason=NULL WHERE id=1");
            server.reset();
            server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                    .andRespond(withSuccess("""
                        {"id":"bad-total","model":"deepseek-flash","choices":[{"message":{"content":"草稿"},"finish_reason":"stop"}],
                         "usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":%s}}
                        """.formatted(invalid), MediaType.APPLICATION_JSON));
            var result = provider.generateText("八仙过海", "deepseek-flash", 128, 0.7, 0.9);
            assertThat(ledger.status().blockedReason()).isEqualTo("INVALID_USAGE");
            assertThat(jdbc.queryForObject("SELECT total_tokens FROM generation_budget_reservations WHERE id=?",
                    Integer.class, result.budgetReservationId())).isNull();
            assertThat(jdbc.queryForObject("SELECT input_tokens FROM generation_budget_reservations WHERE id=?",
                    Integer.class, result.budgetReservationId())).isEqualTo(5);
            server.verify();
        }
    }

    @Test
    void truncatedResponseStillRecordsKnownUsageAndProviderRequestIdForReview() {
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andRespond(withSuccess("""
                    {"id":"truncated-1","model":"deepseek-flash","choices":[{"message":{"content":"部分草稿"},"finish_reason":"length"}],
                     "usage":{"prompt_tokens":5,"completion_tokens":128,"total_tokens":133}}
                    """, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.generateText("八仙过海", "deepseek-flash", 128, 0.7, 0.9))
                .isInstanceOf(BusinessException.class);
        assertThat(ledger.status().blockedReason()).isEqualTo("INVALID_RESPONSE");
        assertThat(jdbc.queryForObject("SELECT provider_request_id FROM generation_budget_reservations", String.class))
                .isEqualTo("truncated-1");
        assertThat(jdbc.queryForObject("SELECT input_tokens FROM generation_budget_reservations", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT output_tokens FROM generation_budget_reservations", Integer.class)).isEqualTo(128);
        assertThat(jdbc.queryForObject("SELECT total_tokens FROM generation_budget_reservations", Integer.class)).isEqualTo(133);
        assertThat(ledger.status().reservedCny()).isEqualByComparingTo("0.002512");
        server.verify();
    }
}
