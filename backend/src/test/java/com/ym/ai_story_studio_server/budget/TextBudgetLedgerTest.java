package com.ym.ai_story_studio_server.budget;

import com.ym.ai_story_studio_server.exception.BusinessException;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;

class TextBudgetLedgerTest {
    private JdbcTemplate jdbc;
    private TextBudgetLedger ledger;
    private DataSourceTransactionManager transactions;
    private TextBudgetPolicy.Quote quote;

    @BeforeEach
    void setup() throws Exception {
        var source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(source);
        transactions = new DataSourceTransactionManager(source);
        try (var connection = source.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V34__generation_budget_ledger.sql"));
        }
        ledger = new TextBudgetLedger(jdbc, transactions);
        var props = TextBudgetPolicyTest.configured();
        props.getQuotes().get("deepseek-flash").setMaxBilledInputTokens(1_000_000L);
        props.getQuotes().get("deepseek-flash").setInputCnyPerMillion(new BigDecimal("8"));
        quote = TextBudgetPolicyTest.policy(props).quote("deepseek-flash", 128);
    }

    @AfterEach
    void close() { if (jdbc != null) jdbc.execute("SHUTDOWN"); }

    @Test
    void concurrentCallsShareOneTwentyYuanCap() throws Exception {
        var pool = Executors.newFixedThreadPool(3);
        var start = new CountDownLatch(1);
        try {
            Callable<Boolean> reserve = () -> {
                start.await();
                try { ledger.reserve(quote, 42L); return true; }
                catch (BusinessException expected) { return false; }
            };
            var a = pool.submit(reserve); var b = pool.submit(reserve); var c = pool.submit(reserve);
            start.countDown();
            int winners = (a.get(5, TimeUnit.SECONDS) ? 1 : 0) + (b.get(5, TimeUnit.SECONDS) ? 1 : 0)
                    + (c.get(5, TimeUnit.SECONDS) ? 1 : 0);
            assertThat(winners).isEqualTo(2);
            assertThat(ledger.status().limitCny()).isEqualByComparingTo("20");
            assertThat(ledger.status().reservedCny()).isEqualByComparingTo("16.001024");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM generation_budget_reservations", Integer.class)).isEqualTo(2);
        } finally { pool.shutdownNow(); }
    }

    @Test
    void reservationSurvivesBusinessRollbackAndServiceRecreation() {
        jdbc.execute("CREATE TABLE business_probe(id INT)");
        var outer = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> outer.execute(status -> {
            jdbc.update("INSERT INTO business_probe VALUES(1)");
            ledger.reserve(quote, 42L);
            throw new IllegalStateException("business failed after potential acceptance");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM business_probe", Integer.class)).isZero();
        assertThat(new TextBudgetLedger(jdbc, transactions).status().reservedCny()).isEqualByComparingTo("8.000512");
        assertThat(ledger.status().unresolvedCount()).isEqualTo(1);
    }

    @Test
    void failedAuditInsertRollsBackCapacityAndUnownedCallsCannotReserve() {
        assertThatThrownBy(() -> ledger.reserve(quote, null)).isInstanceOf(BusinessException.class);
        jdbc.execute("DROP TABLE generation_budget_reservations");
        assertThatThrownBy(() -> ledger.reserve(quote, 42L)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT reserved_cny FROM generation_budget_accounts WHERE id=1", BigDecimal.class))
                .isEqualByComparingTo("0");
    }

    @Test
    void completedAuditSurvivesOuterRollback() {
        var reservation = ledger.reserve(quote, 42L);
        assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(status -> {
            ledger.complete(reservation, new TextBudgetLedger.Usage("deepseek-flash", "accepted", 5, 3, 8));
            throw new IllegalStateException("later job write failed");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(ledger.status().unresolvedCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT provider_request_id FROM generation_budget_reservations", String.class))
                .isEqualTo("accepted");
    }

    @Test
    void successfulUsageIsAuditedAndNeverRefundedOrOverwrittenByDuplicateOutcome() {
        var reservation = ledger.reserve(quote, 42L);
        ledger.complete(reservation, new TextBudgetLedger.Usage("deepseek-flash", "req-1", 5, 3, 8));
        ledger.requireReview(reservation, TextBudgetLedger.ReviewReason.TRANSPORT_ERROR);
        ledger.complete(reservation, new TextBudgetLedger.Usage("wrong-model", "late", null, null, null));
        assertThat(ledger.status().reservedCny()).isEqualByComparingTo("8.000512");
        assertThat(ledger.status().blockedReason()).isNull();
        assertThat(ledger.status().unresolvedCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT provider_request_id FROM generation_budget_reservations", String.class)).isEqualTo("req-1");
        assertThat(jdbc.queryForObject("SELECT input_tokens FROM generation_budget_reservations", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT actual_cost_cny FROM generation_budget_reservations", BigDecimal.class)).isNull();
    }

    @Test
    void unknownTransportOutcomeKeepsFullReservationAndFreezesFurtherCalls() {
        var reservation = ledger.reserve(quote, 42L);
        ledger.requireReview(reservation, TextBudgetLedger.ReviewReason.TRANSPORT_ERROR);
        assertThat(ledger.status().reservedCny()).isEqualByComparingTo("8.000512");
        assertThat(ledger.status().blockedReason()).isEqualTo("TRANSPORT_ERROR");
        assertThatThrownBy(() -> ledger.reserve(quote, 42L)).isInstanceOf(BusinessException.class);
    }

    @Test
    void missingExcessiveInconsistentUsageOrChangedModelRequiresReview() {
        for (var usage : new TextBudgetLedger.Usage[]{
                new TextBudgetLedger.Usage("deepseek-flash", "unknown", null, null, 8),
                new TextBudgetLedger.Usage("other-model", "other", 5, 3, 8),
                new TextBudgetLedger.Usage("deepseek-flash", "overflow", 5, 129, 134),
                new TextBudgetLedger.Usage("deepseek-flash", "inconsistent", 5, 3, 7)}) {
            jdbc.update("UPDATE generation_budget_accounts SET blocked_reason=NULL WHERE id=1");
            // Smaller synthetic ceiling allows all four probes within the same 20 CNY account.
            var small = TextBudgetPolicyTest.policy(TextBudgetPolicyTest.configured()).quote("deepseek-flash", 128);
            var reservation = ledger.reserve(small, 42L);
            ledger.complete(reservation, usage);
            assertThat(ledger.status().blockedReason()).isNotBlank();
            assertThatThrownBy(() -> ledger.reserve(small, 42L)).isInstanceOf(BusinessException.class);
        }
        assertThat(ledger.status().unresolvedCount()).isEqualTo(4);
    }
}
