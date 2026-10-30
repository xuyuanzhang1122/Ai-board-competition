package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

/** All media instructions, variables, references and resolved parameters freeze before dispatch. */
@Service
public class MediaPromptSnapshots {
    public record Reference(String url,String label) {}
    public record Snapshot(int schemaVersion,String prompt,List<ManagedPromptRenderer.Rendered> templates,
                           Map<String,Object> parameters,List<Reference> references,String userPrompt) {
        public Snapshot {templates=List.copyOf(templates);parameters=Map.copyOf(parameters);references=List.copyOf(references);}
        public String model(){return (String)parameters.get("model");}
        public String aspectRatio(){return (String)parameters.get("aspectRatio");}
        public Integer duration(){return parameters.get("duration") instanceof Number n?n.intValue():null;}
        public String size(){return (String)parameters.get("size");}
        public List<String> referenceUrls(){return references.stream().map(Reference::url).toList();}
    }
    private final JdbcTemplate db; private final ManagedPromptRenderer renderer; private final ObjectMapper json;
    public MediaPromptSnapshots(JdbcTemplate db,ManagedPromptRenderer renderer,ObjectMapper json){this.db=db;this.renderer=renderer;this.json=json;}

    public Snapshot render(String stage,Map<String,String> variables,String styleCode,Map<String,Object> parameters,
                           List<Reference> references,String userPrompt) {
        var templates=new ArrayList<ManagedPromptRenderer.Rendered>();
        var unique=new LinkedHashMap<String,Reference>();
        for(var ref:references)if(validReference(ref.url()))unique.putIfAbsent(ref.url(),ref);
        var refs=List.copyOf(unique.values());
        String capability=WorkbenchLibraryService.capability(stage);
        var actualVariables = new HashMap<>(variables);
        if (userPrompt != null && stage.equals("SHOT_IMAGE")) actualVariables.put("scriptText", userPrompt);
        var template = renderer.render(stage, actualVariables, capability);
        templates.add(template);
        String prompt = template.rendered();
        if(capability.equals("VIDEO") && !refs.isEmpty()) {
            var labels=new ArrayList<String>();
            for(int i=0;i<refs.size();i++)labels.add("@image"+(i+1)+"="+refs.get(i).label());
            var usage=renderer.render("VIDEO_REFERENCES",Map.of("references",String.join("；",labels)),"VIDEO");
            templates.add(usage);prompt=usage.rendered()+"\n"+prompt;
        }
        if(capability.equals("VIDEO") && styleCode!=null && !styleCode.isBlank()) {
            String styleStage;
            if(Set.of("3DGC","REALISTIC").contains(styleCode.toUpperCase(Locale.ROOT)))styleStage="MEDIA_STYLE_"+styleCode.toUpperCase(Locale.ROOT);
            else {
                var ids=db.queryForList("SELECT id FROM style_presets WHERE code=?",Long.class,styleCode);
                if(ids.isEmpty())throw new BusinessException(ResultCode.CONFIG_ERROR,"未知项目风格");
                styleStage="STYLE_PRESET_"+ids.get(0);
            }
            var style=renderer.render(styleStage,Map.of(),"MEDIA");templates.add(style);prompt=style.rendered()+"\n"+prompt;
        }
        return new Snapshot(1,prompt,templates,parameters,refs,userPrompt);
    }

