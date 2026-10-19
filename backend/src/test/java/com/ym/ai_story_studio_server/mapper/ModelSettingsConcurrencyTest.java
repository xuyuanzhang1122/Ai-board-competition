package com.ym.ai_story_studio_server.mapper;

import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class ModelSettingsConcurrencyTest {
    @Test void staleAdminUpdateCannotOverwriteNewSnapshotOrEnableAudio() {
        var source=new JdbcDataSource();source.setURL("jdbc:h2:mem:"+java.util.UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1");
        var jdbc=new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE ai_models(id BIGINT PRIMARY KEY,type VARCHAR(30),name VARCHAR(100),enabled INT,sort_order INT,upstream_present INT,catalog_revision VARCHAR(36),updated_at TIMESTAMP)");
        jdbc.update("INSERT INTO ai_models(id,type,name,enabled,sort_order,upstream_present,catalog_revision) VALUES(1,'LANGUAGE','new upstream name',1,0,1,'new-version')");
        var config=new Configuration(new Environment("test",new JdbcTransactionFactory(),source));config.addMapper(AiModelMapper.class);
        try(var session=new SqlSessionFactoryBuilder().build(config).openSession(true)) {
            var mapper=session.getMapper(AiModelMapper.class);
            assertThat(mapper.updateCatalogSettings(1L,"old-version",1,0)).isZero();
            assertThat(mapper.updateCatalogSettings(1L,"new-version",0,9)).isOne();
            assertThat(jdbc.queryForObject("SELECT name FROM ai_models WHERE id=1",String.class)).isEqualTo("new upstream name");
            jdbc.update("UPDATE ai_models SET type='AUDIO',catalog_revision='audio-version' WHERE id=1");
            assertThat(mapper.updateCatalogSettings(1L,"audio-version",1,0)).isZero();
            assertThat(jdbc.queryForObject("SELECT enabled FROM ai_models WHERE id=1",Integer.class)).isZero();
        } finally {jdbc.execute("SHUTDOWN");}
    }
}
