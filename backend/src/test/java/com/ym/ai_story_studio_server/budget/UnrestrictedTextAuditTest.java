package com.ym.ai_story_studio_server.budget;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import static org.assertj.core.api.Assertions.*;

class UnrestrictedTextAuditTest {
    @Test void preservesTruncatedUsageAndAllowsNextCallWithoutAnyBudgetAccount() throws Exception {
        var source=new JdbcDataSource();source.setURL("jdbc:h2:mem:"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1");
        var jdbc=new JdbcTemplate(source);
        try(var connection=source.getConnection()){ScriptUtils.executeSqlScript(connection,new ClassPathResource("db/migration/V37__unrestricted_text_call_audit.sql"));}
        var ledger=new TextBudgetLedger(jdbc,new DataSourceTransactionManager(source));
        try {
            String first=ledger.beginUnrestricted("mimo-new-model",42L);
            ledger.completeUnrestricted(first,new TextBudgetLedger.Usage("response-model","req-observed",7,128,135),TextBudgetLedger.ReviewReason.INVALID_RESPONSE);
            assertThat(jdbc.queryForObject("SELECT input_tokens FROM text_call_audits WHERE id=?",Integer.class,first)).isEqualTo(7);
            assertThat(jdbc.queryForObject("SELECT status FROM text_call_audits WHERE id=?",String.class,first)).isEqualTo("REVIEW_REQUIRED");
            String next=ledger.beginUnrestricted("mimo-new-model",42L);
            ledger.completeUnrestricted(next,new TextBudgetLedger.Usage("response-model","req-next",8,3,11),null);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM text_call_audits",Integer.class)).isEqualTo(2);
        } finally {jdbc.execute("SHUTDOWN");}
    }
}
