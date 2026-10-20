package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;

/** Called inside the owning transaction only, after validation and explicit confirmation. */
@Service
public class StoryboardProjectWriter {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public StoryboardProjectWriter(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
    public long create(long user,Body body,String model) {
        long project=JdbcIds.insert(db,"INSERT INTO projects(user_id,name,aspect_ratio,style_code,raw_text,status,model_config_json) VALUES(?,?,?,'cinematic',?,'READY',?)",user,body.storyboard().title(),body.brief().aspectRatio(),body.script(),encode(Map.of("languageModel",model)));
        Map<String,Long> ids=new HashMap<>();
        for(var a:body.storyboard().assets()) {
            String table=switch(a.type()){case "CHARACTER"->"project_characters";case "SCENE"->"project_scenes";case "PROP"->"project_props";default->throw StoryboardContract.invalid("资产类型无效");};
            ids.put(a.id(),JdbcIds.insert(db,"INSERT INTO "+table+"(project_id,display_name,override_description) VALUES(?,?,?)",project,a.name(),a.description()));
        }
        for(var s:body.storyboard().shots()) {
            String script="【"+s.duration()+"秒 · "+s.shotSize()+" · "+s.cameraMovement()+"】\n"+s.visual()
                    +(s.narration()==null||s.narration().isBlank()?"":"\n旁白："+s.narration())
                    +(s.dialogue()==null||s.dialogue().isBlank()?"":"\n对白："+s.dialogue());
            long shot=insertShot(project,s.no(),script,encode(s));
            for(String id:s.characters())bind(shot,"PCHAR",ids.get(id));
            bind(shot,"PSCENE",ids.get(s.scene()));
            for(String id:s.props())bind(shot,"PPROP",ids.get(id));
        }
        return project;
    }
    /** Shared with legacy Excel import so both paths use the same row insertion semantics. */
    public long insertShot(long project,int no,String script,String metadata) {
        return JdbcIds.insert(db,"INSERT INTO storyboard_shots(project_id,shot_no,script_text,creation_metadata_json) VALUES(?,?,?,?)",project,no,script,metadata);
    }
    private void bind(long shot,String type,Long id){db.update("INSERT INTO shot_bindings(shot_id,bind_type,bind_id) VALUES(?,?,?)",shot,type,id);}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("结构化分镜保存失败",e);}}
}
