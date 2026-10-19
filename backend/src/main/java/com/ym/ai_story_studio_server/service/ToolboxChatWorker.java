package com.ym.ai_story_studio_server.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/** DB polling, rather than an HTTP connection or volatile queue, owns accepted chat work. */
@Component
public class ToolboxChatWorker {
    private final ToolboxChatService chat;
    private final AiTextService text;
    private final Executor executor;
    private final Set<Long> submitted=ConcurrentHashMap.newKeySet();
    private volatile boolean ready;
    public ToolboxChatWorker(ToolboxChatService chat,AiTextService text,
            @Qualifier("textTaskExecutor") Executor executor){this.chat=chat;this.text=text;this.executor=executor;}
    @EventListener(ApplicationReadyEvent.class)
    public void recover(){chat.reconcileInterruptedJobs();ready=true;}
    @Scheduled(fixedDelayString="${toolbox.chat.poll-delay-ms:1000}")
    public void poll(){
        if(!ready)return;
        chat.synchronizeResults();
        for(var job:chat.pendingJobs()){
            long id=((Number)job.get("id")).longValue();
            long user=((Number)job.get("user_id")).longValue();
            long project=((Number)job.get("project_id")).longValue();
            if(!submitted.add(id))continue;
            try {executor.execute(()->{
                try {text.executeQueuedTextJob(id,user,project);chat.synchronizeResults();}
                finally{submitted.remove(id);}
            });}
            catch(RejectedExecutionException e){submitted.remove(id);break;} // Persisted PENDING retries on a later poll.
        }
    }
}
