package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.common.Result;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import static com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.*;

@RestController
@RequestMapping("/api/admin/workbench")
public class WorkbenchAdminController {
    private final WorkbenchLibraryService library;
    public WorkbenchAdminController(WorkbenchLibraryService library) { this.library=library; }
    @GetMapping("/knowledge")
    public Result<List<Knowledge>> knowledge(@RequestParam(defaultValue="") String query) { return Result.success(library.knowledge(query)); }
    @PostMapping("/knowledge")
    public Result<Knowledge> create(@RequestBody KnowledgeEdit request) { return Result.success(library.createKnowledge(request)); }
    @PutMapping("/knowledge/{id}")
    public Result<Knowledge> update(@PathVariable long id,@RequestBody KnowledgeEdit request) { return Result.success(library.updateKnowledge(id,request)); }
    @PostMapping("/knowledge/{id}/review")
    public Result<Knowledge> review(@PathVariable long id,@RequestBody Review request) { return Result.success(library.reviewKnowledge(id,request)); }
    @GetMapping("/prompts")
    public Result<List<Prompt>> prompts() { return Result.success(library.prompts()); }
    @PostMapping("/prompts")
    public Result<Prompt> createPrompt(@RequestBody PromptCreate request) { return Result.success(library.createPrompt(request)); }
    @PostMapping("/prompts/{stage}/{version}/status")
    public Result<Prompt> status(@PathVariable String stage,@PathVariable int version,@RequestBody PromptStatus request) { return Result.success(library.changePromptStatus(stage,version,request)); }
}
