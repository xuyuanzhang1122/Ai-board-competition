package com.ym.ai_story_studio_server.provider;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OfficialModelCatalogClientTest {
    @Test
    void discoversAllActualIdsAndNamesInsteadOfSeededModelList() {
        var p = properties(); var b = RestClient.builder(); var server = MockRestServiceServer.bindTo(b).build();
        server.expect(requestTo("https://api.deepseek.com/models"))
            .andExpect(header("Authorization", "Bearer synthetic-key"))
            .andRespond(withSuccess("{\"data\":[{\"id\":\"new-model\",\"name\":\"Official Name\",\"output_modalities\":[\"text\"]}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.xiaomimimo.com/v1/models"))
            .andRespond(withSuccess("{\"data\":[{\"id\":\"mimo-new-flash\"},{\"id\":\"mimo-new-tts\"}]}", MediaType.APPLICATION_JSON));
        var models = new OfficialModelCatalogClient(p, b).fetch();
        assertThat(models).extracting(OfficialModelCatalogClient.Model::code).containsExactly("new-model", "mimo-new-flash", "mimo-new-tts");
        assertThat(models.get(0).name()).isEqualTo("Official Name");
        assertThat(models.get(2).type()).isEqualTo("AUDIO");
        server.verify();
    }

    @Test
    void malformedOrFailedSecondSupplierDoesNotReturnPartialOrOldCatalog() {
        var p = properties(); var b = RestClient.builder(); var server = MockRestServiceServer.bindTo(b).build();
        server.expect(requestTo("https://api.deepseek.com/models"))
            .andRespond(withSuccess("{\"data\":[{\"id\":\"current-text\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.xiaomimimo.com/v1/models"))
            .andRespond(withSuccess("{\"error\":\"unavailable\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> new OfficialModelCatalogClient(p, b).fetch()).hasMessageContaining("目录");
        server.verify();
    }

    @Test
    void refusesUnknownEndpointsBeforeSendingKeys() {
        var p=properties(); p.getDeepseek().setBaseUrl("https://old-proxy.invalid");
        var b=RestClient.builder(); var server=MockRestServiceServer.bindTo(b).build();
        assertThatThrownBy(() -> new OfficialModelCatalogClient(p,b).fetch()).hasMessageContaining("官方");
        server.verify();
    }

    private TextProviderProperties properties() {
        var p=new TextProviderProperties();
        for(var e:java.util.List.of(p.getDeepseek(),p.getMimo())){e.setEnabled(true);e.setApiKey("synthetic-key");}
        return p;
    }
}
