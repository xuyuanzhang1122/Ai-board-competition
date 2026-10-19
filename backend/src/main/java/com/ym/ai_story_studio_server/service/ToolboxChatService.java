package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.toolbox.chat.*;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn;
import com.ym.ai_story_studio_server.util.UserContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;

/** Server-authored conversations. No client can replace assistant turns or task state. */
@Service
public class ToolboxChatService {
    public record Detail(ChatSession session, List<ChatMessage> messages) {}
    public record Accepted(ChatMessage userMessage, ChatMessage assistantMessage, long jobId) {}
    private final JdbcTemplate db;
    private final TransactionTemplate transactions;
    private final AiTextService text;
    private final ObjectMapper json;
    public ToolboxChatService(JdbcTemplate db, TransactionTemplate transactions, AiTextService text, ObjectMapper json) {
        this.db=db; this.transactions=transactions; this.text=text; this.json=json;
    }
    private static final RowMapper<ChatSession> SESSION=(r,n)->new ChatSession(r.getLong("id"),r.getString("title"),r.getTimestamp("created_at").toLocalDateTime(),r.getTimestamp("updated_at").toLocalDateTime());
    private static final RowMapper<ChatMessage> MESSAGE=(r,n)->new ChatMessage(r.getLong("id"),r.getString("role"),r.getString("type"),r.getString("content"),r.getString("model"),r.getObject("job_id",Long.class),r.getString("status"),r.getString("result_url"),r.getString("error_message"),r.getTimestamp("created_at").toLocalDateTime());
    private long user() {
        Long user=UserContext.getUserId();
        if(user==null) throw new BusinessException(ResultCode.UNAUTHORIZED);
        return user;
    }
    public List<ChatSession> sessions(){return db.query("SELECT * FROM toolbox_chat_sessions WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC",SESSION,user());}
    public ChatSession createSession(String title){
        long user=user();
        String value=title==null||title.isBlank()?"新对话":title.trim();
        if(value.length()>100) throw new BusinessException(ResultCode.PARAM_INVALID,"会话标题过长");
        long id=insert("INSERT INTO toolbox_chat_sessions(user_id,title) VALUES(?,?)",user,value);
        return owned(id,false);
    }
    private ChatSession owned(long id, boolean lock){
        var result=db.query("SELECT * FROM toolbox_chat_sessions WHERE id=? AND user_id=? AND deleted_at IS NULL"+(lock?" FOR UPDATE":""),SESSION,id,user());
        if(result.isEmpty()) throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND,"会话不存在");
        return result.get(0);
    }
    public Detail detail(long id){var session=owned(id,false); return new Detail(session,messages(id));}
    private List<ChatMessage> messages(long id){return db.query("SELECT * FROM toolbox_chat_messages WHERE session_id=? ORDER BY id",MESSAGE,id);}
    public Accepted send(long id,ChatSendRequest request){
        return transactions.execute(tx->{
            owned(id,true);
            var previous=db.query("SELECT * FROM toolbox_chat_messages WHERE session_id=? AND client_request_id=? ORDER BY id",MESSAGE,id,request.clientRequestId());
            if(!previous.isEmpty()) {
                var u=previous.get(0);
                if(!Objects.equals(u.content(),request.content())||!Objects.equals(u.model(),request.model())||!Objects.equals(u.type(),request.type()))
                    throw new BusinessException(ResultCode.PARAM_INVALID,"请求标识已用于其他消息");
                return new Accepted(u,previous.get(1),previous.get(1).jobId());
            }
            if(!"TEXT".equals(request.type())) throw new BusinessException(ResultCode.METHOD_NOT_ALLOWED,"图片和视频供应商尚未开放，暂不能执行");
            if(request.clientRequestId()==null || !request.clientRequestId().matches("[A-Za-z0-9_-]{1,80}") || request.content()==null || request.content().isBlank() || request.content().length()>10000)
                throw new BusinessException(ResultCode.PARAM_INVALID,"消息参数无效");
            synchronizeResults();
            Integer active=db.queryForObject("SELECT COUNT(*) FROM toolbox_chat_messages m JOIN jobs j ON m.job_id=j.id WHERE m.session_id=? AND (j.status IN ('PENDING','RUNNING') OR m.status IN ('PENDING','RUNNING'))",Integer.class,id);
            if(active!=null && active>0) throw new BusinessException(ResultCode.REQUEST_TOO_FREQUENT,"本会话已有任务执行中，请等待完成");
            var history=messages(id);
            var turns=new ArrayList<ChatTurn>();
            // Include completed exchanges only; failed/canceled prompts have no assistant context.
            for(int i=0;i+1<history.size();i+=2){
                var u=history.get(i); var a=history.get(i+1);
                if("USER".equals(u.role())&&"ASSISTANT".equals(a.role())&&"SUCCEEDED".equals(a.status())&&"TEXT".equals(a.type())) {
                    turns.add(new ChatTurn("user",u.content())); turns.add(new ChatTurn("assistant",a.content()));
                }
            }
            turns.add(new ChatTurn("user",request.content()));
            if(turns.size()>200) throw new BusinessException(ResultCode.PARAM_INVALID,"本会话上下文过长，请创建新对话后继续");
            var job=text.createQueuedConversationJob(user(),request.model(),turns);
            long u=insert("INSERT INTO toolbox_chat_messages(session_id,client_request_id,role,type,content,model,status) VALUES(?,?,'USER',?,?,?,'SUCCEEDED')",id,request.clientRequestId(),request.type(),request.content(),request.model());
            long a=insert("INSERT INTO toolbox_chat_messages(session_id,client_request_id,role,type,content,model,job_id,status) VALUES(?,?,'ASSISTANT',?,'',?,?,'PENDING')",id,request.clientRequestId(),request.type(),request.model(),job.getId());
            db.update("UPDATE toolbox_chat_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
            return new Accepted(message(u),message(a),job.getId());
        });
    }
    public ChatMessage cancel(long messageId){
        return transactions.execute(tx->{
            var m=message(messageId);
            Long session=db.queryForObject("SELECT session_id FROM toolbox_chat_messages WHERE id=?",Long.class,messageId);
            owned(session,true);
            if(!"ASSISTANT".equals(m.role())) throw new BusinessException(ResultCode.PARAM_INVALID,"只能取消助手任务");
            db.update("UPDATE jobs SET status='CANCELED',finished_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'",m.jobId());
            // A running supplier call continues and remains auditable; only the visible message is canceled.
            db.update("UPDATE toolbox_chat_messages SET status='CANCELED',error_message='已停止显示；已受理的上游调用可能继续执行' WHERE id=? AND status IN ('PENDING','RUNNING')",messageId);
            return message(messageId);
        });
    }
    public void deleteSession(long id){transactions.executeWithoutResult(tx->{owned(id,true);db.update("UPDATE toolbox_chat_sessions SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",id);});}
    private ChatMessage message(long id){var rows=db.query("SELECT * FROM toolbox_chat_messages WHERE id=?",MESSAGE,id);if(rows.isEmpty())throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND,"消息不存在");return rows.get(0);}
    private long insert(String sql,Object... args){
        var key=new GeneratedKeyHolder();
        db.update(connection->{var statement=connection.prepareStatement(sql,new String[]{"id"});for(int i=0;i<args.length;i++)statement.setObject(i+1,args[i]);return statement;},key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
    /** Never resubmit calls whose acceptance is uncertain after a process restart. */
    public void reconcileInterruptedJobs(){
        db.update("UPDATE jobs SET status='FAILED',error_message='服务重启，上游受理状态需确认；未自动重发，请核对后重试',finished_at=CURRENT_TIMESTAMP WHERE status='RUNNING' AND id IN (SELECT job_id FROM toolbox_chat_messages WHERE job_id IS NOT NULL)");
        synchronizeResults();
    }
    public void synchronizeResults(){
        var rows=db.query("SELECT m.id,m.session_id,j.status,j.meta_json,j.error_message,j.result_url FROM toolbox_chat_messages m JOIN jobs j ON m.job_id=j.id WHERE m.role='ASSISTANT' AND m.status IN ('PENDING','RUNNING')",(r,n)->{
            Map<String,Object> row=new HashMap<>();
            row.put("id",r.getLong("id"));row.put("status",r.getString("status"));
            row.put("meta_json",r.getString("meta_json"));row.put("error_message",r.getString("error_message"));
            row.put("result_url",r.getString("result_url"));return row;
        });
        for(var row:rows){
            String state=(String)row.get("status");
            String content="";
            if("SUCCEEDED".equals(state)) {
                try {content=json.readTree((String)row.get("meta_json")).path("text").asText("");}
                catch(Exception e){state="FAILED";row.put("error_message","任务结果无法读取，请核对任务记录");}
            }
            db.update("UPDATE toolbox_chat_messages SET status=?,content=?,error_message=?,result_url=? WHERE id=? AND status IN ('PENDING','RUNNING')",state,content,row.get("error_message"),row.get("result_url"),row.get("id"));
        }
    }
    public List<Map<String,Object>> pendingJobs(){return db.queryForList("SELECT DISTINCT j.id,j.user_id,j.project_id FROM jobs j JOIN toolbox_chat_messages m ON m.job_id=j.id WHERE j.status='PENDING' ORDER BY j.id LIMIT 16");}
}
