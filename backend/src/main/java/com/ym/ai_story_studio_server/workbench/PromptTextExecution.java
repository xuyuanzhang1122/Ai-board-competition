package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.util.UserContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.Map;
import java.util.UUID;

/** Legacy synchronous parsing retains evidence even if its surrounding project transaction rolls back. */
@Service
public class PromptTextExecution {
    private final JdbcTemplate db;
    private final TransactionTemplate audit;
    private final TextGenerationProvider provider;
    private final ObjectMapper json;

    public PromptTextExecution(JdbcTemplate db, TransactionTemplate tx, TextGenerationProvider provider, ObjectMapper json) {
        this.db = db; this.provider = provider; this.json = json;
        audit = new TransactionTemplate(java.util.Objects.requireNonNull(tx.getTransactionManager()));
        audit.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public String generate(WorkbenchLibraryService.Prompt template, String input, String model, int maxTokens) {
        String prompt = template.content() + "\n\n用户文案：\n" + input;
        return execute(template.stage(),template.version(),template.content(),input,prompt,model,maxTokens,0.3,0.9,Map.of());
    }

    public String generate(ManagedPromptRenderer.Rendered rendered,String model,int maxTokens,
                           double temperature,double topP,Long projectId) {
        return execute(rendered.stage(),rendered.version(),rendered.template(),encode(rendered.variables()),
                rendered.rendered(),model,maxTokens,temperature,topP,Map.of("variables",rendered.variables(),"projectId",projectId));
    }

    private String execute(String stage,int version,String template,String input,String prompt,String model,
                           int maxTokens,double temperature,double topP,Map<String,Object> context) {
        provider.validateModelConfiguration(model);
        provider.validateRequest(prompt,model,maxTokens,temperature,topP);
        String id = UUID.randomUUID().toString();
        var snapshot=new java.util.HashMap<String,Object>(context);
        snapshot.putAll(Map.of("prompt",prompt,"model",model,"maxTokens",maxTokens,"temperature",temperature,"topP",topP));
        String request=encode(snapshot);
        audit.executeWithoutResult(s -> db.update("""
                INSERT INTO workbench_prompt_executions(id,user_id,stage,prompt_version,prompt_snapshot,input_snapshot,request_snapshot,status)
                VALUES(?,?,?,?,?,?,?,'RUNNING')
                """, id, UserContext.getUserId(), stage, version, template, input, request));
        try {
            var response = provider.generateText(prompt, model, maxTokens, temperature, topP);
            audit.executeWithoutResult(s -> db.update("UPDATE workbench_prompt_executions SET status='SUCCEEDED',result_snapshot=?,finished_at=CURRENT_TIMESTAMP WHERE id=?", encode(response), id));
            return response.text();
        } catch (RuntimeException error) {
            // A transport exception does not prove the upstream rejected the request. Never auto-retry.
            audit.executeWithoutResult(s -> db.update("UPDATE workbench_prompt_executions SET status='NEEDS_REVIEW',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?", error.getClass().getSimpleName(), id));
            throw error;
        }
    }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception error) { throw new IllegalStateException("无法保存提示词执行快照", error); }
    }
}
