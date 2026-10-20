package com.ym.ai_story_studio_server.brainstorm;

import com.fasterxml.jackson.databind.*;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.StoryboardContract.*;
import static com.ym.ai_story_studio_server.brainstorm.BrainstormTypes.*;

@Component
public class BrainstormContract {
    public static final Set<String> TOOLS = Set.of("search_knowledge", "web_search", "read_page", "validate_sources", "save_draft", "ask_user", "finish");
    private final ObjectMapper json;
    public BrainstormContract(ObjectMapper json) { this.json = json; }
    public Decision decision(String raw) {
        Decision decision;
        try {
            require(raw != null && raw.length() <= 40000, "决策格式过长");
            decision = json.readerFor(Decision.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(raw);
            require(decision.arguments() != null && decision.arguments().isObject(), "决策格式无效");
        } catch (Exception e) { throw invalid("决策格式无效，需严格 JSON {tool,arguments}"); }
        require(TOOLS.contains(decision.tool() == null ? "" : decision.tool()), "工具不在允许列表");
        return decision;
    }
    public Outline parse(JsonNode value, Set<String> sources) {
        try {
            Outline outline = json.readerFor(Outline.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(value);
            validate(outline, sources);
            return outline;
        } catch (com.ym.ai_story_studio_server.exception.BusinessException e) { throw e; }
        catch (Exception e) { throw invalid("大纲格式无效"); }
    }
    public void validate(Outline outline, Set<String> sources) {
        require(outline != null && outline.directions() != null && outline.directions().size() >= 2 && outline.directions().size() <= 3, "大纲须含2至3个方向");
        Set<String> ids = new HashSet<>();
        for (Direction d : outline.directions()) {
            require(d != null, "方向无效"); require(d.id()!=null && d.id().matches("[A-Za-z0-9_-]{1,80}"), "方向 ID 无效"); require(ids.add(d.id()), "方向 ID 重复");
            text(d.title(), 128, "标题"); text(d.angle(), 1000, "角度"); text(d.keyMessage(), 1000, "核心信息");
            text(d.emotion(), 500, "情感"); optional(d.callToAction(), 500, "行动");
            strings(d.beats(), 12, 1000, "情节"); require(!d.beats().isEmpty(), "情节不能为空");
            strings(d.reviewNotes(), 12, 1000, "复核项");
            require(d.sourceIds() != null && d.sourceIds().size() <= 20 && sources.containsAll(d.sourceIds()), "来源引用不在已冻结资料中");
        }
        require(outline.selectedId() == null || outline.selectedId().isBlank() || ids.contains(outline.selectedId()), "所选方向不存在");
        optional(outline.selectionReason(), 1000, "选择理由");
    }
    private void strings(List<String> values, int count, int length, String label) {
        require(values != null && values.size() <= count, label + "数量无效"); values.forEach(v -> text(v, length, label));
    }
}
