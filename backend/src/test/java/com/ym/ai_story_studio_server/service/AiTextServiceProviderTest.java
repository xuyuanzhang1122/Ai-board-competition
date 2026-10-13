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
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), mapper);
        service.generateText(new TextGenerateRequest("八仙过海", null, null, 1L));
        var captor = org.mockito.ArgumentCaptor.forClass(Job.class);
        verify(jobs).updateById(captor.capture());
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
        AiTextService service = new AiTextService(new OfficialTextProvider(properties), charging, jobs, settings, new ObjectMapper());
        TextGenerateRequest request = new TextGenerateRequest("八仙过海", null, null, 1L);
        assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(charging, jobs);
    }

    @Test
    void restoredOldTaskCannotUseNewRequestModelToBypassValidation() {
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        ChargingService charging = mock(ChargingService.class);
        JobMapper jobs = mock(JobMapper.class);
        Job historical = new Job();
        historical.setId(12L);
        historical.setUserId(1L);
        historical.setMetaJson("{\"model\":\"gemini-3.5-flash\"}");
        when(jobs.selectById(12L)).thenReturn(historical);
        doThrow(new BusinessException(ResultCode.PARAM_INVALID)).when(provider).validateModelConfiguration("gemini-3.5-flash");
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper());
        service.executeTextGenerationAsync(12L, new TextGenerateRequest("八仙过海", null, null, 1L, "deepseek-flash"));
        assertThat(historical.getStatus()).isEqualTo("FAILED");
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
        AiTextService service = new AiTextService(provider, charging, jobs, new AiProperties(), new ObjectMapper());
        TextGenerateRequest request = new TextGenerateRequest("八仙过海", null, null, 1L, "gemini-3.5-flash");
        doThrow(new BusinessException(ResultCode.PARAM_INVALID)).when(provider).validateModelConfiguration("gemini-3.5-flash");
        assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.generateTextAsync(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(charging, jobs);
    }
}
