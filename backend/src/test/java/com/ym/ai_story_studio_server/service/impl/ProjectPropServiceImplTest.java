package com.ym.ai_story_studio_server.service.impl;

import com.ym.ai_story_studio_server.dto.prop.ProjectPropVO;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.entity.ProjectProp;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.mapper.ProjectPropMapper;
import com.ym.ai_story_studio_server.mapper.PropLibraryMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectPropServiceImplTest {

    @Mock
    private ProjectPropMapper projectPropMapper;
    @Mock
    private PropLibraryMapper propLibraryMapper;
    @Mock
    private ProjectMapper projectMapper;

    @InjectMocks
    private ProjectPropServiceImpl service;

    @Test
    void getProjectPropSupportsCustomPropWithoutLibraryLink() {
        Project project = new Project();
        project.setId(14L);
        project.setUserId(1L);

        ProjectProp prop = new ProjectProp();
        prop.setId(253L);
        prop.setProjectId(14L);
        prop.setDisplayName("锦被");
        prop.setOverrideDescription("新制的锦被");
        prop.setThumbnailUrl("/uploads/prop.png");

        when(projectMapper.selectById(14L)).thenReturn(project);
        when(projectPropMapper.selectById(253L)).thenReturn(prop);

        ProjectPropVO result = service.getProjectProp(1L, 14L, 253L);

        assertThat(result.name()).isEqualTo("锦被");
        assertThat(result.description()).isEqualTo("新制的锦被");
        assertThat(result.thumbnailUrl()).isEqualTo("/uploads/prop.png");
        assertThat(result.libraryPropId()).isNull();
        verify(propLibraryMapper, never()).selectById(anyLong());
    }
}
