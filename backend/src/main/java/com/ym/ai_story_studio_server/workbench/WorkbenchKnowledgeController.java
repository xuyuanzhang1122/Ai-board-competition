package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.common.Result;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/workbench/knowledge")
public class WorkbenchKnowledgeController {
    private final WorkbenchLibraryService library;
    public WorkbenchKnowledgeController(WorkbenchLibraryService library) { this.library=library; }
    @GetMapping
    public Result<List<WorkbenchLibraryService.Knowledge>> knowledge(@RequestParam(defaultValue="") String query) {
        return Result.success(library.approvedKnowledge(query));
    }
}
