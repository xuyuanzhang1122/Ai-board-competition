package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;
import static com.ym.ai_story_studio_server.creation.StoryboardContract.*;

/** A patch can replace explicitly selected shots; the server alone constructs the full candidate. */
final class PartialStoryboardContract {
    private record Patch(List<Shot> shots) {}
    private final ObjectMapper json;
    private final StoryboardContract full;
    PartialStoryboardContract(ObjectMapper json,StoryboardContract full) {this.json=json;this.full=full;}
    Board merge(String raw,Body base,List<String> targets) {
        Patch patch;
        try {
            require(raw!=null&&raw.length()<=200000,"局部输出过长");
            patch=json.readerFor(Patch.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_TRAILING_TOKENS,DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT).readValue(raw);
        } catch(Exception error) {throw invalid("局部分镜 JSON 无效或不完整，原始输出已保留");}
        require(patch!=null&&patch.shots()!=null&&patch.shots().size()==targets.size(),"局部输出必须精确对应所选镜头");
        Map<String,Shot> replacements=new HashMap<>();
        for(Shot shot:patch.shots()) {
            require(shot!=null&&targets.contains(shot.id()),"局部输出包含未选镜头");
            require(replacements.putIfAbsent(shot.id(),shot)==null,"局部输出镜头重复");
            Shot old=base.storyboard().shots().stream().filter(s->s.id().equals(shot.id())).findFirst().orElseThrow(()->invalid("镜头不存在"));
            require(shot.no()==old.no()&&shot.duration()==old.duration(),"局部输出不可改变镜头序号或时长");
        }
        Board old=base.storyboard();
        Board merged=new Board(old.version(),old.title(),old.assets(),old.shots().stream().map(s->replacements.getOrDefault(s.id(),s)).toList(),old.reviewNotes());
        full.validate(merged,base.brief().duration(),full.sources(base.brief()));
        return merged;
    }
}
