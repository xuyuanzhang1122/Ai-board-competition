package com.ym.ai_story_studio_server.workbench;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import com.ym.ai_story_studio_server.util.AdminContext;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.*;

class ManagedPromptRendererTest {
    JdbcTemplate db; WorkbenchLibraryService library; ManagedPromptRenderer renderer;
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:managed"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds);
        db.execute("CREATE TABLE creation_prompts(stage VARCHAR(20),version INT,content CLOB)");
        for(String sql:Files.readString(Path.of("src/main/resources/db/migration/V40__workbench_library.sql")).split(";"))if(!sql.isBlank())db.execute(sql);
        db.update("INSERT INTO workbench_prompt_stages VALUES('SHOT_IMAGE',1,2)");
        db.update("INSERT INTO workbench_prompts(stage,version,content,variables,capability,status,change_note) VALUES('SHOT_IMAGE',1,'规则一：{{scriptText}}','scriptText','IMAGE','PUBLISHED','test')");
        library=new WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)));
        renderer=new ManagedPromptRenderer(library); AdminContext.setAdminId(7L);
    }
    @AfterEach void clear(){AdminContext.clear();}
    @Test void publicationAffectsOnlyFutureRendersAndDoesNotInterpolateUserInput() {
        var first=renderer.render("SHOT_IMAGE",Map.of("scriptText","用户 {{credentials}} 原文"),"IMAGE");
        var next=library.createPrompt(new PromptCreate("SHOT_IMAGE","规则二：{{scriptText}}","scriptText","IMAGE","replace"));
        library.changePromptStatus("SHOT_IMAGE",next.version(),new PromptStatus("PUBLISHED",1));
        assertThat(renderer.render("SHOT_IMAGE",Map.of("scriptText","新剧本"),"IMAGE").rendered()).isEqualTo("规则二：新剧本");
        assertThat(first.rendered()).isEqualTo("规则一：用户 {{credentials}} 原文");
        assertThat(first.version()).isEqualTo(1); assertThat(first.template()).isEqualTo("规则一：{{scriptText}}");
        library.changePromptStatus("SHOT_IMAGE",next.version(),new PromptStatus("DISABLED",next.version()));
        assertThatThrownBy(()->renderer.render("SHOT_IMAGE",Map.of("scriptText","x"),"IMAGE")).hasMessageContaining("发布");
        assertThat(first.variables()).containsEntry("scriptText","用户 {{credentials}} 原文");
    }
    @Test void rejectsUnknownOrMissingVariablesAndCapabilityMismatch() {
        assertThatThrownBy(()->renderer.render("SHOT_IMAGE",Map.of("credentials","secret"),"IMAGE")).hasMessageContaining("变量");
        assertThatThrownBy(()->renderer.render("SHOT_IMAGE",Map.of(),"IMAGE")).hasMessageContaining("变量");
        assertThatThrownBy(()->renderer.render("SHOT_IMAGE",Map.of("scriptText","x"),"TEXT")).hasMessageContaining("能力");
    }
}
