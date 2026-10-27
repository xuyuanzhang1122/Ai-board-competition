package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;

class CreationServiceTest {
    JdbcTemplate db; CreationService service; AiTextService text; ObjectMapper json=new ObjectMapper();
    Brief brief=new Brief("虚构灯塔故事","青年","短视频","感受探索精神",30,"16:9","纯虚构，无真实史实。",List.of());
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:creation"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds);
        String ddl=Files.readString(Path.of("src/main/resources/db/migration/V39__text_creation_pipeline.sql"));
        db.execute("CREATE TABLE storyboard_shots(id BIGINT AUTO_INCREMENT PRIMARY KEY,project_id BIGINT,shot_no INT,script_text CLOB)");
        for(String statement:ddl.split(";"))if(!statement.isBlank())db.execute(statement);
        for(String statement:Files.readString(Path.of("src/main/resources/db/migration/V40__workbench_library.sql")).split(";"))if(!statement.isBlank())db.execute(statement);
        for(String statement:Files.readString(Path.of("src/main/resources/db/migration/V46__partial_storyboard_and_locks.sql")).split(";"))if(!statement.isBlank())db.execute(statement);
        db.execute("CREATE TABLE jobs(id BIGINT PRIMARY KEY,user_id BIGINT,project_id BIGINT,status VARCHAR(20),meta_json CLOB,error_message CLOB,finished_at TIMESTAMP,started_at TIMESTAMP)");
        db.execute("CREATE TABLE projects(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id BIGINT,name VARCHAR(128),aspect_ratio VARCHAR(16),style_code VARCHAR(64),raw_text CLOB,status VARCHAR(32),model_config_json CLOB,deleted_at TIMESTAMP)");
        for(String table:List.of("project_characters","project_scenes","project_props")) db.execute("CREATE TABLE "+table+"(id BIGINT AUTO_INCREMENT PRIMARY KEY,project_id BIGINT,display_name VARCHAR(64),override_description CLOB)");
        db.execute("CREATE TABLE shot_bindings(id BIGINT AUTO_INCREMENT PRIMARY KEY,shot_id BIGINT,bind_type VARCHAR(16),bind_id BIGINT)");
        text=mock(AiTextService.class);var next=new java.util.concurrent.atomic.AtomicLong(100);
        when(text.createQueuedConversationJob(anyLong(),anyString(),anyList())).thenAnswer(i->{Job j=new Job();j.setId(next.getAndIncrement());db.update("INSERT INTO jobs(id,user_id,project_id,status,meta_json) VALUES(?,?,0,'PENDING','{}')",j.getId(),i.<Long>getArgument(0));return j;});
        service=new CreationService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)),text,json,new StoryboardContract(json),new StoryboardProjectWriter(db,json),new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(ds))));
        UserContext.setUserId(1L);
    }
    @AfterEach void clear(){UserContext.clear();}
    Draft create(){return service.create(new Create("draft-1",brief));}
    Run generate(Draft d,String stage,String req){return service.generate(d.id(),new Generate(req,d.revision(),stage,"deepseek-flash"));}
    void finish(Run run,String output)throws Exception {db.update("UPDATE jobs SET status='SUCCEEDED',meta_json=? WHERE id=?",json.writeValueAsString(Map.of("text",output)),run.jobId());service.synchronizeResults();}
    Draft script() throws Exception {var d=create();var run=generate(d,"SCRIPT","script-1");finish(run,"标题：星光来信\n第一幕：守塔人收到信件。第二幕：点亮星空。");d=service.adopt(d.id(),run.id(),new Adopt(d.revision()));return service.confirm(d.id(),new Confirm(d.revision(),"SCRIPT"));}
    Draft board() throws Exception {var d=script();var run=generate(d,"STORYBOARD","board-1");finish(run,StoryboardContractTest.BOARD);d=service.adopt(d.id(),run.id(),new Adopt(d.revision()));return service.confirm(d.id(),new Confirm(d.revision(),"STORYBOARD"));}
    @Test void acceptanceIsDurableIdempotentOwnedAndRequiresConfirmedScript() {
        var d=create();assertThat(service.create(new Create("draft-1",brief)).id()).isEqualTo(d.id());
        assertThatThrownBy(()->generate(d,"STORYBOARD","board-1")).hasMessageContaining("确认剧本");
        var run=generate(d,"SCRIPT","request-1");assertThat(generate(d,"SCRIPT","request-1")).isEqualTo(run);
        assertThat(service.pendingJobs()).hasSize(1);
        assertThatThrownBy(()->generate(d,"SCRIPT","request-2")).hasMessageContaining("执行");
        UserContext.setUserId(2L);assertThatThrownBy(()->service.detail(d.id())).hasMessageContaining("不存在");
        assertThatThrownBy(()->service.adopt(d.id(),run.id(),new Adopt(d.revision()))).hasMessageContaining("不存在");
    }
    @Test void manualEditsCannotBeOverwrittenByStaleResults() throws Exception {
        var d=create();var run=generate(d,"SCRIPT","script-1");
        var edited=service.save(d.id(),new Save(d.revision(),brief,"人工写的剧本",null));
        finish(run,"旧候选剧本");
        assertThatThrownBy(()->service.adopt(d.id(),run.id(),new Adopt(edited.revision()))).hasMessageContaining("过期");
        assertThat(service.detail(d.id()).body().script()).isEqualTo("人工写的剧本");
        assertThatThrownBy(()->service.save(d.id(),new Save(d.revision(),brief,"旧版本",null))).hasMessageContaining("版本");
    }
    @Test void invalidBoardKeepsRawOutputButCannotBeAdoptedOrImported() throws Exception {
        var d=script();var run=generate(d,"STORYBOARD","bad");finish(run,"{truncated");
        var actual=service.detail(d.id()).runs().get(0);
        assertThat(actual.status()).isEqualTo("INVALID");assertThat(actual.output()).isEqualTo("{truncated");
        assertThatThrownBy(()->service.adopt(d.id(),run.id(),new Adopt(d.revision()))).hasMessageContaining("候选");
        assertThatThrownBy(()->service.createProject(d.id(),new ProjectRequest(d.revision(),"project-1"))).hasMessageContaining("确认");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM projects",Integer.class)).isZero();
    }
    @Test void confirmationAndProjectConversionPreserveAssetsAndAreIdempotent() throws Exception {
        var d=board();var p=service.createProject(d.id(),new ProjectRequest(d.revision(),"project-1"));
        assertThat(service.createProject(d.id(),new ProjectRequest(d.revision(),"project-1"))).isEqualTo(p);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM projects",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM storyboard_shots",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM shot_bindings",Integer.class)).isEqualTo(5);
        assertThat(db.queryForObject("SELECT creation_metadata_json FROM storyboard_shots WHERE shot_no=1",String.class)).contains("shot1","duration");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM creation_events",Integer.class)).isGreaterThan(4);
        UserContext.setUserId(2L);assertThatThrownBy(()->service.createProject(d.id(),new ProjectRequest(d.revision(),"project-1"))).hasMessageContaining("不存在");
    }
    @Test void failedImportRollsBackEverything() throws Exception {
        var d=board();db.execute("ALTER TABLE storyboard_shots ADD CONSTRAINT fail_shot CHECK (shot_no < 2)");
        assertThatThrownBy(()->service.createProject(d.id(),new ProjectRequest(d.revision(),"project-1"))).isInstanceOf(RuntimeException.class);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM projects",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM project_characters",Integer.class)).isZero();
        assertThat(service.detail(d.id()).projectId()).isNull();
    }
    @Test void truncatedProviderOutputRemainsInspectableAfterFailure() throws Exception {
        var d=create();var run=generate(d,"SCRIPT","truncated");
        db.update("UPDATE jobs SET status='FAILED',meta_json=?,error_message='响应被截断' WHERE id=?",json.writeValueAsString(Map.of("partialText","半个剧本")),run.jobId());
        service.synchronizeResults();
        assertThat(service.detail(d.id()).runs().get(0).output()).isEqualTo("半个剧本");
    }
    @Test void concurrentDraftCreationReturnsOneOwnedDraftForTheSameRequest() throws Exception {
        var pool=java.util.concurrent.Executors.newFixedThreadPool(6);
        try {
            var gate=new java.util.concurrent.CyclicBarrier(6);
            var futures=new java.util.ArrayList<java.util.concurrent.Future<Long>>();
            for(int i=0;i<6;i++)futures.add(pool.submit(()->{UserContext.setUserId(1L);try{gate.await();return create().id();}finally{UserContext.clear();}}));
            var ids=new java.util.HashSet<Long>();for(var f:futures)ids.add(f.get(10,java.util.concurrent.TimeUnit.SECONDS));
            assertThat(ids).hasSize(1);
            assertThat(db.queryForObject("SELECT COUNT(*) FROM creation_drafts",Integer.class)).isEqualTo(1);
        } finally {pool.shutdownNow();}
    }
    @Test void draftRequestIdCannotBeReusedWithDifferentBrief() {
        create();var changed=new Brief("其他主题",brief.audience(),brief.channel(),brief.goal(),30,"16:9","",List.of());
        assertThatThrownBy(()->service.create(new Create("draft-1",changed))).hasMessageContaining("标识");
    }
    @Test void updatingBriefKeepsOldBoardAsStaleRatherThanBlockingTheEdit() throws Exception {
        Draft d=board();Brief changed=new Brief(brief.theme(),brief.audience(),brief.channel(),brief.goal(),60,brief.aspectRatio(),brief.materials(),brief.sources());
        Draft edited=service.save(d.id(),new Save(d.revision(),changed,d.body().script(),d.body().storyboard()));
        assertThat(edited.body().storyboard()).isEqualTo(d.body().storyboard());
        assertThat(edited.body().boardConfirmed()).isFalse();
        assertThat(edited.body().boardScriptVersion()).isNotEqualTo(edited.body().scriptVersion());
    }
    @Test void creationUsesPublishedPromptAndRetainsAcceptedInstructionAfterPublication() throws Exception {
        var d=create();var first=generate(d,"SCRIPT","old-prompt");
        @SuppressWarnings("unchecked")
        var captured=org.mockito.ArgumentCaptor.forClass(List.class);
        verify(text).createQueuedConversationJob(eq(1L),anyString(),captured.capture());
        String instruction=((com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn)captured.getValue().get(0)).content();
        var library=new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(db.getDataSource())));
        com.ym.ai_story_studio_server.util.AdminContext.setAdminId(9L);
        try {
            var replacement=library.createPrompt(new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.PromptCreate("SCRIPT","新版剧本规则","brief","TEXT","调整规则"));
            library.changePromptStatus("SCRIPT",replacement.version(),new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.PromptStatus("PUBLISHED",1));
            assertThat(((com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn)captured.getValue().get(0)).content()).isEqualTo(instruction);
            assertThat(first.promptVersion()).isEqualTo(1);
            finish(first,"旧任务完成");
            var next=generate(d,"SCRIPT","new-prompt");
            assertThat(next.promptVersion()).isEqualTo(replacement.version());
            verify(text).createQueuedConversationJob(eq(1L),anyString(),eq(List.of(new com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn("system","新版剧本规则"),new com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn("user",json.writeValueAsString(Map.of("brief",brief,"confirmedScript",""))))));
            finish(next,"新任务完成");
            library.changePromptStatus("SCRIPT",replacement.version(),new com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.PromptStatus("DISABLED",replacement.version()));
            assertThatThrownBy(()->generate(d,"SCRIPT","disabled-prompt")).hasMessageContaining("禁用");
        } finally {com.ym.ai_story_studio_server.util.AdminContext.clear();}
    }
    @Test void restartDoesNotResendUncertainCallsAndKeepsQueuedWork() {
        var d=create();var run=generate(d,"SCRIPT","script-1");service.reconcileInterruptedJobs();assertThat(service.pendingJobs()).hasSize(1);
        db.update("UPDATE jobs SET status='RUNNING' WHERE id=?",run.jobId());service.reconcileInterruptedJobs();
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("FAILED");
        verify(text,never()).executeQueuedTextJob(any(),any(),any());
    }

    @Test void evidenceIncludesFrozenPartialRequestAndLockAuditButRemainsOwned() throws Exception {
        var d=board();var locked=service.lockShots(d.id(),new ShotLocks(d.revision(),List.of(d.body().storyboard().shots().get(1).id())));
        var request=partialRequest(locked,"evidence",List.of(d.body().storyboard().shots().get(0).id()),locked.lockedShotIds());
        service.partial(locked.id(),request);
        String evidence=json.writeValueAsString(service.evidence(locked.id()));
        assertThat(evidence).contains("lockedShotIds","LOCK_SHOTS","STORYBOARD_PARTIAL","只修改画面");
        UserContext.setUserId(2L);assertThatThrownBy(()->service.evidence(locked.id())).hasMessageContaining("不存在");
    }
    PartialGenerate partialRequest(Draft d,String key,List<String> ids,List<String> locks) {return new PartialGenerate(key,d.revision(),"deepseek-flash",ids,locks,"只修改画面为海浪远景，保留时长和引用");}
    String partialOutput(Draft d) throws Exception {
        var shot=d.body().storyboard().shots().get(0);
        var changed=new Shot(shot.id(),shot.no(),shot.duration(),"人工要求的海浪远景",shot.narration(),shot.dialogue(),shot.shotSize(),shot.cameraMovement(),shot.characters(),shot.scene(),shot.props(),shot.imagePrompt(),shot.videoPrompt(),shot.sourceIds());
        return json.writeValueAsString(Map.of("shots",List.of(changed)));
    }
    @Test void partialCandidateChangesOnlyChosenShotAndInvalidatesBoardConfirmation() throws Exception {
        var d=board();String first=d.body().storyboard().shots().get(0).id(),second=d.body().storyboard().shots().get(1).id();
        d=service.lockShots(d.id(),new ShotLocks(d.revision(),List.of(second)));
        var req=partialRequest(d,"partial-1",List.of(first),List.of(second));var run=service.partial(d.id(),req);
        assertThat(service.partial(d.id(),req).id()).isEqualTo(run.id());finish(run,partialOutput(d));
        var adopted=service.adopt(d.id(),run.id(),new Adopt(d.revision()));
        assertThat(adopted.body().storyboard().shots().get(0).visual()).contains("海浪远景");
        assertThat(adopted.body().storyboard().shots().get(1)).isEqualTo(d.body().storyboard().shots().get(1));
        assertThat(adopted.body().storyboard().assets()).isEqualTo(d.body().storyboard().assets());
        assertThat(adopted.body().boardConfirmed()).isFalse();assertThat(adopted.lockedShotIds()).containsExactly(second);
    }
    @Test void partialTargetsCannotBeLockedUnknownOrChangedUnderOneRequestId() throws Exception {
        var d=board();String first=d.body().storyboard().shots().get(0).id(),second=d.body().storyboard().shots().get(1).id();
        d=service.lockShots(d.id(),new ShotLocks(d.revision(),List.of(second)));final var locked=d;
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"bad1",List.of(second),List.of(second)))).hasMessageContaining("锁定");
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"bad2",List.of("invented"),List.of(second)))).hasMessageContaining("镜头");
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"bad3",List.of(first,first),List.of(second)))).hasMessageContaining("重复");
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"bad4",List.of(),List.of(second)))).hasMessageContaining("选择");
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"bad5",List.of(first),List.of()))).hasMessageContaining("锁定");
        var req=partialRequest(d,"same",List.of(first),List.of(second));service.partial(d.id(),req);
        assertThatThrownBy(()->service.partial(locked.id(),new PartialGenerate("same",locked.revision(),"deepseek-flash",List.of(first),List.of(second),"不同要求"))).hasMessageContaining("标识");
    }
    @Test void laterLockChangeOrManualEditMakesPartialCandidateStale() throws Exception {
        var d=board();String first=d.body().storyboard().shots().get(0).id();
        var run=service.partial(d.id(),partialRequest(d,"stale",List.of(first),List.of()));finish(run,partialOutput(d));
        var locked=service.lockShots(d.id(),new ShotLocks(d.revision(),List.of(first)));
        assertThatThrownBy(()->service.adopt(locked.id(),run.id(),new Adopt(locked.revision()))).hasMessageContaining("过期");
        assertThat(locked.body().storyboard()).isEqualTo(d.body().storyboard());
        assertThat(db.queryForObject("SELECT after_json FROM creation_events WHERE action='LOCK_SHOTS' AND draft_id=?",String.class,d.id())).contains(first);
    }
    @Test void invalidPartialOutputCannotChangeTimingIdsAssetsOrUnselectedShots() throws Exception {
        var d=board();var run=service.partial(d.id(),partialRequest(d,"invalid",List.of(d.body().storyboard().shots().get(0).id()),List.of()));
        var full=json.readTree(partialOutput(d));((com.fasterxml.jackson.databind.node.ObjectNode)full.path("shots").get(0)).put("duration",25);
        finish(run,json.writeValueAsString(full));assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("INVALID");
        assertThat(service.detail(d.id()).body().storyboard()).isEqualTo(d.body().storyboard());
        assertThatThrownBy(()->service.adopt(d.id(),run.id(),new Adopt(d.revision()))).hasMessageContaining("候选");
        var other=service.partial(d.id(),partialRequest(d,"extra",List.of(d.body().storyboard().shots().get(0).id()),List.of()));
        finish(other,json.writeValueAsString(Map.of("shots",d.body().storyboard().shots())));
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("INVALID");
    }
    @Test void locksAndPartialCallsRemainOwnedAndFullRegenerationCannotBypassLocks() throws Exception {
        var d=board();var locked=service.lockShots(d.id(),new ShotLocks(d.revision(),List.of(d.body().storyboard().shots().get(0).id())));
        assertThatThrownBy(()->generate(locked,"STORYBOARD","full")).hasMessageContaining("锁定");
        UserContext.setUserId(2L);
        assertThatThrownBy(()->service.lockShots(locked.id(),new ShotLocks(locked.revision(),List.of()))).hasMessageContaining("不存在");
        assertThatThrownBy(()->service.partial(locked.id(),partialRequest(locked,"foreign",List.of("shot1"),List.of()))).hasMessageContaining("不存在");
    }
}
