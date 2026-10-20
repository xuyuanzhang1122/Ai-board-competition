package com.ym.ai_story_studio_server.creation;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;
import static org.assertj.core.api.Assertions.*;
class CreationInputTest {
    @Test void manualSaveRejectsFractionalDurationAndVersionInsteadOfSilentlyTruncating() throws Exception {
        var json=new ObjectMapper();var brief=new Brief("虚构","青年","短视频","探索",30,"16:9","",List.of());
        String original="{\"revision\":1,\"brief\":"+json.writeValueAsString(brief)+",\"script\":\"剧本\",\"storyboard\":"+StoryboardContractTest.BOARD+"}";
        assertThat(json.readValue(original,Save.class).storyboard().shots()).hasSize(2);
        for(String invalid:List.of(original.replace("\"duration\":15","\"duration\":15.9"),original.replace("\"version\":1","\"version\":1.5"),original.replace("\"duration\":30","\"duration\":30.5"),original.replace("\"no\":1","\"no\":1.5"))) {
            assertThatThrownBy(()->json.readValue(invalid,Save.class)).isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
        }
    }
}