    public Snapshot forTarget(Long projectId,Long targetId,String stage,Map<String,Object> parameters,String userPrompt,List<Reference> explicitReferences) {
        Map<String,String> variables; List<Reference> references=List.of();
        if(stage.equals("SHOT_IMAGE") || stage.equals("SHOT_VIDEO")) {
            String raw=db.queryForObject("SELECT script_text FROM storyboard_shots WHERE id=? AND project_id=? AND deleted_at IS NULL",String.class,targetId,projectId);
            variables=Map.of("scriptText",stage.equals("SHOT_VIDEO") && userPrompt!=null?userPrompt:value(raw));
            references=explicitReferences!=null?explicitReferences:boundReferences(projectId,targetId,stage.equals("SHOT_VIDEO"));
            if (stage.equals("SHOT_VIDEO") && explicitReferences != null && explicitReferences.stream().noneMatch(r -> "分镜图".equals(r.label()))) {
                var copy=new ArrayList<>(references);
                for(String url:db.queryForList("SELECT v.url FROM asset_refs r JOIN asset_versions v ON v.id=r.asset_version_id WHERE r.project_id=? AND r.ref_type='SHOT_IMG_CURRENT' AND r.ref_owner_id=?",String.class,projectId,targetId))copy.add(new Reference(url,"分镜图"));
                references=copy;
            }
        } else {
            String kind=switch(stage){case "CHARACTER_IMAGE"->"character";case "SCENE_IMAGE"->"scene";case "PROP_IMAGE"->"prop";default->throw new BusinessException(ResultCode.PARAM_INVALID,"媒体阶段无效");};
            var row=asset(projectId,targetId,kind);
            variables=Map.of("assetName",value(row.get("asset_name")),"description",value(row.get("description")));
        }
        String style=stage.equals("SHOT_VIDEO")?db.queryForObject("SELECT style_code FROM projects WHERE id=?",String.class,projectId):null;
        return render(stage,variables,style,parameters,references,userPrompt);
    }
    public Reference selectedReference(Long projectId,String kind,Long id,String url,String label) {
        if(!Set.of("character","prop").contains(kind))throw new IllegalArgumentException("不支持的参考素材类型");
        var selected=asset(projectId,id,kind);
        return new Reference(validReference(url)?url:value(selected.get("url")),label);
    }
    private Map<String,Object> asset(Long projectId,Long id,String kind) {
        var row=db.queryForMap("SELECT COALESCE(p.display_name,l.name,'') AS asset_name,COALESCE(p.override_description,l.description,'') AS description,p.thumbnail_url AS project_url,l.thumbnail_url AS library_url FROM project_"+kind+"s p LEFT JOIN "+kind+"_library l ON l.id=p.library_"+kind+"_id AND l.deleted_at IS NULL WHERE p.id=? AND p.project_id=?",id,projectId);
        String url=value(row.get("project_url"));
        if(!validReference(url))url=value(row.get("library_url"));
        if(!validReference(url) && kind.equals("character")) {
            var urls=db.queryForList("SELECT v.url FROM assets a JOIN asset_versions v ON v.asset_id=a.id WHERE a.project_id=? AND a.owner_type='PCHAR' AND a.owner_id=? AND v.status='READY' ORDER BY v.version_no DESC,v.id DESC LIMIT 1",String.class,projectId,id);
            url=urls.isEmpty()?"":urls.get(0);
        }
        row.put("url",validReference(url)?url:"");
        return row;
    }
    private List<Reference> boundReferences(Long projectId,Long shotId,boolean video) {
        var references=new ArrayList<Reference>(); boolean scene=false;
        for(var binding:db.queryForList("SELECT bind_type,bind_id FROM shot_bindings WHERE shot_id=? ORDER BY CASE bind_type WHEN 'PCHAR' THEN 1 WHEN 'PPROP' THEN 2 WHEN 'PSCENE' THEN 3 ELSE 4 END,id",shotId)) {
            String type=value(binding.get("bind_type"));
            String kind=switch(type){case "PCHAR"->"character";case "PSCENE"->"scene";case "PPROP"->"prop";default->null;};
            if(kind==null || !video && !type.equals("PCHAR"))continue;
            var row=asset(projectId,((Number)binding.get("bind_id")).longValue(),kind);
            String url=value(row.get("url"));
            if(validReference(url)){references.add(new Reference(url,type+":"+value(row.get("asset_name"))));scene|=type.equals("PSCENE");}
        }
        if(video) {
            if(!scene)throw new BusinessException(ResultCode.PARAM_INVALID,"缺少场景画像资产，禁止生成视频");
            var urls=db.queryForList("SELECT v.url FROM asset_refs r JOIN asset_versions v ON v.id=r.asset_version_id WHERE r.project_id=? AND r.ref_type='SHOT_IMG_CURRENT' AND r.ref_owner_id=?",String.class,projectId,shotId);
            for(String url:urls)references.add(new Reference(url,"分镜图"));
        }
        return references;
    }
    public void save(Long jobId,Long targetId,Snapshot snapshot) {
        try{db.update("INSERT INTO media_prompt_snapshots(job_id,target_id,request_json) VALUES(?,?,?)",jobId,targetId,json.writeValueAsString(snapshot));}
        catch(java.io.IOException e){throw new IllegalStateException("媒体提示词快照保存失败",e);}
    }
    public Snapshot load(Long jobId,Long targetId) {
        var rows=db.queryForList("SELECT request_json FROM media_prompt_snapshots WHERE job_id=? AND target_id=?",String.class,jobId,targetId);
        if(rows.isEmpty())throw new BusinessException(ResultCode.CONFIG_ERROR,"媒体任务缺少受理快照，拒绝使用当前默认值");
        try{var snapshot=json.readValue(rows.get(0),Snapshot.class);if(snapshot.schemaVersion()!=1)throw new IllegalArgumentException();return snapshot;}
        catch(Exception e){throw new BusinessException(ResultCode.CONFIG_ERROR,"媒体任务快照无效");}
    }
    private static boolean validReference(String url){return url!=null && !url.isBlank() && !url.contains("via.placeholder.com");}
    private static String value(Object value){return value==null?"":value.toString();}
}
