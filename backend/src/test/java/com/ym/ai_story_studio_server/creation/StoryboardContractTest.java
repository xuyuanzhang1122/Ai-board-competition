package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class StoryboardContractTest {
    static final String BOARD = """
        {"version":1,"title":"星光来信","assets":[
        {"id":"c1","type":"CHARACTER","name":"守塔人","description":"年轻守塔人"},
        {"id":"s1","type":"SCENE","name":"灯塔","description":"虚构海边灯塔"},
        {"id":"p1","type":"PROP","name":"信件","description":"星际信件"}],
        "shots":[{"id":"shot1","no":1,"duration":15,"visual":"守塔人打开信件","narration":"光跨越海面","dialogue":"","shotSize":"中景","cameraMovement":"推进","characters":["c1"],"scene":"s1","props":["p1"],"imagePrompt":"灯塔中的守塔人","videoPrompt":"缓缓推进","sourceIds":[]},
        {"id":"shot2","no":2,"duration":15,"visual":"灯塔照向夜空","narration":"回应远方","dialogue":"","shotSize":"远景","cameraMovement":"拉远","characters":["c1"],"scene":"s1","props":[],"imagePrompt":"海边灯塔","videoPrompt":"镜头拉远","sourceIds":[]}],"reviewNotes":["纯虚构故事，不作史实陈述"]}
        """;
    final StoryboardContract contract = new StoryboardContract(new ObjectMapper());
    @Test void competitionBriefDoesNotRequireAnAudienceChannelOrMarketingGoal() {
        for (String value : new String[]{"", null}) {
            var brief = new CreationTypes.Brief("八仙过海：民间传说改编", value, value, value,
                30, "16:9", "传说演绎", java.util.List.of());
            assertThatCode(() -> contract.validateBrief(brief)).doesNotThrowAnyException();
        }
    }
    @Test void optionalBriefSettingsStillHaveLengthLimits() {
        for (var settings : new String[][]{
            {"人".repeat(201), "", "", "受众"},
            {"", "渠".repeat(101), "", "渠道"},
            {"", "", "目".repeat(501), "创作目标"}
        }) {
            var brief = new CreationTypes.Brief("蓬莱故事", settings[0], settings[1], settings[2],
                30, "16:9", "", java.util.List.of());
            assertThatThrownBy(() -> contract.validateBrief(brief)).hasMessageContaining(settings[3]);
        }
    }
    @Test void acceptsStrictStableIdsAndAnExplicitlyFictionalPackage() {
        var board=contract.parse(BOARD,30,java.util.Set.of());
        assertThat(board.shots()).hasSize(2);
        assertThat(board.assets()).hasSize(3);
    }
    @Test void rejectsDanglingReferencesDuplicateIdsAndWrongDuration() {
        assertThatThrownBy(()->contract.parse(BOARD.replace("\"scene\":\"s1\"","\"scene\":\"missing\""),30,java.util.Set.of())).hasMessageContaining("引用");
        assertThatThrownBy(()->contract.parse(BOARD.replace("\"id\":\"shot2\"","\"id\":\"shot1\""),30,java.util.Set.of())).hasMessageContaining("ID");
        assertThatThrownBy(()->contract.parse(BOARD,60,java.util.Set.of())).hasMessageContaining("时长");
    }
    @Test void rejectsTrailingJsonAndFractionalIntegerFields() {
        assertThatThrownBy(()->contract.parse(BOARD+"{}",30,java.util.Set.of())).hasMessageContaining("JSON");
        assertThatThrownBy(()->contract.parse(BOARD.replace("\"duration\":15","\"duration\":15.9"),30,java.util.Set.of())).hasMessageContaining("JSON");
    }
    @Test void rejectsTruncatedJsonAndUnknownSourcesInsteadOfImportingPartialOutput() {
        assertThatThrownBy(()->contract.parse(BOARD.substring(0,200),30,java.util.Set.of())).hasMessageContaining("JSON");
        assertThatThrownBy(()->contract.parse(BOARD.replace("\"sourceIds\":[]","\"sourceIds\":[\"fake-source\"]"),30,java.util.Set.of())).hasMessageContaining("来源");
    }
}
