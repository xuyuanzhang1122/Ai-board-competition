package com.ym.ai_story_studio_server.creation;

import com.ym.ai_story_studio_server.service.AiTextService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.Set;
import java.util.concurrent.*;

@Component
public class CreationWorker {
    private final CreationService creation;
    private final AiTextService text;
    private final Executor executor;
    private final Set<Long> submitted=ConcurrentHashMap.newKeySet();
    private volatile boolean ready;
    public CreationWorker(CreationService creation,AiTextService text,@Qualifier("textTaskExecutor") Executor executor){this.creation=creation;this.text=text;this.executor=executor;}
    @EventListener(ApplicationReadyEvent.class)
    public void recover(){creation.reconcileInterruptedJobs();ready=true;}
    @Scheduled(fixedDelayString="${creation.poll-delay-ms:1000}")
    public void poll(){
        if(!ready)return;
        creation.synchronizeResults();
        for(var job:creation.pendingJobs()) {
            long id=((Number)job.get("id")).longValue(),user=((Number)job.get("user_id")).longValue(),project=((Number)job.get("project_id")).longValue();
            if(!submitted.add(id))continue;
            try{executor.execute(()->{try{text.executeQueuedTextJob(id,user,project);creation.synchronizeResults();}finally{submitted.remove(id);}});}
            catch(RejectedExecutionException e){submitted.remove(id);break;}
        }
    }
}
