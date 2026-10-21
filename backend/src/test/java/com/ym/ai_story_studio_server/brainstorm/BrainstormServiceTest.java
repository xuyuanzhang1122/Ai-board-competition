package com.ym.ai_story_studio_server.brainstorm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.creation.*;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.util.UserContext;
import com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.ym.ai_story_studio_server.brainstorm.BrainstormTypes.*;

class BrainstormServiceTest {
    JdbcTemplate db; BrainstormService service; AiTextService text; CreationService creation; BrainstormWeb web; WorkbenchLibraryService library;
    ObjectMapper json = new ObjectMapper();
    CreationTypes.Brief brief = new CreationTypes.Brief("虚构灯塔", "青年", "视频", "探索", 30, "16:9", "虚构", List.of());
    @BeforeEach void setup() throws Exception {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:brain"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds);
        for (String sql : Files.readString(Path.of("src/main/resources/db/migration/V41__controlled_brainstorm.sql")).split(";")) if (!sql.isBlank()) db.execute(sql);
        for (String sql : Files.readString(Path.of("src/main/resources/db/migration/V42__brainstorm_audit_limits.sql")).split(";")) if (!sql.isBlank()) db.execute(sql);
        db.execute("CREATE TABLE jobs(id BIGINT PRIMARY KEY,user_id BIGINT,project_id BIGINT,status VARCHAR(24),meta_json CLOB,error_message CLOB,finished_at TIMESTAMP)");
        text = mock(AiTextService.class); creation = mock(CreationService.class);
        library = mock(WorkbenchLibraryService.class); web=mock(BrainstormWeb.class);
        when(library.approvedKnowledge(anyString())).thenReturn(List.of());
        when(library.published("BRAINSTORM")).thenReturn(new WorkbenchLibraryService.Prompt("BRAINSTORM",1,"选择工具", "", "", "PUBLISHED", "",1L,"",1));
        var sequence = new java.util.concurrent.atomic.AtomicLong(10);
        when(text.createQueuedConversationJob(anyLong(),anyString(),anyList())).thenAnswer(i -> {
            Job job = new Job(); job.setId(sequence.incrementAndGet());
            db.update("INSERT INTO jobs VALUES(?,?,0,'PENDING','{}',NULL,NULL)", job.getId(), i.<Long>getArgument(0)); return job;
        });
        service = new BrainstormService(db, new TransactionTemplate(new DataSourceTransactionManager(ds)), json,
                text, library, creation, new StoryboardContract(json), new BrainstormContract(json), web);
        UserContext.setUserId(1L);
    }
    @AfterEach void clear() { UserContext.clear(); }
    Draft draft() { return service.create(new Create(UUID.randomUUID().toString(),brief)); }
    Run run(Draft d) { return service.generate(d.id(),new Generate(UUID.randomUUID().toString(),d.revision(),"deepseek-flash")); }
    void decide(Run r, String raw) throws Exception {
        Long job = db.queryForObject("SELECT job_id FROM brainstorm_runs WHERE id=?",Long.class,r.id());
        db.update("UPDATE jobs SET status='SUCCEEDED',meta_json=? WHERE id=?",json.writeValueAsString(Map.of("text",raw)),job);
        service.synchronizeResults();
    }
    @Test void createAndRunAreOwnedIdempotentAndRevisionChecked() {
        String key=UUID.randomUUID().toString(); var d=service.create(new Create(key,brief));
        assertThat(service.create(new Create(key,brief)).id()).isEqualTo(d.id());
        var req=new Generate(UUID.randomUUID().toString(),d.revision(),"deepseek-flash");
        assertThat(service.generate(d.id(),req)).isEqualTo(service.generate(d.id(),req));
        assertThatThrownBy(() -> service.generate(d.id(),new Generate(UUID.randomUUID().toString(),0,"x"))).hasMessageContaining("版本");
        UserContext.setUserId(2L); assertThatThrownBy(() -> service.detail(d.id())).hasMessageContaining("不存在");
    }
    @Test void restartUnknownWorkIsNeverResubmitted() {
        var d=draft();var r=run(d);db.update("UPDATE jobs SET status='RUNNING'");service.reconcileInterruptedJobs();
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("NEEDS_REVIEW");
        assertThat(service.pendingJobs()).isEmpty();verify(text,times(1)).createQueuedConversationJob(anyLong(),anyString(),anyList());
    }
    @Test void forbiddenToolRepairsAreBoundedAndEvidenceIsSaved() throws Exception {
        var d=draft();var r=run(d);
        for(int i=0;i<3;i++)decide(r,"{\"tool\":\"shell\",\"arguments\":{}}");
        var latest=service.detail(d.id()).runs().get(0);
        assertThat(latest.status()).isEqualTo("NEEDS_REVIEW");assertThat(latest.steps()).hasSizeGreaterThanOrEqualTo(3);
        verify(text,times(3)).createQueuedConversationJob(anyLong(),anyString(),anyList());
    }
    @Test void manualEditsInvalidateConfirmationAndStaleAdoption() throws Exception {
        var d=draft();var r=run(d);var outline=new Outline(List.of(direction("a"),direction("b")),"a","选择");
        decide(r,json.writeValueAsString(Map.of("tool","finish","arguments",Map.of("outline",outline))));
        var edited=service.save(d.id(),new Save(d.revision(),brief,outline));
        assertThatThrownBy(() -> service.adopt(d.id(),r.id(),new Revision(edited.revision()))).hasMessageContaining("过期");
        var confirmed=service.confirm(d.id(),new Revision(edited.revision()));
        assertThat(confirmed.confirmed()).isTrue();
        assertThat(service.save(d.id(),new Save(confirmed.revision(),brief,new Outline(outline.directions(),"b","不同选择"))).confirmed()).isFalse();
    }
    @Test void toolLimitAndAskUserKeepDurableEvidence() throws Exception {
        var d=draft();var r=run(d);
        for(int i=0;i<8;i++)decide(r,"{\"tool\":\"search_knowledge\",\"arguments\":{\"query\":\"灯塔\"}}");
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("NEEDS_REVIEW");
        assertThat(db.queryForObject("SELECT tool_count FROM brainstorm_runs WHERE id=?",Integer.class,r.id())).isEqualTo(8);
        var next=draft();var waiting=run(next);decide(waiting,"{\"tool\":\"ask_user\",\"arguments\":{\"question\":\"补充主题\"}}");
        assertThat(service.detail(next.id()).runs().get(0).status()).isEqualTo("WAITING_USER");
        assertThat(service.pendingJobs()).isEmpty();
    }
    @Test void unknownCitationCannotFinishAndExternalPagesAreBounded() throws Exception {
        var d=draft();var r=run(d);var base=direction("a");
        var bad=new Direction(base.id(),base.title(),base.angle(),base.keyMessage(),base.beats(),base.emotion(),base.callToAction(),List.of("invented"),base.reviewNotes());
        decide(r,json.writeValueAsString(Map.of("tool","finish","arguments",Map.of("outline",new Outline(List.of(bad,direction("b")),"a","选择")))));
        assertThat(service.detail(d.id()).runs().get(0).output()).isNull();
        when(web.search(anyString())).thenReturn(json.readTree("{\"status\":\"UNREVIEWED\",\"sources\":[{\"id\":\"web-1\"},{\"id\":\"web-2\"},{\"id\":\"web-3\"}]}"));
        for(int i=0;i<3;i++)decide(r,"{\"tool\":\"web_search\",\"arguments\":{\"query\":\"灯塔\"}}");
        assertThat(db.queryForObject("SELECT page_count FROM brainstorm_runs WHERE id=?",Integer.class,r.id())).isEqualTo(5);
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("NEEDS_REVIEW");
        verify(web,times(2)).search(anyString());
    }
    @Test void confirmedHandoffIsIdempotentAndSnapshotIsFrozen() throws Exception {
        var d=draft();var outline=new Outline(List.of(direction("a"),direction("b")),"a","选择");
        d=service.save(d.id(),new Save(d.revision(),brief,outline));d=service.confirm(d.id(),new Revision(d.revision()));
        when(creation.create(any())).thenReturn(new CreationTypes.Draft(90,1,"创作",null,null,List.of()));
        var request=new Handoff(d.revision(),UUID.randomUUID().toString());
        assertThat(service.handoff(d.id(),request).draftId()).isEqualTo(90);
        assertThat(service.handoff(d.id(),request).draftId()).isEqualTo(90);
        verify(creation,times(1)).create(any());
        assertThat(service.export(d.id()).get("handoffSnapshot").toString()).contains("虚构","direction");
        var capture=org.mockito.ArgumentCaptor.forClass(CreationTypes.Create.class);verify(creation).create(capture.capture());
        assertThat(capture.getValue().brief().materials()).contains("已确认大纲","来源");
    }
    @Test void uuidCreateIsSafeUnderConcurrentRetryAndRejectsChangedPayload() throws Exception {
        String key=UUID.randomUUID().toString();var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        var gate=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Long> request=()->{UserContext.setUserId(1L);try{gate.await();return service.create(new Create(key,brief)).id();}finally{UserContext.clear();}};
        try {
            var a=pool.submit(request);var b=pool.submit(request);gate.countDown();
            assertThat(a.get()).isEqualTo(b.get());assertThat(db.queryForObject("SELECT COUNT(*) FROM brainstorm_drafts",Integer.class)).isEqualTo(1);
        } finally {pool.shutdownNow();}
        var changed=new CreationTypes.Brief("改主题",brief.audience(),brief.channel(),brief.goal(),30,"16:9","",List.of());
        assertThatThrownBy(()->service.create(new Create(key,changed))).hasMessageContaining("其他内容");
        assertThatThrownBy(()->service.create(new Create("not-a-uuid",brief))).hasMessageContaining("UUID");
    }
    @Test void knowledgeSnapshotsRetainReviewedRevisionWhenLibraryChanges() throws Exception {
        var source=new WorkbenchLibraryService.Knowledge(4,2,"灯塔","已审核内容","https://example.com","机构","2026-10-01","","摘要","LEGEND","文化","许可","APPROVED","",1L,"",null);
        when(library.approvedKnowledge("")).thenReturn(List.of(source));var d=draft();var r=run(d);
        when(library.approvedKnowledge("")).thenReturn(List.of());
        var base=direction("a");var cited=new Direction(base.id(),base.title(),base.angle(),base.keyMessage(),base.beats(),base.emotion(),base.callToAction(),List.of("knowledge-4-v2"),List.of("传说明确标识"));
        decide(r,json.writeValueAsString(Map.of("tool","finish","arguments",Map.of("outline",new Outline(List.of(cited,direction("b")),"a","选择")))));
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("SUCCEEDED");
        assertThat(service.export(d.id()).get("sources").toString()).contains("knowledge-4-v2","LEGEND","已审核内容");
    }
    @Test void intermediateOutlineCanBeRecoveredAndHumanAuditSurvivesLaterEdits() throws Exception {
        var d=draft();var r=run(d);var outline=new Outline(List.of(direction("a"),direction("b")),"a","原先选择");
        decide(r,json.writeValueAsString(Map.of("tool","save_draft","arguments",Map.of("outline",outline))));
        decide(r,"{\"tool\":\"ask_user\",\"arguments\":{\"question\":\"继续吗\"}}");
        d=service.adopt(d.id(),r.id(),new Revision(d.revision()));
        assertThat(d.runs().get(0).applied()).isTrue();
        d=service.confirm(d.id(),new Revision(d.revision()));
        service.save(d.id(),new Save(d.revision(),brief,new Outline(outline.directions(),"b","后来修改")));
        String events=service.export(d.id()).get("events").toString();
        assertThat(events).contains("CREATE","ADOPT","CONFIRM","EDIT","原先选择","后来修改");
        var confirmation=db.queryForMap("SELECT before_json,after_json FROM brainstorm_events WHERE draft_id=? AND action='CONFIRM'",d.id());
        assertThat(json.readTree((String)confirmation.get("before_json")).path("confirmed").asBoolean()).isFalse();
        assertThat(json.readTree((String)confirmation.get("after_json")).path("confirmed").asBoolean()).isTrue();
        assertThat(json.readTree((String)confirmation.get("after_json")).path("outline").path("selectionReason").asText()).isEqualTo("原先选择");
    }
    @Test void acceptedLimitsAreClampedAndFrozenAcrossConfigurationChanges() throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(service,"maxTools",1);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"maxPages",500);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"maxRepairs",-3);
        var d=draft();var r=run(d);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"maxTools",8);
        decide(r,"{\"tool\":\"search_knowledge\",\"arguments\":{\"query\":\"灯塔\"}}");
        assertThat(service.detail(d.id()).runs().get(0).status()).isEqualTo("NEEDS_REVIEW");
        var row=db.queryForMap("SELECT max_tools,max_pages,max_repairs FROM brainstorm_runs WHERE id=?",r.id());
        assertThat(((Number)row.get("max_tools")).intValue()).isEqualTo(1);
        assertThat(((Number)row.get("max_pages")).intValue()).isEqualTo(5);
        assertThat(((Number)row.get("max_repairs")).intValue()).isZero();
    }
    @Test void failedJobPreservesPartialTextAndUserProvidedSourcesRemainUnreviewed() throws Exception {
        var supplied=new CreationTypes.Brief(brief.theme(),brief.audience(),brief.channel(),brief.goal(),30,"16:9","用户材料",List.of(new CreationTypes.Source("user-1","用户来源","https://example.com","待核")));
        var d=service.create(new Create(UUID.randomUUID().toString(),supplied));var r=run(d);
        String snapshot=db.queryForObject("SELECT sources_json FROM brainstorm_runs WHERE id=?",String.class,r.id());
        assertThat(snapshot).contains("user-1","UNREVIEWED");
        db.update("UPDATE jobs SET status='FAILED',meta_json=?",json.writeValueAsString(Map.of("text","","partialText","截断结果")));
        service.synchronizeResults();
        assertThat(service.detail(d.id()).runs().get(0).steps().get(0).result().toString()).contains("截断结果");
    }
    @Test void repairContextRetainsRejectedDecisionAndBlockedPageDoesNotLoseEvidence() throws Exception {
        var d=draft();var r=run(d);String truncated="{\"tool\":\"save_draft\",\"arguments\":{";
        decide(r,truncated);
        var validation=service.detail(d.id()).runs().get(0).steps().stream().filter(step->step.tool().equals("VALIDATION")).findFirst().orElseThrow();
        assertThat(validation.result().path("rejectedDecision").asText()).isEqualTo(truncated);
        when(web.read(anyString())).thenThrow(new IllegalArgumentException("reserved DNS"));
        decide(r,"{\"tool\":\"read_page\",\"arguments\":{\"url\":\"https://example.com/story\"}}");
        var latest=service.detail(d.id()).runs().get(0);
        assertThat(latest.status()).isEqualTo("PENDING");
        assertThat(latest.steps().stream().filter(step->step.tool().equals("read_page")).findFirst().orElseThrow().result().path("status").asText()).isEqualTo("BLOCKED");
        assertThat(db.queryForObject("SELECT page_count FROM brainstorm_runs WHERE id=?",Integer.class,r.id())).isZero();
    }
    Direction direction(String id) {return new Direction(id,"标题","角度","信息",List.of("情节"),"情绪","行动",List.of(),List.of("纯虚构"));}
}
