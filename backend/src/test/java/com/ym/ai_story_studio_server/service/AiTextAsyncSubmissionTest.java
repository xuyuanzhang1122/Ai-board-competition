package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.config.TextTaskExecutorConfig;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateRequest;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateResponse;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.provider.TextGenerationResult;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiTextAsyncSubmissionTest {
    @AfterEach
    void clearIdentity() { UserContext.clear(); }

    @Configuration
    @Import(AiTextService.class)
    static class Config {
        @Bean TextGenerationProvider provider() { return mock(TextGenerationProvider.class); }
        @Bean ChargingService charging() { return mock(ChargingService.class); }
        @Bean JobMapper jobs() { return mock(JobMapper.class); }
        @Bean AiProperties settings() { return new AiProperties(); }
        @Bean ObjectMapper mapper() { return new ObjectMapper(); }
        @Bean(name = {"textTaskExecutor", "taskExecutor"})
        ThreadPoolTaskExecutor executor() {
            ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1);
            executor.setMaxPoolSize(1);
            executor.setQueueCapacity(1);
            executor.setThreadNamePrefix("text-test-");
            executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
            return executor;
        }
    }

    private AtomicReference<Job> persistence(AnnotationConfigApplicationContext context) {
        JobMapper jobs = context.getBean(JobMapper.class);
        ObjectMapper mapper = context.getBean(ObjectMapper.class);
        AtomicReference<Job> saved = new AtomicReference<>();
        when(jobs.insert(any(Job.class))).thenAnswer(call -> {
            Job job = call.getArgument(0);
            job.setId(12L);
            saved.set(mapper.readValue(mapper.writeValueAsString(job), Job.class));
            return 1;
        });
        when(jobs.selectById(12L)).thenAnswer(call -> saved.get());
        when(jobs.claimPendingTextJob(12L, 1L, 0L)).thenReturn(1);
        when(jobs.failPendingTextJob(eq(12L), eq(1L), eq(0L), anyString())).thenAnswer(call -> {
            saved.get().setStatus("FAILED");
            saved.get().setErrorMessage(call.getArgument(3));
            return 1;
        });
        when(context.getBean(ChargingService.class).charge(any())).thenReturn(
                ChargingService.ChargingResult.builder().totalCost(0).build());
        return saved;
    }

    @Test
    void submissionReturnsWhileProviderIsBlockedAndWorkerUsesSavedIdentity() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService requests = Executors.newSingleThreadExecutor();
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var saved = persistence(context);
            AtomicReference<Long> workerUser = new AtomicReference<>();
            AtomicReference<String> workerThread = new AtomicReference<>();
            CountDownLatch finished = new CountDownLatch(1);
            when(context.getBean(JobMapper.class).finishClaimedTextJob(any())).thenAnswer(call -> {
                finished.countDown();
                return 1;
            });
            when(context.getBean(TextGenerationProvider.class).generateText(any(), any(), any(), any(), any()))
                    .thenAnswer(call -> {
                        workerUser.set(UserContext.getUserId());
                        workerThread.set(Thread.currentThread().getName());
                        entered.countDown();
                        if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test release timed out");
                        return new TextGenerationResult("草稿", "revision", "DEEPSEEK", "request-1", 10);
                    });
            try {
                Future<TextGenerateResponse> response = requests.submit(() -> {
                    UserContext.setUserId(1L);
                    try {
                        return context.getBean(AiTextService.class).generateTextAsync(
                                new TextGenerateRequest("八仙过海", null, null, null));
                    } finally { UserContext.clear(); }
                });
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                assertThatCode(() -> response.get(1, TimeUnit.SECONDS)).doesNotThrowAnyException();
                assertThat(response.get().jobId()).isEqualTo(12L);
                assertThat(workerUser.get()).isEqualTo(1L);
                assertThat(workerThread.get()).startsWith("text-test-");
                release.countDown();
                assertThat(finished.await(2, TimeUnit.SECONDS)).isTrue();
                assertThat(saved.get().getStatus()).isEqualTo("SUCCEEDED");
                var metadata = context.getBean(ObjectMapper.class).readTree(saved.get().getMetaJson());
                assertThat(metadata.path("text").asText()).isEqualTo("草稿");
                assertThat(metadata.path("textSnapshot").path("prompt").asText()).isEqualTo("八仙过海");
                assertThat(context.getBean(ThreadPoolTaskExecutor.class).submit(UserContext::getUserId)
                        .get(2, TimeUnit.SECONDS)).isNull();
            } finally { release.countDown(); }
        } finally {
            requests.shutdownNow();
            requests.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void fullExecutorFailsSavedJobWithoutCallingProviderOnRequestThread() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var saved = persistence(context);
            context.getBean(ThreadPoolTaskExecutor.class).execute(() -> {
                try { release.await(5, TimeUnit.SECONDS); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            context.getBean(ThreadPoolTaskExecutor.class).execute(() -> {});
            UserContext.setUserId(1L);
            try {
                assertThatThrownBy(() -> context.getBean(AiTextService.class).generateTextAsync(
                        new TextGenerateRequest("八仙过海", null, null, null)))
                        .isInstanceOf(BusinessException.class);
                assertThat(saved.get().getStatus()).isEqualTo("FAILED");
                assertThat(saved.get().getErrorMessage()).isNotBlank();
                assertThat(UserContext.getUserId()).isEqualTo(1L);
                verify(context.getBean(TextGenerationProvider.class), never()).generateText(any(), any(), any(), any(), any());
                verifyNoInteractions(context.getBean(ChargingService.class));
            } finally { release.countDown(); }
        }
    }

    @Test
    void productionExecutorRejectsSaturationAndShutdownWithoutCallerExecution() {
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<String> callerExecution = new AtomicReference<>();
        String callerThread = Thread.currentThread().getName();
        try (var context = new AnnotationConfigApplicationContext(TextTaskExecutorConfig.class)) {
            ThreadPoolTaskExecutor executor = context.getBean(ThreadPoolTaskExecutor.class);
            try {
                Runnable blocked = () -> {
                    if (Thread.currentThread().getName().equals(callerThread)) {
                        callerExecution.set(callerThread);
                        return;
                    }
                    try { release.await(5, TimeUnit.SECONDS); }
                    catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                };
                for (int i = 0; i < 36; i++) executor.execute(blocked);
                assertThatThrownBy(() -> executor.execute(blocked)).isInstanceOf(RejectedExecutionException.class);
                assertThat(callerExecution.get()).isNull();
            } finally { release.countDown(); }
        }
        ThreadPoolTaskExecutor stopped = new TextTaskExecutorConfig().textTaskExecutor();
        stopped.initialize();
        stopped.shutdown();
        assertThatThrownBy(() -> stopped.execute(() -> callerExecution.set("shutdown")))
                .isInstanceOf(RejectedExecutionException.class);
        assertThat(callerExecution.get()).isNull();
    }
}
