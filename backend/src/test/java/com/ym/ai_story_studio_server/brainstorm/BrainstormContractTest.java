package com.ym.ai_story_studio_server.brainstorm;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;

class BrainstormContractTest {
    BrainstormContract contract = new BrainstormContract(new ObjectMapper());
    @Test void rejectsUnknownToolsAndMalformedArguments() {
        assertThatThrownBy(() -> contract.decision("{\"tool\":\"shell\",\"arguments\":{}}"))
                .hasMessageContaining("工具");
        assertThatThrownBy(() -> contract.decision("{\"tool\":\"finish\",\"arguments\":[],\"extra\":true}"))
                .hasMessageContaining("格式");
    }
    @Test void citationsMustBelongToFrozenSources() {
        var outline = new BrainstormTypes.Outline(java.util.List.of(direction("a"), direction("b")), "a", "选择");
        assertThatThrownBy(() -> contract.validate(outline, Set.of())).hasMessageContaining("来源");
        contract.validate(outline, Set.of("knowledge-1-v2"));
    }
    BrainstormTypes.Direction direction(String id) {
        return new BrainstormTypes.Direction(id,"标题","角度","信息",java.util.List.of("起","承"),"情感","行动",java.util.List.of("knowledge-1-v2"),java.util.List.of("核实"));
    }
}
