package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.service.impl.ShotServiceImpl;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.provider.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class PublishedShotPromptTest {
    @Test void synchronousAssetParserUsesPublishedPromptAndFailsClosed() {
        var service=org.mockito.Mockito.mock(ShotServiceImpl.class,org.mockito.Mockito.CALLS_REAL_METHODS);
        var library=mock(WorkbenchLibraryService.class);
        var provider=mock(PromptTextExecution.class);
        ReflectionTestUtils.setField(service,"library",library);
        ReflectionTestUtils.setField(service,"promptTextExecution",provider);
        ReflectionTestUtils.setField(service,"aiProperties",new AiProperties());
        when(library.published("SHOT_PARSE_ASSETS")).thenReturn(new WorkbenchLibraryService.Prompt("SHOT_PARSE_ASSETS",2,"published asset parser","rawText","TEXT","PUBLISHED","test",null,"",2));
        when(provider.generate(any(),anyString(),anyString(),anyInt())).thenReturn("{\"script_segments\":[\"片段\"],\"characters\":[\"角色\"],\"scenes\":[\"场景\"]}");
        assertThat((Object)ReflectionTestUtils.invokeMethod(service,"parseScriptWithCharactersAndScenes","原文")).isNotNull();
        verify(provider).generate(argThat(p -> p.version() == 2 && p.content().equals("published asset parser")),eq("原文"),anyString(),anyInt());
        reset(provider);
        when(library.published("SHOT_PARSE_ASSETS")).thenThrow(new IllegalStateException("已禁用"));
        assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(service,"parseScriptWithCharactersAndScenes","原文")).hasMessageContaining("已禁用");
        verifyNoInteractions(provider);
    }
}
