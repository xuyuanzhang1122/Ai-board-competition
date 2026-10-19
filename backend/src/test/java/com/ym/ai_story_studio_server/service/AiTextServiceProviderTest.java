package com.ym.ai_story_studio_server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateRequest;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.entity.Job;
import com.ym.ai_story_studio_server.provider.OfficialTextProvider;
import com.ym.ai_story_studio_server.provider.TextProviderProperties;
import com.ym.ai_story_studio_server.provider.TextGenerationResult;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AiTextServiceProviderTest {
    @Test
    void queuedTaskFreezesInputAndParametersAndUsesTheSameJob() throws Exception {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        AiProperties settings = new AiProperties();
        settings.getText().setMaxTokens(256);
        settings.getText().setTemperature(0.4);
        settings.getText().setTopP(0.8);
        when(jobs.insert(any(Job.class))).thenAnswer(invocation -> {
            invocation.<Job>getArgument(0).setId(12L);
            return 1;
        });
        AiTextService service = new AiTextService(provider, charging, jobs, settings, new ObjectMapper(), Runnable::run);
        Job queued = service.createQueuedParsingJob(1L, 7L, "原始八仙过海创作输入");
        when(jobs.selectById(12L)).thenReturn(queued);
        when(jobs.claimPendingTextJob(12L, 1L, 7L)).thenReturn(1);
        when(charging.charge(any())).thenReturn(ChargingService.ChargingResult.builder().totalCost(1).build());
        when(provider.generateText(any(), any(), any(), any(), any()))
                .thenReturn(new TextGenerationResult("草稿", "revision", "DEEPSEEK", "req-1", 10, 6, 4, "budget-1"));
        settings.getText().setModel("mimo-v2.6-pro");
        settings.getText().setMaxTokens(999);
        settings.getText().setTemperature(0.9);
        service.executeQueuedTextJob(12L, 1L, 7L);
        verify(provider).generateText("原始八仙过海创作输入", "deepseek-flash", 256, 0.4, 0.8);
        verify(jobs, times(1)).insert(any(Job.class));
        verify(jobs).finishClaimedTextJob(queued);
        assertThat(queued.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(queued.getJobType()).isEqualTo("PARSE_TEXT");
        var metadata = new ObjectMapper().readTree(queued.getMetaJson());
        assertThat(metadata.path("budgetReservationId").asText()).isEqualTo("budget-1");
        assertThat(metadata.path("inputTokens").asInt()).isEqualTo(6);
        assertThat(metadata.path("outputTokens").asInt()).isEqualTo(4);
    }

    @Test
    void terminalRunningOrLostClaimNeverChargesOrCallsProvider() {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper(), Runnable::run);
        Job job = queuedFixture();
        when(jobs.selectById(12L)).thenReturn(job);
        for (String state : new String[]{"SUCCEEDED", "FAILED", "CANCELED", "RUNNING"}) {
            job.setStatus(state);
            service.executeQueuedTextJob(12L, 1L, 7L);
        }
        verifyNoInteractions(provider, charging);
        job.setStatus("PENDING");
        when(jobs.claimPendingTextJob(12L, 1L, 7L)).thenReturn(0);
        service.executeQueuedTextJob(12L, 1L, 7L);
        verifyNoInteractions(charging);
        verify(provider, never()).generateText(any(), any(), any(), any(), any());
    }

    @Test
    void forgedMessageIdentityCannotMutateOrExecuteJob() {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        when(jobs.selectById(12L)).thenReturn(queuedFixture());
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper(), Runnable::run);
        assertThatThrownBy(() -> service.executeQueuedTextJob(12L, 2L, 7L)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.executeQueuedTextJob(12L, 1L, 8L)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(provider, charging);
        verify(jobs, never()).claimPendingTextJob(any(), any(), any());
        verify(jobs, never()).finishClaimedTextJob(any());
    }

    private Job queuedFixture() {
        Job job = new Job();
        job.setId(12L);
        job.setUserId(1L);
        job.setProjectId(7L);
        job.setJobType("PARSE_TEXT");
        job.setStatus("PENDING");
        job.setMetaJson("{\"model\":\"deepseek-flash\",\"textSnapshot\":{\"version\":1,\"model\":\"deepseek-flash\",\"prompt\":\"八仙过海\",\"maxTokens\":256,\"temperature\":0.4,\"topP\":0.8}}");
        return job;
    }

    @Test
    void completedJobPreservesSupplierIdentityAndUnknownUsage() throws Exception {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        when(jobs.insert(any(Job.class))).thenAnswer(invocation -> {
            invocation.<Job>getArgument(0).setId(1L);
            return 1;
        });
        when(charging.charge(any())).thenReturn(ChargingService.ChargingResult.builder().totalCost(1).build());
        when(provider.generateText(any(), any(), any(), any(), any()))
                .thenReturn(new TextGenerationResult("草稿", "actual-revision", "DEEPSEEK", "req-1", null));
        ObjectMapper mapper = new ObjectMapper();
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), mapper, Runnable::run);
        service.generateText(new TextGenerateRequest("八仙过海", null, null, 1L));
        var captor = org.mockito.ArgumentCaptor.forClass(Job.class);
        verify(jobs).finishClaimedTextJob(captor.capture());
        var metadata = mapper.readTree(captor.getValue().getMetaJson());
        assertThat(metadata.path("model").asText()).isEqualTo("deepseek-flash");
        assertThat(metadata.path("provider").asText()).isEqualTo("DEEPSEEK");
        assertThat(metadata.path("upstreamModel").asText()).isEqualTo("actual-revision");
        assertThat(metadata.path("providerRequestId").asText()).isEqualTo("req-1");
        assertThat(metadata.path("usageKnown").asBoolean()).isFalse();
    }

    @Test
    void invalidConfiguredParametersNeverCreateJobOrCharge() {
        TextProviderProperties properties = new TextProviderProperties();
        properties.getDeepseek().setEnabled(true);
        properties.getDeepseek().setApiKey("test-only-key");
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        AiProperties settings = new AiProperties();
        settings.getText().setMaxTokens(0);
        AiTextService service = new AiTextService(new OfficialTextProvider(properties,
                mock(com.ym.ai_story_studio_server.provider.TextModelAccess.class),
                mock(com.ym.ai_story_studio_server.budget.TextBudgetPolicy.class),
                mock(com.ym.ai_story_studio_server.budget.TextBudgetLedger.class)), charging, jobs, settings, new ObjectMapper(), Runnable::run);
        TextGenerateRequest request = new TextGenerateRequest("八仙过海", null, null, 1L);
        assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(charging, jobs);
    }

    @Test
    void queuedLegacyTaskWithoutSnapshotFailsBeforeProviderCall() {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        Job historical = new Job();
        historical.setId(12L);
        historical.setUserId(1L);
        historical.setProjectId(7L);
        historical.setJobType("TEXT_GENERATION");
        historical.setStatus("PENDING");
        historical.setMetaJson("{\"model\":\"gemini-3.5-flash\"}");
        when(jobs.selectById(12L)).thenReturn(historical);
        doThrow(new BusinessException(ResultCode.PARAM_INVALID)).when(provider).validateModelConfiguration("gemini-3.5-flash");
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper(), Runnable::run);
        service.executeQueuedTextJob(12L, 1L, 7L);
        verify(jobs).failPendingTextJob(eq(12L), eq(1L), eq(7L), anyString());
        verifyNoInteractions(charging);
        verify(provider, never()).generateText(any(), any(), any(), any(), any());
    }

    @Test
    void requestValidationAcceptsOnlyNewApiModelIds() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (String model : new String[]{"deepseek-flash", "deepseek-v4-pro", "mimo-v2.6-pro"}) {
                assertThat(validator.validate(new TextGenerateRequest("八仙过海", null, null, 1L, model))).isEmpty();
            }
            for (String model : new String[]{"gemini-3.5-flash", "gpt-4o", "mimo-v2X6-pro"}) {
                assertThat(validator.validate(new TextGenerateRequest("八仙过海", null, null, 1L, model))).isNotEmpty();
            }
        }
    }

    @Test
    void unsupportedModelNeverCreatesJobOrChargesForSyncOrAsyncSubmission() {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper(), Runnable::run);
        TextGenerateRequest request = new TextGenerateRequest("八仙过海", null, null, 1L, "gemini-3.5-flash");
        doThrow(new BusinessException(ResultCode.PARAM_INVALID)).when(provider).validateModelConfiguration("gemini-3.5-flash");
        assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.generateTextAsync(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(charging, jobs);
    }
}
