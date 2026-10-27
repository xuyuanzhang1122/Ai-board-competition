package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.common.*;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.util.UserContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/generate")
public class AssetDescriptionController {
    public record Request(@NotBlank @Pattern(regexp="character|scene|prop") String assetType,
                          @NotBlank @Size(max=128) String assetName,
                          @NotBlank @Size(max=20000) String sourceText,
                          @NotNull Long projectId, @Size(max=100) String model) {}
    private final ProjectMapper projects; private final ManagedPromptRenderer renderer;
    private final PromptTextExecution execution; private final AiProperties ai;
    public AssetDescriptionController(ProjectMapper projects,ManagedPromptRenderer renderer,PromptTextExecution execution,AiProperties ai) {
        this.projects=projects;this.renderer=renderer;this.execution=execution;this.ai=ai;
    }
    @PostMapping("/asset-description")
    public Result<Map<String,String>> describe(@Valid @RequestBody Request request) {
        var project=projects.selectById(request.projectId());
        if(project==null || project.getDeletedAt()!=null || !java.util.Objects.equals(project.getUserId(),UserContext.getUserId()))
            throw new BusinessException(ResultCode.ACCESS_DENIED);
        if(!java.util.Set.of("character","scene","prop").contains(request.assetType())) throw new BusinessException(ResultCode.PARAM_INVALID,"资产类型无效");
        var prompt=renderer.render("ASSET_"+request.assetType().toUpperCase(java.util.Locale.ROOT)+"_DESCRIPTION",
                Map.of("assetName",request.assetName(),"sourceText",request.sourceText()),"TEXT");
        var config=ai.getText();
        String model=request.model()==null || request.model().isBlank()?config.getModel():request.model();
        return Result.success(Map.of("text",execution.generate(prompt,model,config.getMaxTokens(),config.getTemperature(),config.getTopP(),request.projectId())));
    }
}
