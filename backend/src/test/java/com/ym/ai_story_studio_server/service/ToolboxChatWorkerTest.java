package com.ym.ai_story_studio_server.service;

import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.RejectedExecutionException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ToolboxChatWorkerTest {
    @Test void recoveredPendingWorkRunsWithoutAnyBrowserAndIsNotEnqueuedTwice(){
        var chat=mock(ToolboxChatService.class);var text=mock(AiTextService.class);
        var work=new ArrayList<Runnable>();
        when(chat.pendingJobs()).thenReturn(List.of(Map.of("id",4L,"user_id",7L,"project_id",0L)));
        var worker=new ToolboxChatWorker(chat,text,work::add);
        worker.poll();assertThat(work).isEmpty();
        worker.recover();worker.poll();worker.poll();
        assertThat(work).hasSize(1);
        work.get(0).run();
        verify(text).executeQueuedTextJob(4L,7L,0L);
        verify(chat).reconcileInterruptedJobs();
    }
    @Test void saturatedVolatileExecutorLeavesDurableJobAvailableForAnotherPoll(){
        var chat=mock(ToolboxChatService.class);var text=mock(AiTextService.class);
        var work=new ArrayList<Runnable>();var rejected=new java.util.concurrent.atomic.AtomicBoolean(true);
        when(chat.pendingJobs()).thenReturn(List.of(Map.of("id",4L,"user_id",7L,"project_id",0L)));
        var worker=new ToolboxChatWorker(chat,text,r->{if(rejected.getAndSet(false))throw new RejectedExecutionException();work.add(r);});
        worker.recover();worker.poll();assertThat(work).isEmpty();worker.poll();
        assertThat(work).hasSize(1);work.get(0).run();verify(text).executeQueuedTextJob(4L,7L,0L);
    }
}
