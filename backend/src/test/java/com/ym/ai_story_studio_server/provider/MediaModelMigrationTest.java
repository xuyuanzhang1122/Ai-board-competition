package com.ym.ai_story_studio_server.provider;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class MediaModelMigrationTest {
    @Test
    void retirementDisablesMediaCatalogAndPricingWithoutDeletingHistory() throws Exception {
        var source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        var jdbc = new JdbcTemplate(source);
        try {
            jdbc.execute("CREATE TABLE ai_models(code VARCHAR(100), type VARCHAR(50), enabled INT)");
            jdbc.execute("CREATE TABLE pricing_rules(biz_type VARCHAR(50), enabled INT)");
            jdbc.execute("CREATE TABLE jobs(id BIGINT, status VARCHAR(32), result_url VARCHAR(200), meta_json VARCHAR(1024))");
            jdbc.update("INSERT INTO ai_models VALUES('old-image',' image ',1),('old-video','VIDEO',1),('deepseek-flash','LANGUAGE',1)");
            jdbc.update("INSERT INTO pricing_rules VALUES('IMAGE_GENERATION',1),('VIDEO_GENERATION',1),('TEXT_GENERATION',1)");
            jdbc.update("INSERT INTO jobs VALUES(1,'SUCCEEDED','/uploads/history.png','{\"apiTaskId\":\"old-1\"}'),(2,'RUNNING',NULL,'{\"apiTaskId\":\"old-2\"}')");
            try (var connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection,
                        new ClassPathResource("db/migration/V35__retire_legacy_media_models.sql"));
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models", Integer.class)).isEqualTo(3);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models WHERE enabled=1", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT enabled FROM ai_models WHERE code='deepseek-flash'", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM pricing_rules WHERE enabled=1", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT result_url FROM jobs WHERE id=1", String.class)).isEqualTo("/uploads/history.png");
            assertThat(jdbc.queryForObject("SELECT meta_json FROM jobs WHERE id=2", String.class)).contains("old-2");
            assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=2", String.class)).isEqualTo("RUNNING");
        } finally { jdbc.execute("SHUTDOWN"); }
    }
}
