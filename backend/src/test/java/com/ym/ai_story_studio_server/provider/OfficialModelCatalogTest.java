package com.ym.ai_story_studio_server.provider;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfficialModelCatalogTest {
    JdbcTemplate jdbc;
    OfficialModelCatalogClient client;
    OfficialModelCatalog catalog;
    @BeforeEach void setup() {
        var source=new JdbcDataSource(); source.setURL("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc=new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE ai_models(id BIGINT AUTO_INCREMENT PRIMARY KEY,code VARCHAR(100) UNIQUE,name VARCHAR(200),type VARCHAR(50),provider VARCHAR(100),enabled INT,sort_order INT,description VARCHAR(2000),source_url VARCHAR(512),upstream_metadata VARCHAR(4000),upstream_present INT,catalog_revision VARCHAR(36))");
        client=mock(OfficialModelCatalogClient.class);catalog=new OfficialModelCatalog(client,jdbc,new DataSourceTransactionManager(source));
    }
    @AfterEach void close(){jdbc.execute("SHUTDOWN");}
    OfficialModelCatalogClient.Model model(String code,String type) {
        return new OfficialModelCatalogClient.Model(code,code,"MiMo",type,"https://api.xiaomimimo.com/v1/models","{}");
    }
    @Test void replacesLegacyCatalogAndPreservesExistingDisableFlagAndIdentity() {
        jdbc.update("INSERT INTO ai_models(code,provider,enabled,upstream_present) VALUES('old-gateway','Legacy',0,0)");
        when(client.fetch()).thenReturn(List.of(model("mimo-new","LANGUAGE"),model("mimo-new-tts","AUDIO")));
        catalog.refresh();
        assertThat(jdbc.queryForList("SELECT code FROM ai_models",String.class)).containsExactlyInAnyOrder("mimo-new","mimo-new-tts");
        assertThat(jdbc.queryForObject("SELECT enabled FROM ai_models WHERE type='AUDIO'",Integer.class)).isZero();
        Long id=jdbc.queryForObject("SELECT id FROM ai_models WHERE code='mimo-new'",Long.class);
        jdbc.update("UPDATE ai_models SET enabled=0 WHERE id=?",id);
        catalog.refresh();
        assertThat(jdbc.queryForObject("SELECT id FROM ai_models WHERE code='mimo-new'",Long.class)).isEqualTo(id);
        assertThat(jdbc.queryForObject("SELECT enabled FROM ai_models WHERE id=?",Integer.class,id)).isZero();
        verify(client,times(2)).fetch();
    }
    @Test void failedRefreshLeavesSnapshotUntouchedAndReturnsFailure() {
        when(client.fetch()).thenReturn(List.of(model("mimo-current","LANGUAGE")));
        catalog.refresh();
        when(client.fetch()).thenThrow(new IllegalStateException("upstream down"));
        assertThatThrownBy(catalog::refresh).hasMessage("upstream down");
        assertThat(jdbc.queryForList("SELECT code FROM ai_models",String.class)).containsExactly("mimo-current");
    }
    @Test void removesModelsThatHaveDisappearedUpstreamIncludingEmptySnapshot() {
        when(client.fetch()).thenReturn(List.of(model("mimo-removed","LANGUAGE")),List.of());
        catalog.refresh();catalog.refresh();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_models",Integer.class)).isZero();
    }
}
