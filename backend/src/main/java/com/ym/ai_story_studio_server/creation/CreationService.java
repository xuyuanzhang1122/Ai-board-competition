package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn;
import com.ym.ai_story_studio_server.service.AiTextService;
import com.ym.ai_story_studio_server.util.UserContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;
import static com.ym.ai_story_studio_server.creation.StoryboardContract.*;

@Service
public class CreationService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final AiTextService text;
    private final ObjectMapper json;
    private final StoryboardContract contract;
    private final StoryboardProjectWriter projects;
    private final com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService library;
    public CreationService(JdbcTemplate db,TransactionTemplate tx,AiTextService text,ObjectMapper json,StoryboardContract contract,StoryboardProjectWriter projects,com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService library){this.db=db;this.tx=tx;this.text=text;this.json=json;this.contract=contract;this.projects=projects;this.library=library;}
    private long user(){Long u=UserContext.getUserId();if(u==null)throw new BusinessException(ResultCode.UNAUTHORIZED);return u;}
    public List<Draft> list(){return db.query("SELECT * FROM creation_drafts WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100",(r,n)->draft(r.getLong("id"),r.getLong("revision"),r.getString("title"),r.getString("body_json"),r.getObject("project_id",Long.class)),user());}
    private Draft draft(long id,long revision,String title,String body,Long project){return new Draft(id,revision,title,decode(body,Body.class),project,runs(id),locks(id));}
    private List<String> locks(long id){
        String raw=db.queryForObject("SELECT locked_shot_ids_json FROM creation_drafts WHERE id=?",String.class,id);
        try{return raw==null?List.of():json.readValue(raw,new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});}
        catch(Exception error){throw new IllegalStateException("镜头锁定记录无法读取",error);}
    }
    private List<Run> runs(long id){return db.query("SELECT * FROM creation_runs WHERE draft_id=? ORDER BY id DESC",(r,n)->new Run(r.getLong("id"),r.getString("stage"),r.getString("status"),r.getLong("input_revision"),r.getString("model"),r.getLong("job_id"),r.getString("output_text"),r.getString("error_message"),r.getInt("prompt_version"),r.getBoolean("applied")),id);}
    private Draft owned(long id,boolean lock){var list=db.query("SELECT * FROM creation_drafts WHERE id=? AND user_id=?"+(lock?" FOR UPDATE":""),(r,n)->draft(r.getLong("id"),r.getLong("revision"),r.getString("title"),r.getString("body_json"),r.getObject("project_id",Long.class)),id,user());if(list.isEmpty())throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND,"创作不存在");return list.get(0);}
    public Draft detail(long id){return owned(id,false);}
    public Draft create(Create request){
        contract.validateBrief(request.brief());requestId(request.requestId());long user=user();
        try {
            return tx.execute(t->{
                Draft existing=existingCreate(user,request);
                if(existing!=null)return existing;
                Body body=new Body(request.brief(),"",0,false,null,0,false);
                long id=JdbcIds.insert(db,"INSERT INTO creation_drafts(user_id,client_request_id,title,body_json,request_brief_json) VALUES(?,?,?,?,?)",user,request.requestId(),title(request.brief().theme()),encode(body),encode(request.brief()));
                event(id,1,"CREATE",null,null,body);return owned(id,false);
            });
        } catch(DuplicateKeyException race) {
            // The unique-key loser reads only after its transaction has rolled back.
            Draft existing=existingCreate(user,request);if(existing==null)throw race;return existing;
        }
    }
    private Draft existingCreate(long user,Create request) {
        var rows=db.queryForList("SELECT id,request_brief_json FROM creation_drafts WHERE user_id=? AND client_request_id=?",user,request.requestId());
        if(rows.isEmpty())return null;
        require(Objects.equals(rows.get(0).get("request_brief_json"),encode(request.brief())),"请求标识已用于其他创作内容");
        return owned(((Number)rows.get(0).get("id")).longValue(),false);
    }
    public Draft save(long id,Save request){return tx.execute(t->{
        Draft d=owned(id,true);revision(d,request.revision());contract.validateBrief(request.brief());optional(request.script(),20000,"剧本");
        Body old=d.body();String script=request.script()==null?"":request.script();
        if(request.storyboard()!=null&&!Objects.equals(old.storyboard(),request.storyboard()))contract.validate(request.storyboard(),request.brief().duration(),contract.sources(request.brief()));
        if(request.storyboard()!=null)require(request.storyboard().shots().stream().map(Shot::id).toList().containsAll(d.lockedShotIds()),"请先解除被删除镜头的锁定");
        else require(d.lockedShotIds().isEmpty(),"请先解除镜头锁定后清空分镜");
        boolean changed=!Objects.equals(old.brief(),request.brief())||!old.script().equals(script);
        boolean boardChanged=!Objects.equals(old.storyboard(),request.storyboard());
        Body next=new Body(request.brief(),script,old.scriptVersion()+(changed?1:0),!changed&&old.scriptConfirmed(),request.storyboard(),
                boardChanged?old.scriptVersion()+(changed?1:0):old.boardScriptVersion(),!changed&&!boardChanged&&old.boardConfirmed());
        if(next.equals(old))return d;
        return update(d,next,"EDIT",null);
    });}
    public Draft confirm(long id,Confirm request){return tx.execute(t->{
        Draft d=owned(id,true);revision(d,request.revision());Body b=d.body();
        if("SCRIPT".equals(request.stage())) {
            text(b.script(),20000,"剧本");
            if(b.scriptConfirmed())return d;
            return update(d,new Body(b.brief(),b.script(),b.scriptVersion(),true,b.storyboard(),b.boardScriptVersion(),b.boardConfirmed()),"CONFIRM_SCRIPT",null);
        }
        require("STORYBOARD".equals(request.stage()),"阶段无效");
        require(b.scriptConfirmed(),"请先确认剧本");require(b.boardScriptVersion()==b.scriptVersion(),"分镜已过期，请重新生成或编辑分镜");
        contract.validate(b.storyboard(),b.brief().duration(),contract.sources(b.brief()));
        if(b.boardConfirmed())return d;
        return update(d,new Body(b.brief(),b.script(),b.scriptVersion(),true,b.storyboard(),b.boardScriptVersion(),true),"CONFIRM_STORYBOARD",null);
    });}
    public Run generate(long id,Generate request){return tx.execute(t->{
        Draft d=owned(id,true);requestId(request.requestId());
        Optional<Run> existing=d.runs().stream().filter(r->Objects.equals(db.queryForObject("SELECT request_id FROM creation_runs WHERE id=?",String.class,r.id()),request.requestId())).findFirst();
        if(existing.isPresent()) {
            Run r=existing.get();require(r.stage().equals(request.stage())&&r.model().equals(request.model())&&r.inputRevision()==request.revision(),"请求标识已用于其他内容");return r;
        }
        revision(d,request.revision());require(Set.of("SCRIPT","STORYBOARD").contains(request.stage()==null?"":request.stage()),"阶段无效");
        require(d.runs().stream().noneMatch(r->Set.of("PENDING","RUNNING").contains(r.status())),"已有生成任务执行中");
        if("STORYBOARD".equals(request.stage())){require(d.body().scriptConfirmed(),"请先保存并确认剧本");require(d.lockedShotIds().isEmpty(),"已有锁定镜头，请使用局部重生成或先解除锁定");}
        var prompt=library.published(request.stage());
        int version=prompt.version();String instruction=prompt.content();
        String input=encode(Map.of("brief",d.body().brief(),"confirmedScript","STORYBOARD".equals(request.stage())?d.body().script():""));
        var job=text.createQueuedConversationJob(user(),request.model(),List.of(new ChatTurn("system",instruction),new ChatTurn("user",input)));
        long run=JdbcIds.insert(db,"INSERT INTO creation_runs(draft_id,request_id,stage,input_revision,model,job_id,prompt_version,input_json) VALUES(?,?,?,?,?,?,?,?)",id,request.requestId(),request.stage(),d.revision(),request.model(),job.getId(),version,input);
        return runs(id).stream().filter(r->r.id()==run).findFirst().orElseThrow();
    });}
    public Draft lockShots(long id,ShotLocks request){return tx.execute(t->{
        Draft d=owned(id,true);require(request!=null,"锁定请求必填");
        List<String> ids=request.lockedShotIds();validateShotIds(d,ids,true);
        if(new HashSet<>(ids).equals(new HashSet<>(d.lockedShotIds())))return d;
        revision(d,request.revision());
        db.update("UPDATE creation_drafts SET locked_shot_ids_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",encode(ids),id);
        db.update("INSERT INTO creation_events(draft_id,user_id,revision,action,before_json,after_json) VALUES(?,?,?,'LOCK_SHOTS',?,?)",id,user(),d.revision()+1,encode(Map.of("lockedShotIds",d.lockedShotIds())),encode(Map.of("lockedShotIds",ids)));
        return owned(id,false);
    });}
    private void validateShotIds(Draft d,List<String> ids,boolean empty){
        require(ids!=null&&ids.size()<=20&&(empty||!ids.isEmpty()),"请选择1至20个镜头");
        require(new HashSet<>(ids).size()==ids.size(),"镜头 ID 重复");
        require(d.body().storyboard()!=null,"尚无分镜");
        require(d.body().storyboard().shots().stream().map(Shot::id).toList().containsAll(ids),"镜头不存在");
    }
    public Run partial(long id,PartialGenerate request){return tx.execute(t->{
        Draft d=owned(id,true);require(request!=null,"局部请求必填");requestId(request.requestId());
        var rows=db.queryForList("SELECT id,input_json FROM creation_runs WHERE draft_id=? AND request_id=?",id,request.requestId());
        if(!rows.isEmpty()){
            try{require(json.readTree((String)rows.get(0).get("input_json")).path("request").equals(json.readTree(encode(request))),"请求标识已用于其他内容");}
            catch(java.io.IOException error){throw invalid("请求标识已用于其他内容");}
            long run=((Number)rows.get(0).get("id")).longValue();return runs(id).stream().filter(r->r.id()==run).findFirst().orElseThrow();
        }
        revision(d,request.revision());Body body=d.body();
        require(body.scriptConfirmed()&&body.boardScriptVersion()==body.scriptVersion(),"请先确认当前剧本及对应分镜");
        contract.validate(body.storyboard(),body.brief().duration(),contract.sources(body.brief()));
        validateShotIds(d,request.shotIds(),false);validateShotIds(d,request.lockedShotIds(),true);
        require(new HashSet<>(request.lockedShotIds()).equals(new HashSet<>(d.lockedShotIds())),"锁定集合已变化，请刷新");
        require(Collections.disjoint(request.shotIds(),d.lockedShotIds()),"不可重生成锁定镜头");
        text(request.instruction(),2000,"局部修改要求");text(request.model(),128,"模型");
        require(d.runs().stream().noneMatch(r->Set.of("PENDING","RUNNING").contains(r.status())),"已有生成任务执行中");
        var prompt=library.published("STORYBOARD_PARTIAL");
        String input=encode(Map.of("brief",body.brief(),"confirmedScript",body.script(),"storyboard",body.storyboard(),"shotIds",request.shotIds(),"lockedShotIds",d.lockedShotIds(),"instruction",request.instruction()));
        var job=text.createQueuedConversationJob(user(),request.model(),List.of(new ChatTurn("system",prompt.content()),new ChatTurn("user",input)));
        long run=JdbcIds.insert(db,"INSERT INTO creation_runs(draft_id,request_id,stage,input_revision,model,job_id,prompt_version,input_json) VALUES(?,?,'STORYBOARD_PARTIAL',?,?,?,?,?)",id,request.requestId(),d.revision(),request.model(),job.getId(),prompt.version(),encode(Map.of("body",body,"request",request)));
        return runs(id).stream().filter(r->r.id()==run).findFirst().orElseThrow();
    });}
    public Draft adopt(long id,long runId,Adopt request){return tx.execute(t->{
        Draft d=owned(id,true);Run r=d.runs().stream().filter(run->run.id()==runId).findFirst().orElseThrow(()->invalid("候选不存在"));
        if(r.applied())return d;
        revision(d,request.revision());require(r.status().equals("SUCCEEDED"),"候选未完成或校验失败，不能采用");
        require(r.inputRevision()==d.revision(),"候选已过期，当前创作已修改，请保留人工修改并重新生成");
        Body b=d.body();Body next;
        if(r.stage().equals("SCRIPT"))next=new Body(b.brief(),r.output(),b.scriptVersion()+1,false,b.storyboard(),b.boardScriptVersion(),false);
        else {Board board=contract.parse(r.output(),b.brief().duration(),contract.sources(b.brief()));next=new Body(b.brief(),b.script(),b.scriptVersion(),b.scriptConfirmed(),board,b.scriptVersion(),false);}
        db.update("UPDATE creation_runs SET applied=TRUE WHERE id=?",r.id());
        return update(d,next,"ADOPT_"+r.stage(),runId);
    });}
    public ProjectResult createProject(long id,ProjectRequest request){return tx.execute(t->{
        Draft d=owned(id,true);requestId(request.requestId());
        if(d.projectId()!=null){var row=db.queryForMap("SELECT project_request_id FROM creation_drafts WHERE id=?",id);require(Objects.equals(row.get("project_request_id"),request.requestId()),"此创作已建立项目，请打开现有项目");return new ProjectResult(d.projectId());}
        revision(d,request.revision());Body b=d.body();require(b.scriptConfirmed()&&b.boardConfirmed()&&b.scriptVersion()==b.boardScriptVersion(),"请确认当前剧本和分镜后再建项目");
        contract.validate(b.storyboard(),b.brief().duration(),contract.sources(b.brief()));
        String model=d.runs().stream().filter(r->r.applied()).map(Run::model).findFirst().orElse("");
        long project=projects.create(user(),b,model);
        db.update("UPDATE creation_drafts SET project_id=?,project_request_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",project,request.requestId(),id);
        event(id,d.revision(),"CREATE_PROJECT",null,b,b);return new ProjectResult(project);
    });}
    public Map<String,Object> evidence(long id){
        Draft d=detail(id);var evidence=new LinkedHashMap<String,Object>();
        evidence.put("brand","2026 山东省首届大学生 AI 大模型创新传播大赛 · 你的不对我的队");
        evidence.put("disclaimer","本版本仅供参赛展示与评审使用，非正式商业版本。");
        evidence.put("draft",d);evidence.put("events",db.queryForList("SELECT * FROM creation_events WHERE draft_id=? ORDER BY id",id));
        evidence.put("inputs",db.queryForList("SELECT id,stage,input_revision,prompt_version,input_json FROM creation_runs WHERE draft_id=? ORDER BY id",id));
        evidence.put("modelExecutions",db.query("SELECT j.id,j.status,j.started_at,j.finished_at,j.meta_json FROM jobs j JOIN creation_runs r ON r.job_id=j.id WHERE r.draft_id=? ORDER BY j.id",(row,n)->{
            var execution=new LinkedHashMap<String,Object>();execution.put("jobId",row.getLong("id"));execution.put("status",row.getString("status"));execution.put("startedAt",row.getString("started_at"));execution.put("finishedAt",row.getString("finished_at"));
            try{var metadata=json.readTree(row.getString("meta_json"));for(String field:List.of("textSnapshot","provider","upstreamModel","inputTokens","outputTokens","usageKnown"))execution.put(field,metadata.path(field));}
            catch(java.io.IOException error){throw new IllegalStateException("执行记录无法读取",error);}
            return execution;
        },id));return evidence;
    }
    public List<Map<String,Object>> pendingJobs(){return db.queryForList("SELECT j.id,j.user_id,j.project_id FROM jobs j JOIN creation_runs r ON r.job_id=j.id WHERE j.status='PENDING' ORDER BY j.id LIMIT 16");}
    public void reconcileInterruptedJobs(){db.update("UPDATE jobs SET status='FAILED',error_message='服务重启，上游受理状态需确认；未自动重发，请核对任务记录',finished_at=CURRENT_TIMESTAMP WHERE status='RUNNING' AND id IN (SELECT job_id FROM creation_runs)");synchronizeResults();}
    public void synchronizeResults(){
        var rows=db.queryForList("SELECT r.id,r.draft_id,r.stage,r.input_json,j.status,j.meta_json,j.error_message FROM creation_runs r JOIN jobs j ON r.job_id=j.id WHERE r.status IN ('PENDING','RUNNING')");
        for(var row:rows){
            String status=(String)row.get("status"),output=null,error=(String)row.get("error_message");
            if("SUCCEEDED".equals(status)) {
                try {
                    output=json.readTree((String)row.get("meta_json")).path("text").asText("");
                    if("STORYBOARD_PARTIAL".equals(row.get("stage"))) {
                        var frozen=json.readTree((String)row.get("input_json"));
                        Body base=json.treeToValue(frozen.path("body"),Body.class);
                        PartialGenerate request=json.treeToValue(frozen.path("request"),PartialGenerate.class);
                        output=encode(new PartialStoryboardContract(json,contract).merge(output,base,request.shotIds()));
                    }
                    else if("STORYBOARD".equals(row.get("stage"))) {Brief b=json.treeToValue(json.readTree((String)row.get("input_json")).path("brief"),Brief.class);contract.parse(output,b.duration(),contract.sources(b));}
                    else text(output,20000,"生成的剧本");
                }catch(Exception e){status="INVALID";error=e instanceof BusinessException?e.getMessage():"任务结果无法解析，原始输出已保留";}
            }
            if("FAILED".equals(status)) {
                try {output=json.readTree((String)row.get("meta_json")).path("partialText").asText(null);}
                catch(Exception ignored){ /* Keep the recorded failure even if its metadata cannot be read. */ }
            }
            db.update("UPDATE creation_runs SET status=?,output_text=?,error_message=? WHERE id=? AND status IN ('PENDING','RUNNING')",status,output,error,row.get("id"));
        }
    }
    private Draft update(Draft d,Body next,String action,Long run){db.update("UPDATE creation_drafts SET revision=revision+1,title=?,body_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",title(next.brief().theme()),encode(next),d.id());event(d.id(),d.revision()+1,action,run,d.body(),next);return owned(d.id(),false);}
    private void event(long id,long revision,String action,Long run,Body before,Body after){db.update("INSERT INTO creation_events(draft_id,user_id,revision,action,run_id,before_json,after_json) VALUES(?,?,?,?,?,?,?)",id,user(),revision,action,run,before==null?null:encode(before),encode(after));}
    private void revision(Draft d,long revision){require(d.revision()==revision,"创作版本已变化，请刷新后再操作；本地修改请先保留");}
    private void requestId(String id){require(id!=null&&id.matches("[A-Za-z0-9_-]{1,80}"),"请求标识无效");}
    private String title(String s){return s.length()>128?s.substring(0,128):s;}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("创作数据保存失败",e);}}
    private <T>T decode(String raw,Class<T> type){try{return json.readValue(raw,type);}catch(Exception e){throw new IllegalStateException("创作数据读取失败",e);}}
}
