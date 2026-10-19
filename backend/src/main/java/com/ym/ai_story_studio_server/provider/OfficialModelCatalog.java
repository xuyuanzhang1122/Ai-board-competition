package com.ym.ai_story_studio_server.provider;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;

/** One atomic snapshot, shared by admin and generation catalogs. Failed refresh never replaces it. */
@Service
public class OfficialModelCatalog {
    private final OfficialModelCatalogClient client;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private long lastSuccess;
    public OfficialModelCatalog(OfficialModelCatalogClient client,JdbcTemplate jdbc,PlatformTransactionManager manager) {
        this.client=client;this.jdbc=jdbc;this.transaction=new TransactionTemplate(manager);
    }
    public synchronized void refreshIfStale() { if(System.nanoTime()-lastSuccess>60_000_000_000L || lastSuccess==0) refresh(); }
    public synchronized void refresh() {
        List<OfficialModelCatalogClient.Model> models=client.fetch();
        String revision=java.util.UUID.randomUUID().toString();
        transaction.executeWithoutResult(status->{
            // Mark membership for removal; no historical seeded rows survive discovery.
            jdbc.update("UPDATE ai_models SET upstream_present=0");
            int order=0;
            for(var model:models) {
                var existing=jdbc.queryForList("SELECT id,provider FROM ai_models WHERE code=?",model.code());
                int enabled="LANGUAGE".equals(model.type())?1:0;
                String description="LANGUAGE".equals(model.type())?"官方上游目录同步":"上游返回；当前应用尚未接入此能力";
                if(existing.isEmpty()) {
                    jdbc.update("INSERT INTO ai_models(code,name,type,provider,enabled,sort_order,description,source_url,upstream_metadata,upstream_present,catalog_revision) VALUES(?,?,?,?,?,?,?,?,?,1,?)",
                        model.code(),model.name(),model.type(),model.provider(),enabled,order++,description,model.sourceUrl(),model.metadata(),revision);
                } else {
                    boolean sameProvider=model.provider().equals(existing.get(0).get("provider"));
                    jdbc.update("UPDATE ai_models SET name=?,type=?,provider=?,enabled=CASE WHEN ?=0 THEN 0 WHEN ? THEN enabled ELSE 1 END,sort_order=?,description=?,source_url=?,upstream_metadata=?,upstream_present=1,catalog_revision=? WHERE code=?",
                        model.name(),model.type(),model.provider(),enabled,sameProvider,order++,description,model.sourceUrl(),model.metadata(),revision,model.code());
                }
            }
            jdbc.update("DELETE FROM ai_models WHERE upstream_present=0");
        });
        lastSuccess=System.nanoTime();
    }
}
