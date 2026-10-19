package com.ym.ai_story_studio_server.service.impl;

import com.ym.ai_story_studio_server.dto.admin.ModelUpsertRequest;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.mapper.AiModelMapper;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.provider.TextModelPolicy;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TextModelCatalogTest {
    @Test
    void unavailableMediaCannotBeAdvertisedOrReenabledEvenWithStaleDatabaseFlags() {
        var mapper = mock(AiModelMapper.class);
        var policy = new TextModelPolicy(mock(TextGenerationProvider.class));
        var admin = new AdminModelServiceImpl(mapper, policy);
        for (String type : new String[]{"IMAGE", " video ", "unknown"}) {
            AiModel media = model("unverified-media-model", "official-or-former-supplier", 1);
            media.setType(type);
            when(mapper.selectById(1L)).thenReturn(media);
            assertThat(policy.isAvailable(media)).isFalse();
            assertThatThrownBy(() -> admin.toggleEnabled(1L, true))
                    .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
            admin.toggleEnabled(1L, false);
            assertThat(media.getEnabled()).isZero();
        }
    }

    @Test
    void paddedLanguageTypeCannotBypassLegacyGuard() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        var service = new AdminModelServiceImpl(mapper, new TextModelPolicy(mock(TextGenerationProvider.class)));
        var legacyRequest = new ModelUpsertRequest("gemini-3.5-flash", "旧文本", "language ", "Geeknow", null, 0, "");
        assertThatThrownBy(() -> service.createModel(legacyRequest))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        AiModel legacy = model("gemini-3.5-flash", "Geeknow", 0);
        legacy.setType("LANGUAGE ");
        when(mapper.selectById(1L)).thenReturn(legacy);
        assertThatThrownBy(() -> service.toggleEnabled(1L, true))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        verify(mapper, never()).insert(any(AiModel.class));
        verify(mapper, never()).updateById(any(AiModel.class));
    }

    @Test
    void unconfiguredNewSupplierCannotBeEnabledByDatabaseFlag() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        when(mapper.selectById(1L)).thenReturn(model("deepseek-flash", "DeepSeek", 0));
        doThrow(new com.ym.ai_story_studio_server.exception.BusinessException(
                com.ym.ai_story_studio_server.common.ResultCode.CONFIG_ERROR))
                .when(provider).validateModelConfiguration("deepseek-flash");
        var service = new AdminModelServiceImpl(mapper, new TextModelPolicy(provider));
        assertThatThrownBy(() -> service.toggleEnabled(1L, true))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        verify(mapper, never()).updateById(any(AiModel.class));
    }

    @Test
    void staleEnabledDatabaseRowsCannotAdvertiseLegacyOrUnavailableTextModels() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        when(mapper.selectList(any())).thenReturn(List.of(
                model("gemini-3.5-flash", "Geeknow", 1), model("deepseek-flash", "DeepSeek", 1),
                model("mimo-v2.6-pro", "MiMo", 1), model("deepseek-v4-pro", "Geeknow", 1)));
        doThrow(new com.ym.ai_story_studio_server.exception.BusinessException(
                com.ym.ai_story_studio_server.common.ResultCode.CONFIG_ERROR))
                .when(provider).validateModelConfiguration("mimo-v2.6-pro");
        var service = new AiModelServiceImpl(mapper, new TextModelPolicy(provider));
        assertThat(service.getEnabledModelsByType("LANGUAGE")).extracting(v -> v.getCode())
                .containsExactly("deepseek-flash");
    }

    @Test
    void administratorCannotReenableLegacyModelButCanDisableIt() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        AiModel legacy = model("gemini-3.5-flash", "Geeknow", 0);
        when(mapper.selectById(1L)).thenReturn(legacy);
        var service = new AdminModelServiceImpl(mapper, new TextModelPolicy(mock(TextGenerationProvider.class)));
        assertThatThrownBy(() -> service.toggleEnabled(1L, true))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        verify(mapper, never()).updateById(any(AiModel.class));
        service.toggleEnabled(1L, false);
        verify(mapper).updateById(legacy);
    }

    @Test
    void createAndEditCannotBypassCodeSupplierAndAvailabilityChecks() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        TextGenerationProvider provider = mock(TextGenerationProvider.class);
        var service = new AdminModelServiceImpl(mapper, new TextModelPolicy(provider));
        var wrongSupplier = new ModelUpsertRequest("deepseek-flash", "文本", "LANGUAGE", "Geeknow", 1, 0, "");
        assertThatThrownBy(() -> service.createModel(wrongSupplier))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        when(mapper.selectById(1L)).thenReturn(model("deepseek-flash", "DeepSeek", 0));
        assertThatThrownBy(() -> service.updateModel(1L, wrongSupplier))
                .isInstanceOf(com.ym.ai_story_studio_server.exception.BusinessException.class);
        verify(mapper, never()).insert(any(AiModel.class));
        verify(mapper, never()).updateById(any(AiModel.class));
    }

    private AiModel model(String code, String provider, int enabled) {
        AiModel model = new AiModel();
        model.setId(1L);
        model.setCode(code);
        model.setName(code);
        model.setType("LANGUAGE");
        model.setProvider(provider);
        model.setEnabled(enabled);
        return model;
    }
}
