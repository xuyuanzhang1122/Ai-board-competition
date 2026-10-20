package com.ym.ai_story_studio_server.brainstorm;

import com.ym.ai_story_studio_server.service.AiTextService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.Set;
import java.util.concurrent.*;

@Component
public class BrainstormWorker {
    private final BrainstormService service;
    private final AiTextService text;
    private final Executor executor;
    private final Set<Long> submitted=ConcurrentHashMap.newKeySet();
    private volatile boolean ready;
    public BrainstormWorker(BrainstormService service,AiTextService text,@Qualifier("textTaskExecutor") Executor executor) {
        this.service=service;this.text=text;this.executor=executor;
    }
    @EventListener(ApplicationReadyEvent.class)
    public void recover() {service.reconcileInterruptedJobs();ready=true;}
    @Scheduled(fixedDelayString="${brainstorm.poll-delay-ms:1500}")
    public void poll() {
        if(!ready)return;
        service.synchronizeResults();
        for(var job:service.pendingJobs()) {
            long id=((Number)job.get("id")).longValue(),owner=((Number)job.get("user_id")).longValue(),project=((Number)job.get("project_id")).longValue();
            if(!submitted.add(id))continue;
            try {executor.execute(()->{try{text.executeQueuedTextJob(id,owner,project);service.synchronizeResults();}finally{submitted.remove(id);}});}
            catch(RejectedExecutionException e){submitted.remove(id);break;}
        }
    }
}
