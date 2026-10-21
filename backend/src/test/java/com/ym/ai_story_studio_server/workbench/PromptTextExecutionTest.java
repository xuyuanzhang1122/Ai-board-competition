package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.provider.*;
import com.ym.ai_story_studio_server.util.UserContext;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PromptTextExecutionTest {
    JdbcTemplate db; TransactionTemplate tx; TextGenerationProvider provider; PromptTextExecution execution;
    final WorkbenchLibraryService.Prompt template = new WorkbenchLibraryService.Prompt("SHOT_PARSE_ASSETS", 3, "immutable template", "rawText", "TEXT", "PUBLISHED", "", 1L, "", 3);
    @BeforeEach void setup() throws Exception {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:syncaudit" + System.nanoTime() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        for (String sql : Files.readString(Path.of("src/main/resources/db/migration/V43__synchronous_prompt_execution_audit.sql")).split(";")) if (!sql.isBlank()) db.execute(sql);
        provider = mock(TextGenerationProvider.class);
        execution = new PromptTextExecution(db, tx, provider, new ObjectMapper());
        UserContext.setUserId(9L);
    }
    @AfterEach void clear() { UserContext.clear(); }
    @Test void freezesActualRequestBeforeProviderAndSurvivesOuterRollback() {
        when(provider.generateText(anyString(),anyString(),anyInt(),anyDouble(),anyDouble())).thenAnswer(call -> {
            assertThat(db.queryForObject("SELECT status FROM workbench_prompt_executions",String.class)).isEqualTo("RUNNING");
            return new TextGenerationResult("reply", "official-model", "official", "request", 10);
        });
        tx.executeWithoutResult(status -> {
            assertThat(execution.generate(template, "human text", "official-model", 1000)).isEqualTo("reply");
            status.setRollbackOnly();
        });
        var row=db.queryForMap("SELECT * FROM workbench_prompt_executions");
        assertThat(row.get("STATUS")).isEqualTo("SUCCEEDED");
        assertThat(row.get("USER_ID")).isEqualTo(9L);
        assertThat(row.get("PROMPT_VERSION")).isEqualTo(3);
        assertThat(row.get("REQUEST_SNAPSHOT").toString()).contains("immutable template", "human text", "official-model", "maxTokens", "0.3", "0.9");
    }
    @Test void unknownTransportErrorRetainsSnapshotWithoutRetryOrSecretError() {
        when(provider.generateText(anyString(),anyString(),anyInt(),anyDouble(),anyDouble())).thenThrow(new IllegalStateException("private upstream detail"));
        assertThatThrownBy(() -> execution.generate(template,"input","official-model",1000)).isInstanceOf(IllegalStateException.class);
        assertThat(db.queryForObject("SELECT status FROM workbench_prompt_executions",String.class)).isEqualTo("NEEDS_REVIEW");
        assertThat(db.queryForObject("SELECT error FROM workbench_prompt_executions",String.class)).doesNotContain("private");
        verify(provider,times(1)).generateText(anyString(),anyString(),anyInt(),anyDouble(),anyDouble());
    }
}
