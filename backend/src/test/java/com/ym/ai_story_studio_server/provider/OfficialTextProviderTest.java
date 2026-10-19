package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.mockito.Mockito.*;

class OfficialTextProviderTest {
    private TextProviderProperties properties;
    private MockRestServiceServer server;
    private OfficialTextProvider provider;
    private TextModelAccess modelAccess;

    @Test
    void productionTransportSupportsExplicitRetryDisabling() throws Exception {
        var factory = OfficialTextProvider.productionRequestFactory();
        try {
            assertThat(factory.getClass().getSimpleName()).isEqualTo("HttpComponentsClientHttpRequestFactory");
            Object chain = org.springframework.test.util.ReflectionTestUtils.getField(factory.getHttpClient(), "execChain");
            var handlers = new java.util.ArrayList<String>();
            while (chain != null) {
                Object handler = org.springframework.test.util.ReflectionTestUtils.getField(chain, "handler");
                handlers.add(handler.getClass().getSimpleName());
                chain = org.springframework.test.util.ReflectionTestUtils.getField(chain, "next");
            }
            assertThat(handlers).isNotEmpty().doesNotContain("HttpRequestRetryExec", "RedirectExec");
        } finally {
            factory.destroy();
        }
    }

    @Test
    void realTransportDoesNotResubmitDroppedPostOrFollowRedirect() throws Exception {
        var local = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        var posts = new java.util.concurrent.atomic.AtomicInteger();
        var redirected = new java.util.concurrent.atomic.AtomicInteger();
        local.createContext("/drop", exchange -> {
            posts.incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            exchange.close();
        });
        local.createContext("/redirect", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.getResponseHeaders().set("Location", "/target");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        local.createContext("/target", exchange -> {
            redirected.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        local.start();
        var factory = OfficialTextProvider.productionRequestFactory();
        try {
            var client = RestClient.builder().requestFactory(factory)
                    .baseUrl("http://127.0.0.1:" + local.getAddress().getPort()).build();
            assertThatThrownBy(() -> client.post().uri("/drop").body("synthetic").retrieve().toBodilessEntity())
                    .isInstanceOf(org.springframework.web.client.RestClientException.class);
            assertThat(posts.get()).isEqualTo(1);
            assertThat(client.post().uri("/redirect").body("synthetic").retrieve().toBodilessEntity().getStatusCode().value())
                    .isEqualTo(302);
            assertThat(redirected.get()).isZero();
        } finally {
            factory.destroy();
            local.stop(0);
        }
    }

    @Test
    void bindsOnlyTheNewConfigurationNamespace() {
        var source = new org.springframework.boot.context.properties.source.MapConfigurationPropertySource(Map.of(
                "ai.text-providers.deepseek.enabled", "true",
                "ai.text-providers.deepseek.api-key", "new-test-key",
                "ai.deepseek.api-key", "old-test-key"));
        var bound = new org.springframework.boot.context.properties.bind.Binder(source)
                .bind("ai.text-providers", org.springframework.boot.context.properties.bind.Bindable.of(TextProviderProperties.class)).get();
        assertThat(bound.getDeepseek().isEnabled()).isTrue();
        assertThat(bound.getDeepseek().getApiKey()).isEqualTo("new-test-key");
        assertThat(bound.getMimo().isEnabled()).isFalse();
        assertThat(bound.getMimo().getApiKey()).isNull();
        assertThat(bound.toString()).doesNotContain("new-test-key", "old-test-key");
    }

    @BeforeEach
    void setUp() {
        properties = new TextProviderProperties();
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        modelAccess = mock(TextModelAccess.class);
        provider = new OfficialTextProvider(properties, builder, modelAccess);
    }

    private void enable(TextProviderProperties.Endpoint endpoint) {
        endpoint.setEnabled(true);
        endpoint.setApiKey("test-only-key");
    }

    @Test
    void disabledCatalogCannotBeBypassedThroughDirectProviderCalls() {
        enable(properties.getDeepseek());
        doThrow(new BusinessException(ResultCode.CONFIG_ERROR, "disabled"))
                .when(modelAccess).requireEnabled("deepseek-flash");
        assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOf(BusinessException.class);
        server.verify();
    }

    private TextGenerationResult generate(String model) {
        return provider.generateText("八仙过海", model, 128, 0.7, 0.9);
    }

    private String success(String extra) {
        return "{\"id\":\"req-1\",\"model\":\"actual-revision\",\"choices\":[{\"message\":{\"content\":\"传说草稿\"},\"finish_reason\":\"stop\"}]" + extra + "}";
    }

    @Test
    void deepseekUsesOfficialEndpointAndNormalizesUsage() {
        enable(properties.getDeepseek());
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer test-only-key"))
                .andExpect(content().json("{\"model\":\"deepseek-flash\",\"max_tokens\":128,\"stream\":false,\"thinking\":{\"type\":\"disabled\"}}"))
                .andRespond(withSuccess(success(",\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3,\"total_tokens\":8}"), MediaType.APPLICATION_JSON));
        TextGenerationResult result = generate("deepseek-flash");
        assertThat(result.text()).isEqualTo("传说草稿");
        assertThat(result.provider()).isEqualTo("DEEPSEEK");
        assertThat(result.model()).isEqualTo("actual-revision");
        assertThat(result.requestId()).isEqualTo("req-1");
        assertThat(result.tokensUsed()).isEqualTo(8);
        server.verify();
    }

    @Test
    void mimoUsesItsOwnTokenLimitAndKey() {
        enable(properties.getMimo());
        properties.getMimo().setApiKey("mimo-test-key");
        server.expect(requestTo("https://api.xiaomimimo.com/v1/chat/completions"))
                .andExpect(header("Authorization", "Bearer mimo-test-key"))
                .andExpect(content().json("{\"model\":\"mimo-v2.6-pro\",\"max_completion_tokens\":128}"))
                .andRespond(withSuccess(success(""), MediaType.APPLICATION_JSON));
        assertThat(generate("mimo-v2.6-pro").tokensUsed()).isNull();
        server.verify();
    }

    @Test
    void rejectsLegacyModelsAndMissingConfigurationBeforeAnyRequest() {
        for (String model : new String[]{"gemini-3.5-flash", "gpt-4o", "agnes-2.0-flash", "deepseek-v4-flash", "", null}) {
            assertThatThrownBy(() -> generate(model)).isInstanceOfSatisfying(BusinessException.class,
                    ex -> assertThat(ex.getResultCode()).isEqualTo(ResultCode.PARAM_INVALID));
        }
        assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOfSatisfying(BusinessException.class,
                ex -> assertThat(ex.getResultCode()).isEqualTo(ResultCode.CONFIG_ERROR));
        properties.getDeepseek().setEnabled(true);
        assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    void cannotConfigureOldOrArbitraryEndpoints() {
        enable(properties.getDeepseek());
        for (String endpoint : new String[]{"https://www.geeknow.top", "https://api.deepseek.com.evil.invalid", "http://api.deepseek.com", "https://api.deepseek.com/?key=secret"}) {
            properties.getDeepseek().setBaseUrl(endpoint);
            assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOfSatisfying(BusinessException.class,
                    ex -> assertThat(ex.getResultCode()).isEqualTo(ResultCode.CONFIG_ERROR));
        }
        server.verify();
    }

    @Test
    void upstreamFailureIsSanitizedAndNotRetried() {
        enable(properties.getDeepseek());
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("secret-key-in-upstream-error"));
        assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOf(BusinessException.class)
                .hasMessageNotContaining("secret-key").hasNoCause();
        server.verify();
    }

    @Test
    void ambiguousTransportFailureDoesNotRetryOrExposeRequestDetails() {
        enable(properties.getDeepseek());
        server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                .andRespond(withException(new IOException("secret-transport-detail")));
        assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOf(BusinessException.class)
                .hasMessageNotContaining("secret-transport-detail").hasNoCause();
        server.verify();
    }

    @Test
    void emptyTruncatedAndMalformedResponsesAreNotSuccessfulGenerations() {
        enable(properties.getDeepseek());
        for (String body : new String[]{"{\"choices\":[]}", "not-json", success("").replace("stop", "length")}) {
            server.reset();
            server.expect(requestTo("https://api.deepseek.com/chat/completions"))
                    .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            assertThatThrownBy(() -> generate("deepseek-flash")).isInstanceOf(BusinessException.class);
            server.verify();
        }
    }

    @Test
    void validatesInputAndKeepsCredentialsOutOfConfigurationDisplay() {
        enable(properties.getDeepseek());
        assertThat(properties.toString()).doesNotContain("test-only-key");
        assertThatThrownBy(() -> provider.generateText("", "deepseek-flash", 0, 0.7, 0.9))
                .isInstanceOf(BusinessException.class);
        server.verify();
    }
}
