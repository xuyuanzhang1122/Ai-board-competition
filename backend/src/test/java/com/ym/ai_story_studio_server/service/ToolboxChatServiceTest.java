package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.dto.toolbox.chat.ChatSendRequest;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider.ChatTurn;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ToolboxChatServiceTest {
    JdbcTemplate db; AiTextService text; ToolboxChatService chat;
    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:chat"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds);
        db.execute("CREATE TABLE toolbox_chat_sessions(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id BIGINT,title VARCHAR(100),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at TIMESTAMP)");
        db.execute("CREATE TABLE toolbox_chat_messages(id BIGINT AUTO_INCREMENT PRIMARY KEY,session_id BIGINT,client_request_id VARCHAR(80),role VARCHAR(20),type VARCHAR(10),content CLOB,model VARCHAR(100),job_id BIGINT,status VARCHAR(20),result_url VARCHAR(2048),error_message VARCHAR(1000),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(session_id,client_request_id,role))");
        db.execute("CREATE TABLE jobs(id BIGINT PRIMARY KEY,user_id BIGINT,project_id BIGINT,status VARCHAR(20),meta_json CLOB,error_message VARCHAR(1000),result_url VARCHAR(2048),finished_at TIMESTAMP)");
        text = mock(AiTextService.class);
        var jobIds=new java.util.concurrent.atomic.AtomicLong(100);
        when(text.createQueuedConversationJob(anyLong(),anyString(),anyList())).thenAnswer(i -> { Job j=new Job(); j.setId(jobIds.getAndIncrement()); db.update("INSERT INTO jobs(id,user_id,project_id,status,meta_json) VALUES(?,?,0,'PENDING','{}')",j.getId(), i.<Long>getArgument(0)); return j; });
        chat = new ToolboxChatService(db, new TransactionTemplate(new DataSourceTransactionManager(ds)),text,new ObjectMapper());
        UserContext.setUserId(1L);
    }
    @AfterEach void cleanup(){UserContext.clear();}
    ChatSendRequest request(String id,String content){return new ChatSendRequest(id,"TEXT","deepseek-flash",content,null);}
    @Test void acceptanceIsIdempotentAndReopeningReturnsBothSavedMessages(){
        long id=chat.createSession(null).id();
        var first=chat.send(id,request("request-1","你好"));
        var retry=chat.send(id,request("request-1","你好"));
        assertThat(retry).isEqualTo(first);
        assertThat(chat.detail(id).messages()).hasSize(2);
        verify(text,times(1)).createQueuedConversationJob(eq(1L),eq("deepseek-flash"),eq(List.of(new ChatTurn("user","你好"))));
    }
    @Test void ownershipAndSerialExecutionAreEnforced(){
        long id=chat.createSession(null).id(); chat.send(id,request("request-1","你好"));
        assertThatThrownBy(()->chat.send(id,request("request-2","下一轮"))).isInstanceOf(BusinessException.class);
        UserContext.setUserId(2L);
        assertThatThrownBy(()->chat.detail(id)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->chat.send(id,request("request-1","你好"))).isInstanceOf(BusinessException.class);
    }
    @Test void successfulServerTurnsAreUsedForNextFrozenContext(){
        long id=chat.createSession(null).id(); chat.send(id,request("request-1","记住苹果"));
        db.update("UPDATE jobs SET status='SUCCEEDED',meta_json='{\"text\":\"记住了\"}' WHERE id=100"); chat.synchronizeResults();
        chat.send(id,request("request-2","记住什么"));
        verify(text).createQueuedConversationJob(eq(1L),eq("deepseek-flash"),eq(List.of(new ChatTurn("user","记住苹果"),new ChatTurn("assistant","记住了"),new ChatTurn("user","记住什么"))));
    }
    @Test void cancelPendingNeverDispatchesAndMediaNeverCallsSupplier(){
        long id=chat.createSession(null).id(); var pair=chat.send(id,request("request-1","你好"));
        assertThat(chat.cancel(pair.assistantMessage().id()).status()).isEqualTo("CANCELED");
        assertThat(db.queryForObject("SELECT status FROM jobs WHERE id=100",String.class)).isEqualTo("CANCELED");
        assertThatThrownBy(()->chat.send(id,new ChatSendRequest("request-2","IMAGE","x","画图",null))).isInstanceOf(BusinessException.class);
        verify(text,times(1)).createQueuedConversationJob(anyLong(),anyString(),anyList());
    }
    @Test void restartFailsUncertainRunningButLeavesPendingRecoverable(){
        long id=chat.createSession(null).id(); chat.send(id,request("request-1","你好"));
        chat.reconcileInterruptedJobs();
        assertThat(chat.pendingJobs()).hasSize(1);
        assertThat(chat.detail(id).messages().get(1).status()).isEqualTo("PENDING");
        db.update("UPDATE jobs SET status='RUNNING'"); chat.reconcileInterruptedJobs();
        assertThat(chat.detail(id).messages().get(1).status()).isEqualTo("FAILED");
        assertThat(chat.detail(id).messages().get(1).errorMessage()).contains("确认");
        verify(text,never()).executeQueuedTextJob(any(),any(),any());
    }
    @Test void failedAcceptanceRollsBackTheJobAndBothMessages(){
        long id=chat.createSession(null).id();
        doAnswer(i->{
            db.update("INSERT INTO jobs(id,user_id,project_id,status,meta_json) VALUES(101,1,0,'PENDING','{}')");
            throw new BusinessException(com.ym.ai_story_studio_server.common.ResultCode.SYSTEM_ERROR);
        }).when(text).createQueuedConversationJob(anyLong(),anyString(),anyList());
        assertThatThrownBy(()->chat.send(id,request("request-1","你好"))).isInstanceOf(BusinessException.class);
        assertThat(chat.detail(id).messages()).isEmpty();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM jobs",Integer.class)).isZero();
    }
    @Test void runningCancellationKeepsSupplierJobAndBlocksAnotherSend(){
        long id=chat.createSession(null).id();var accepted=chat.send(id,request("request-1","你好"));
        db.update("UPDATE jobs SET status='RUNNING'");chat.synchronizeResults();
        chat.cancel(accepted.assistantMessage().id());
        assertThat(db.queryForObject("SELECT status FROM jobs WHERE id=100",String.class)).isEqualTo("RUNNING");
        assertThatThrownBy(()->chat.send(id,request("request-2","第二轮"))).isInstanceOf(BusinessException.class);
        db.update("UPDATE jobs SET status='SUCCEEDED',meta_json='{\"text\":\"供应商结果\"}'");chat.synchronizeResults();
        assertThat(chat.detail(id).messages().get(1).status()).isEqualTo("CANCELED");
    }
    @Test void deletingSessionPreservesTaskAuditAndHidesItFromItsOwner(){
        long id=chat.createSession(null).id();chat.send(id,request("request-1","你好"));chat.deleteSession(id);
        assertThat(chat.sessions()).isEmpty();
        assertThatThrownBy(()->chat.detail(id)).isInstanceOf(BusinessException.class);
        assertThat(chat.pendingJobs()).hasSize(1);
    }
    @Test void overlongContextIsRejectedBeforeAcceptingOrChargingAJob(){
        long id=chat.createSession(null).id();
        for(int i=0;i<100;i++){
            db.update("INSERT INTO toolbox_chat_messages(session_id,client_request_id,role,type,content,model,status) VALUES(?,?,'USER','TEXT','问题','deepseek-flash','SUCCEEDED')",id,"old"+i);
            db.update("INSERT INTO toolbox_chat_messages(session_id,client_request_id,role,type,content,model,status) VALUES(?,?,'ASSISTANT','TEXT','答复','deepseek-flash','SUCCEEDED')",id,"old"+i);
        }
        assertThatThrownBy(()->chat.send(id,request("request-new","继续"))).isInstanceOf(BusinessException.class).hasMessageContaining("新对话");
        verifyNoInteractions(text);
    }
    @Test void changedPayloadCannotReuseAcceptedRequestId(){
        long id=chat.createSession(null).id(); chat.send(id,request("request-1","你好"));
        assertThatThrownBy(()->chat.send(id,request("request-1","更改内容"))).isInstanceOf(BusinessException.class);
    }
}
