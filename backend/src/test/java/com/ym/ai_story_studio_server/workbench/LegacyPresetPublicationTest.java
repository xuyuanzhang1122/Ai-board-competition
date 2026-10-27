package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.entity.*;
import com.ym.ai_story_studio_server.mapper.*;
import com.ym.ai_story_studio_server.service.impl.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LegacyPresetPublicationTest {
    @Test void systemTemplateReadsPublishedContentAndOmitsDisabledWithoutTouchingUserHistory() {
        var mapper=mock(PromptTemplateMapper.class);
        var library=mock(WorkbenchLibraryService.class);
        var system=new PromptTemplate(); system.setId(1L);system.setIsSystem(1);system.setContent("old");
        var user=new PromptTemplate();user.setId(2L);user.setIsSystem(0);user.setContent("user original");
        when(mapper.selectList(any())).thenReturn(List.of(system,user));
        when(library.publishedOrNull("SYSTEM_TEMPLATE_1")).thenReturn(new WorkbenchLibraryService.Prompt("SYSTEM_TEMPLATE_1",2,"new published","","TEXT","PUBLISHED","",null,null,2));
        var service=new PromptTemplateServiceImpl(mapper,library);
        assertThat(service.getTemplateList(9L,null)).extracting(x->x.content()).containsExactly("new published","user original");
        when(library.publishedOrNull("SYSTEM_TEMPLATE_1")).thenReturn(null);
        assertThat(service.getTemplateList(9L,null)).extracting(x->x.content()).containsExactly("user original");
        assertThat(system.getContent()).isEqualTo("old");
        verify(mapper,never()).updateById(any(PromptTemplate.class));
    }
    @Test void stylePresetsResolveOnlyPublishedVersions() {
        var mapper=mock(StylePresetMapper.class);var library=mock(WorkbenchLibraryService.class);
        var style=new StylePreset();style.setId(3L);style.setEnabled(0);style.setPromptPrefix("old prefix");
        when(mapper.selectList(any())).thenReturn(List.of(style));
        var service=new StylePresetServiceImpl(mapper,library);
        assertThat(service.getEnabledStylePresets()).isEmpty();
        when(library.publishedOrNull("STYLE_PRESET_3")).thenReturn(new WorkbenchLibraryService.Prompt("STYLE_PRESET_3",2,"new style","","MEDIA","PUBLISHED","",null,null,2));
        assertThat(service.getEnabledStylePresets()).extracting(x->x.promptPrefix()).containsExactly("new style");
        assertThat(service.getEnabledStylePresets().get(0).enabled()).isEqualTo(1);
        assertThat(style.getPromptPrefix()).isEqualTo("old prefix");
    }
}
