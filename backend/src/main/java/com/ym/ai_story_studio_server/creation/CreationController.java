package com.ym.ai_story_studio_server.creation;
import com.ym.ai_story_studio_server.common.Result;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;

@RestController
@RequestMapping("/api/creation/drafts")
public class CreationController {
    private final CreationService creation;
    private final CreationExport export;
    public CreationController(CreationService creation,CreationExport export){this.creation=creation;this.export=export;}
    @GetMapping public Result<List<Draft>> list(){return Result.success(creation.list());}
    @PostMapping public Result<Draft> create(@RequestBody Create request){return Result.success(creation.create(request));}
    @GetMapping("/{id}") public Result<Draft> detail(@PathVariable long id){return Result.success(creation.detail(id));}
    @PutMapping("/{id}") public Result<Draft> save(@PathVariable long id,@RequestBody Save request){return Result.success(creation.save(id,request));}
    @PutMapping("/{id}/shot-locks") public Result<Draft> locks(@PathVariable long id,@RequestBody ShotLocks request){return Result.success(creation.lockShots(id,request));}
    @PostMapping("/{id}/partial-runs") public Result<Run> partial(@PathVariable long id,@RequestBody PartialGenerate request){return Result.success(creation.partial(id,request));}
    @PostMapping("/{id}/runs") public Result<Run> generate(@PathVariable long id,@RequestBody Generate request){return Result.success(creation.generate(id,request));}
    @PostMapping("/{id}/runs/{runId}/adopt") public Result<Draft> adopt(@PathVariable long id,@PathVariable long runId,@RequestBody Adopt request){return Result.success(creation.adopt(id,runId,request));}
    @PostMapping("/{id}/confirm") public Result<Draft> confirm(@PathVariable long id,@RequestBody Confirm request){return Result.success(creation.confirm(id,request));}
    @PostMapping("/{id}/project") public Result<ProjectResult> project(@PathVariable long id,@RequestBody ProjectRequest request){return Result.success(creation.createProject(id,request));}
    @GetMapping("/{id}/evidence") public Result<java.util.Map<String,Object>> evidence(@PathVariable long id){return Result.success(creation.evidence(id));}
    @GetMapping("/{id}/export") public ResponseEntity<byte[]> export(@PathVariable long id){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=storyboard-"+id+".xlsx").contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(export.export(id));}
}
