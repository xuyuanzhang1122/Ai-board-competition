package com.ym.ai_story_studio_server.provider;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TextModelMigrationTest {
    @Test
    void migrationKeepsHistoryAndNeverAutomaticallyEnablesNewTextModels() throws Exception {
        var source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        var jdbc = new JdbcTemplate(source);
        try {
            jdbc.execute("""
                CREATE TABLE ai_models(id BIGINT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(100) UNIQUE,
                  name VARCHAR(200), type VARCHAR(50), provider VARCHAR(100), enabled INT,
                  sort_order INT, description VARCHAR(1024))
                """);
            jdbc.execute("CREATE TABLE pricing_rules(biz_type VARCHAR(50), enabled INT)");
            jdbc.update("INSERT INTO ai_models(code,name,type,provider,enabled) VALUES('gemini-3.5-flash','old','LANGUAGE','Geeknow',1)");
            jdbc.update("INSERT INTO ai_models(code,name,type,provider,enabled) VALUES('deepseek-v4-pro','old-pro','LANGUAGE','DeepSeek',1)");
            jdbc.update("INSERT INTO ai_models(code,name,type,provider,enabled) VALUES('old-image','image','IMAGE','old',1)");
            jdbc.update("INSERT INTO pricing_rules VALUES('TEXT_GENERATION',1),('IMAGE_GENERATION',1)");
            try (var connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection,
                        new ClassPathResource("db/migration/V33__stage_official_text_models.sql"));
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models WHERE type='LANGUAGE' AND enabled=1", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models WHERE code='gemini-3.5-flash'", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models WHERE code IN ('deepseek-flash','deepseek-v4-pro','mimo-v2.6-pro')", Integer.class)).isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT enabled FROM ai_models WHERE code='old-image'", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT enabled FROM pricing_rules WHERE biz_type='TEXT_GENERATION'", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT enabled FROM pricing_rules WHERE biz_type='IMAGE_GENERATION'", Integer.class)).isEqualTo(1);
        } finally {
            jdbc.execute("SHUTDOWN");
        }
    }
}
