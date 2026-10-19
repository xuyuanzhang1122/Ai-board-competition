package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AiModelMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TextModelAccessTest {
    @Test
    void missingDisabledWrongTypeAndWrongSupplierCannotInvokeText() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        var access = new TextModelAccess(mapper,mock(OfficialModelCatalog.class));
        assertThatThrownBy(() -> access.requireEnabled("deepseek-flash")).isInstanceOf(BusinessException.class);
        AiModel row = new AiModel();
        row.setUpstreamPresent(1); row.setSourceUrl("https://api.deepseek.com/models"); row.setCode("deepseek-flash"); row.setType("LANGUAGE"); row.setProvider("DeepSeek"); row.setEnabled(0);
        when(mapper.selectOne(any())).thenReturn(row);
        assertThatThrownBy(() -> access.requireEnabled("deepseek-flash")).isInstanceOf(BusinessException.class);
        row.setEnabled(1); row.setType("IMAGE");
        assertThatThrownBy(() -> access.requireEnabled("deepseek-flash")).isInstanceOf(BusinessException.class);
        row.setType("LANGUAGE"); row.setProvider("Geeknow");
        assertThatThrownBy(() -> access.requireEnabled("deepseek-flash")).isInstanceOf(BusinessException.class);
    }

    @Test
    void validEnabledOfficialRowCanInvokeAndLegacyCodeNeverCan() {
        AiModelMapper mapper = mock(AiModelMapper.class);
        var access = new TextModelAccess(mapper,mock(OfficialModelCatalog.class));
        AiModel row = new AiModel();
        row.setUpstreamPresent(1); row.setSourceUrl("https://api.deepseek.com/models"); row.setCode("deepseek-flash"); row.setType("LANGUAGE"); row.setProvider("DeepSeek"); row.setEnabled(1);
        when(mapper.selectOne(any())).thenReturn(row);
        assertThatCode(() -> access.requireEnabled("deepseek-flash")).doesNotThrowAnyException();
        clearInvocations(mapper);
        assertThatThrownBy(() -> access.requireEnabled("gemini-3.5-flash")).isInstanceOf(BusinessException.class);
        verify(mapper).selectOne(any());
    }
}
