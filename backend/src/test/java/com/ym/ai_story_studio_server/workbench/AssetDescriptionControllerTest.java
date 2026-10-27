package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.Project;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.provider.*;
import com.ym.ai_story_studio_server.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.*;

class AssetDescriptionControllerTest {
    JdbcTemplate db; WorkbenchLibraryService library; ProjectMapper projects; TextGenerationProvider provider; AssetDescriptionController controller;
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:description"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds); var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        db.execute("CREATE TABLE creation_prompts(stage VARCHAR(20),version INT,content CLOB)");
        for(var file:java.util.List.of("V40__workbench_library.sql","V43__synchronous_prompt_execution_audit.sql"))
            for(String sql:Files.readString(Path.of("src/main/resources/db/migration/"+file)).split(";"))if(!sql.isBlank())db.execute(sql);
        db.update("INSERT INTO workbench_prompt_stages VALUES('ASSET_SCENE_DESCRIPTION',1,2)");
        db.update("INSERT INTO workbench_prompts(stage,version,content,variables,capability,status,change_note) VALUES('ASSET_SCENE_DESCRIPTION',1,'旧规则：{{assetName}} {{sourceText}}','assetName,sourceText','TEXT','PUBLISHED','test')");
        library=new WorkbenchLibraryService(db,tx);projects=mock(ProjectMapper.class);provider=mock(TextGenerationProvider.class);
        var ai=new AiProperties();ai.getText().setModel("stub-text");ai.getText().setMaxTokens(700);ai.getText().setTemperature(0.6);ai.getText().setTopP(0.8);
        controller=new AssetDescriptionController(projects,new ManagedPromptRenderer(library),new PromptTextExecution(db,tx,provider,new ObjectMapper()),ai);
        var project=new Project();project.setId(3L);project.setUserId(9L);when(projects.selectById(3L)).thenReturn(project);
        UserContext.setUserId(9L);AdminContext.setAdminId(1L);
    }
    @AfterEach void clear(){UserContext.clear();AdminContext.clear();}
    AssetDescriptionController.Request request(){return new AssetDescriptionController.Request("scene","蓬莱阁","原文 {{credentials}}",3L,null);}
    @Test void newPublicationAffectsNewDescriptionsOnlyAndDisableRejectsBeforeProvider() {
        when(provider.generateText(anyString(),eq("stub-text"),eq(700),eq(0.6),eq(0.8))).thenReturn(new TextGenerationResult("描述","stub-text","stub","id",8));
        assertThat(controller.describe(request()).getData()).containsEntry("text","描述");
        var next=library.createPrompt(new PromptCreate("ASSET_SCENE_DESCRIPTION","新规则：{{assetName}} {{sourceText}}","assetName,sourceText","TEXT","replace"));
        library.changePromptStatus(next.stage(),next.version(),new PromptStatus("PUBLISHED",1));
        controller.describe(request());
        var requests=db.queryForList("SELECT request_snapshot FROM workbench_prompt_executions ORDER BY prompt_version",String.class);
        assertThat(requests.get(0)).contains("旧规则","原文 {{credentials}}","stub-text","700","0.6","0.8");
        assertThat(requests.get(1)).contains("新规则","assetName","sourceText","projectId");
        library.changePromptStatus(next.stage(),next.version(),new PromptStatus("DISABLED",next.version()));
        assertThatThrownBy(()->controller.describe(request())).hasMessageContaining("发布");
        verify(provider,times(2)).generateText(anyString(),anyString(),anyInt(),anyDouble(),anyDouble());
        assertThat(db.queryForObject("SELECT COUNT(*) FROM workbench_prompt_executions",Integer.class)).isEqualTo(2);
    }
    @Test void foreignProjectAndInvalidTypeNeverReachProvider() {
        UserContext.setUserId(99L);
        assertThatThrownBy(()->controller.describe(request())).hasMessageContaining("权限");
        UserContext.setUserId(9L);
        assertThatThrownBy(()->controller.describe(new AssetDescriptionController.Request("unknown","name","text",3L,null))).hasMessageContaining("类型");
        verifyNoInteractions(provider);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM workbench_prompt_executions",Integer.class)).isZero();
    }
}
