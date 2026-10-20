package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;

/** No supplier output reaches project tables before this structural and reference validation. */
@Component
public class StoryboardContract {
    private final ObjectMapper json;
    public StoryboardContract(ObjectMapper json) { this.json=json; }
    public Board parse(String output, int duration, Set<String> sources) {
        Board board;
        try {
            String raw=output.trim();
            if(raw.startsWith("```")) raw=raw.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
            board=json.readerFor(Board.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,DeserializationFeature.FAIL_ON_TRAILING_TOKENS,DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).without(DeserializationFeature.ACCEPT_FLOAT_AS_INT).readValue(raw);
        } catch(Exception e) { throw invalid("分镜 JSON 无效或不完整；原始结果已保留，请修改后重试"); }
        validate(board,duration,sources);
        return board;
    }
    public void validate(Board b,int target,Set<String> sources) {
        require(b!=null && b.version()==1,"分镜格式版本无效");
        text(b.title(),128,"标题");
        require(b.assets()!=null && b.assets().size()<=60,"资产数量无效");
        require(b.shots()!=null && !b.shots().isEmpty() && b.shots().size()<=20,"镜头数量须为1至20");
        require(b.reviewNotes()!=null && b.reviewNotes().size()<=30,"复核项无效");
        b.reviewNotes().forEach(n->text(n,2000,"复核项"));
        Map<String,String> kinds=new HashMap<>();
        for(var a:b.assets()) {
            require(a!=null,"资产无效"); id(a.id());
            require(kinds.putIfAbsent(a.id(),a.type())==null,"资产 ID 重复");
            require(Set.of("CHARACTER","SCENE","PROP").contains(a.type()==null?"":a.type()),"资产类型无效");
            text(a.name(),64,"资产名称"); text(a.description(),4000,"资产描述");
        }
        Set<String> shotIds=new HashSet<>(); int total=0;
        for(int i=0;i<b.shots().size();i++) {
            Shot s=b.shots().get(i); require(s!=null,"镜头无效"); id(s.id());
            require(shotIds.add(s.id()),"镜头 ID 重复"); require(s.no()==i+1,"镜头序号须从1连续递增");
            require(s.duration()>=1 && s.duration()<=90,"单镜时长无效"); total+=s.duration();
            text(s.visual(),4000,"画面"); text(s.shotSize(),100,"景别"); text(s.cameraMovement(),200,"运镜");
            optional(s.narration(),4000,"旁白"); optional(s.dialogue(),4000,"对白");
            optional(s.imagePrompt(),4000,"图片提示词"); optional(s.videoPrompt(),4000,"视频提示词");
            references(s.characters(),"CHARACTER",kinds); references(s.props(),"PROP",kinds);
            require("SCENE".equals(kinds.get(s.scene())),"场景引用不存在或类型不匹配");
            require(s.sourceIds()!=null && s.sourceIds().size()<=30 && sources.containsAll(s.sourceIds()),"来源引用无效");
        }
        require(target>=15 && target<=90 && Math.abs(total-target)<=target*0.1,"镜头总时长须在目标时长的10%以内");
    }
    public void validateBrief(Brief b) {
        require(b!=null,"创作简报必填"); text(b.theme(),500,"创作主题");optional(b.audience(),200,"受众");
        optional(b.channel(),100,"渠道");optional(b.goal(),500,"创作目标");
        require(b.duration()>=15 && b.duration()<=90,"目标时长须为15至90秒");
        require(Set.of("16:9","9:16","1:1","21:9").contains(b.aspectRatio()==null?"":b.aspectRatio()),"画幅无效");
        optional(b.materials(),12000,"参考资料");require(b.sources()!=null && b.sources().size()<=20,"来源数量无效");
        Set<String> ids=new HashSet<>();
        for(var s:b.sources()) {
            require(s!=null,"来源无效");id(s.id());require(ids.add(s.id()),"来源 ID 重复");text(s.title(),200,"来源标题");
            optional(s.url(),2000,"来源网址"); optional(s.license(),1000,"授权说明");
            require(s.url()==null || s.url().isEmpty() || s.url().matches("https?://[^\\s]+"),"来源网址格式无效");
        }
    }
    public Set<String> sources(Brief brief) { return new HashSet<>(brief.sources().stream().map(Source::id).toList()); }
    private void references(List<String> refs,String kind,Map<String,String> kinds) {
        require(refs!=null && refs.size()<=30 && new HashSet<>(refs).size()==refs.size(),"资产引用无效");
        for(String id:refs)require(kind.equals(kinds.get(id)),"资产引用不存在或类型不匹配");
    }
    private void id(String id) { require(id!=null && id.matches("[A-Za-z0-9_-]{1,64}"),"稳定 ID 无效"); }
    public static void text(String value,int max,String field){ require(value!=null && !value.isBlank() && value.length()<=max,field+"必填且不能超过"+max+"字符"); }
    public static void optional(String value,int max,String field){require(value==null || value.length()<=max,field+"过长");}
    public static void require(boolean test,String error) { if(!test)throw invalid(error); }
    public static BusinessException invalid(String reason) { return new BusinessException(ResultCode.PARAM_INVALID,reason); }
}
