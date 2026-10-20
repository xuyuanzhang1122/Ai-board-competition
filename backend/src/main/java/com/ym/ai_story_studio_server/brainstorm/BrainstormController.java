package com.ym.ai_story_studio_server.brainstorm;

import com.ym.ai_story_studio_server.common.Result;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.ym.ai_story_studio_server.brainstorm.BrainstormTypes.*;

@RestController
@RequestMapping("/api/brainstorms")
public class BrainstormController {
    private final BrainstormService service;
    public BrainstormController(BrainstormService service) { this.service=service; }
    @GetMapping public Result<List<Draft>> list() {return Result.success(service.list());}
    @PostMapping public Result<Draft> create(@RequestBody Create request) {return Result.success(service.create(request));}
    @GetMapping("/{id}") public Result<Draft> detail(@PathVariable long id) {return Result.success(service.detail(id));}
    @PutMapping("/{id}") public Result<Draft> save(@PathVariable long id,@RequestBody Save request) {return Result.success(service.save(id,request));}
    @PostMapping("/{id}/runs") public Result<Run> generate(@PathVariable long id,@RequestBody Generate request) {return Result.success(service.generate(id,request));}
    @PostMapping("/{id}/runs/{runId}/adopt") public Result<Draft> adopt(@PathVariable long id,@PathVariable long runId,@RequestBody Revision request) {return Result.success(service.adopt(id,runId,request));}
    @PostMapping("/{id}/confirm") public Result<Draft> confirm(@PathVariable long id,@RequestBody Revision request) {return Result.success(service.confirm(id,request));}
    @PostMapping("/{id}/creation") public Result<CreationResult> handoff(@PathVariable long id,@RequestBody Handoff request) {return Result.success(service.handoff(id,request));}
    @GetMapping("/{id}/export") public Result<Map<String,Object>> export(@PathVariable long id) {return Result.success(service.export(id));}
}
