package com.ym.ai_story_studio_server.workbench;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import com.ym.ai_story_studio_server.util.AdminContext;
import java.nio.file.*;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.*;
import static com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.*;

class WorkbenchLibraryServiceTest {
    JdbcTemplate db; WorkbenchLibraryService service;
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:library"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds);
        db.execute("CREATE TABLE creation_prompts(stage VARCHAR(20),version INT,content CLOB)");
        db.update("INSERT INTO creation_prompts VALUES('SCRIPT',1,'original script')");
        db.update("INSERT INTO creation_prompts VALUES('STORYBOARD',1,'original storyboard')");
        for(String sql:Files.readString(Path.of("src/main/resources/db/migration/V40__workbench_library.sql")).split(";"))if(!sql.isBlank())db.execute(sql);
        service=new WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)));
        AdminContext.setAdminId(7L);
    }
    @AfterEach void clear(){AdminContext.clear();}
    KnowledgeEdit edit(long revision,String title,String expiry){return new KnowledgeEdit(revision,title,"来源材料","https://example.org","机构","2026-01-01","摘要","FACT","文化","展示授权",expiry);}
    @Test void reviewIsVersionedEditsInvalidateAndStaleActionsFail() {
        var k=service.createKnowledge(edit(0,"山海资料",null));
        assertThat(service.approvedKnowledge("")).isEmpty();
        k=service.reviewKnowledge(k.id(),new Review(k.revision(),"APPROVED","核验来源"));
        assertThat(service.approvedKnowledge("山海")).hasSize(1);
        var updated=service.updateKnowledge(k.id(),edit(k.revision(),"修订标题",null));
        assertThat(updated.status()).isEqualTo("DRAFT");assertThat(updated.reviewedBy()).isNull();
        assertThat(service.approvedKnowledge("")).isEmpty();
        final var old=k;
        assertThatThrownBy(()->service.updateKnowledge(old.id(),edit(old.revision(),"覆盖",null))).hasMessageContaining("版本");
        assertThatThrownBy(()->service.reviewKnowledge(old.id(),new Review(old.revision(),"APPROVED","旧审核"))).hasMessageContaining("版本");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM workbench_knowledge_history",Integer.class)).isEqualTo(3);
    }
    @Test void expiredFactsAndUnreviewedDocumentsCannotBeRetrieved() {
        var expired=service.createKnowledge(edit(0,"过期事实",LocalDate.now().minusDays(1).toString()));
        service.reviewKnowledge(expired.id(),new Review(1,"APPROVED","历史核验"));
        assertThat(service.approvedKnowledge("")).isEmpty();
        assertThatThrownBy(()->service.approvedKnowledge("a".repeat(201))).hasMessageContaining("查询");
    }
    @Test void serviceWritesAndAdminReadsRequireAdminContext() {
        AdminContext.clear();
        assertThatThrownBy(()->service.createKnowledge(edit(0,"越权",null))).hasMessageContaining("权限");
        assertThatThrownBy(()->service.createPrompt(new PromptCreate("SCRIPT","x","","TEXT","x"))).hasMessageContaining("权限");
        assertThatThrownBy(()->service.prompts()).hasMessageContaining("权限");
        assertThatThrownBy(()->service.knowledge("")).hasMessageContaining("权限");
    }
    @Test void immutablePromptVersionsRequireExplicitConcurrentPublicationAndNoFallback() {
        var p=service.createPrompt(new PromptCreate("SCRIPT","new script","brief","TEXT","修订"));
        assertThat(p.status()).isEqualTo("DRAFT");assertThat(service.published("SCRIPT").content()).isEqualTo("original script");
        assertThatThrownBy(()->service.changePromptStatus("SCRIPT",p.version(),new PromptStatus("PUBLISHED",0))).hasMessageContaining("版本");
        var published=service.changePromptStatus("SCRIPT",p.version(),new PromptStatus("PUBLISHED",1));
        assertThat(published.content()).isEqualTo("new script");
        assertThat(service.published("SCRIPT").version()).isEqualTo(p.version());
        assertThat(service.prompts()).filteredOn(x->x.stage().equals("SCRIPT")).hasSize(2);
        service.changePromptStatus("SCRIPT",p.version(),new PromptStatus("DISABLED",p.version()));
        assertThatThrownBy(()->service.published("SCRIPT")).hasMessageContaining("发布");
        assertThatThrownBy(()->service.changePromptStatus("SCRIPT",p.version(),new PromptStatus("PUBLISHED",0))).hasMessageContaining("禁用");
    }
    @Test void simultaneousPublicationHasExactlyOneWinner() throws Exception {
        var first=service.createPrompt(new PromptCreate("SCRIPT","first","brief","TEXT","first"));
        var second=service.createPrompt(new PromptCreate("SCRIPT","second","brief","TEXT","second"));
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        var gate=new java.util.concurrent.CyclicBarrier(2);
        try {
            var futures=new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for(var p:java.util.List.of(first,second))futures.add(pool.submit(()->{
                AdminContext.setAdminId(7L);
                try {gate.await();service.changePromptStatus("SCRIPT",p.version(),new PromptStatus("PUBLISHED",1));return true;}
                catch(com.ym.ai_story_studio_server.exception.BusinessException conflict){return false;}
                finally {AdminContext.clear();}
            }));
            int wins=0;for(var f:futures)if(f.get(5,java.util.concurrent.TimeUnit.SECONDS))wins++;
            assertThat(wins).isEqualTo(1);
            assertThat(db.queryForObject("SELECT COUNT(*) FROM workbench_prompts WHERE stage='SCRIPT' AND status='PUBLISHED'",Integer.class)).isEqualTo(1);
        } finally {pool.shutdownNow();}
    }
    @Test void unknownPromptVariablesAreRejected() {
        assertThatThrownBy(()->service.createPrompt(new PromptCreate("SCRIPT","text","credentials","TEXT","unknown variable"))).hasMessageContaining("变量");
    }
    @Test void brainstormVariablesMatchAcceptedWorkerPayload() {
        assertThat(service.published("BRAINSTORM").variables()).isEqualTo("brief,sources,evidence");
        assertThat(service.createPrompt(new PromptCreate("BRAINSTORM","new prompt","brief,sources,evidence","TEXT","actual worker keys")).variables()).isEqualTo("brief,sources,evidence");
        assertThatThrownBy(()->service.createPrompt(new PromptCreate("BRAINSTORM","new prompt","knowledge","TEXT","obsolete key"))).hasMessageContaining("变量");
    }
    @Test void brainstormSeedDescribesStrictDecisionAndCompleteOutline() {
        assertThat(service.published("BRAINSTORM").content()).contains("tool","arguments","search_knowledge","web_search","read_page","validate_sources","save_draft","ask_user","finish","outline","directions","selectedId","selectionReason","keyMessage","callToAction","reviewNotes","2–3");
    }
}
