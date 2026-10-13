package com.ym.ai_story_studio_server.client;

import com.sun.net.httpserver.HttpServer;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.service.StorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class GeeknowClientTest {

    private HttpServer server;
    private HttpServer fallbackServer;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
        if (fallbackServer != null) {
            fallbackServer.stop(0);
        }
    }

    @Test
    void geminiImageUsesNativeGenerationConfig() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1beta/models/gemini-3-pro-image-preview:generateContent", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = ("{\"candidates\":[{\"content\":{\"parts\":["
                    + "{\"inlineData\":{\"mimeType\":\"image/png\",\"data\":\"aGVsbG8=\"}}]}}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        GeeknowClient client = clientFor(server, null);
        GeeknowClient.ImageApiResponse response = client.generateImage(
                "雨夜宫殿", "gemini-3-pro-image-preview", "21:9", List.of()
        );

        assertThat(response.data().get(0).url()).isEqualTo("aGVsbG8=");
        assertThat(requestBody.get())
                .contains("\"responseModalities\"")
                .contains("\"aspectRatio\":\"21:9\"")
                .contains("\"imageSize\":\"2K\"")
                .doesNotContain("\"size\"");
    }

    @Test
    void imageGenerationRetriesAfterTransientConnectionDrop() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/images/generations", exchange -> {
            if (attempts.incrementAndGet() == 1) {
                exchange.close();
                return;
            }
            byte[] response = ("{\"data\":[{\"url\":\"https://example.com/image.png\"}],"
                    + "\"model\":\"gpt-image-2\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        GeeknowClient client = clientFor(server, null);

        GeeknowClient.ImageApiResponse response = client.generateImage(
                "雨夜宫殿",
                "gpt-image-2",
                "4:3",
                List.of()
        );

        assertThat(attempts.get()).isEqualTo(2);
        assertThat(response.data().get(0).url()).isEqualTo("https://example.com/image.png");
    }

    @Test
    void retriesFiveHundredErrorsOnFallbackDomain() throws Exception {
        AtomicInteger primaryAttempts = new AtomicInteger();
        AtomicInteger fallbackAttempts = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/images/generations", exchange -> {
            primaryAttempts.incrementAndGet();
            byte[] response = "{\"error\":{\"message\":\"temporary outage\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(503, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        fallbackServer = HttpServer.create(new InetSocketAddress(0), 0);
        fallbackServer.createContext("/v1/images/generations", exchange -> {
            fallbackAttempts.incrementAndGet();
            byte[] response = "{\"data\":[{\"url\":\"https://example.com/fallback.png\"}]}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        fallbackServer.start();

        GeeknowClient client = clientFor(server, fallbackServer);
        GeeknowClient.ImageApiResponse response = client.generateImage(
                "雨夜宫殿", "gpt-image-2", "1:1", List.of()
        );

        assertThat(primaryAttempts.get()).isEqualTo(1);
        assertThat(fallbackAttempts.get()).isEqualTo(1);
        assertThat(response.data().get(0).url()).isEqualTo("https://example.com/fallback.png");
    }

    @Test
    void imageQueryTreatsStatuslessImageDataAsCompleted() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/images/generations/async/task-1", exchange -> {
            byte[] response = ("{\"data\":[{\"url\":\"https://example.com/final.png\"}],"
                    + "\"size\":\"1920x1080\",\"created\":1782958918}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        GeeknowClient.ImageTaskApiResponse response = clientFor(server, null).queryImageTask("task-1");

        assertThat(response.status()).isEqualTo("completed");
        assertThat(response.progress()).isEqualTo(100);
        assertThat(response.toImageResponse().data().get(0).url())
                .isEqualTo("https://example.com/final.png");
    }

    @Test
    void imageQueryAcceptsPercentageStringProgressWithoutFallbackParsing() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/images/generations/async/task-progress", exchange -> {
            byte[] response = ("{\"id\":\"task-progress\",\"status\":\"queued\","
                    + "\"progress\":\"10%\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        GeeknowClient.ImageTaskApiResponse response = clientFor(server, null)
                .queryImageTask("task-progress");

        assertThat(response.status()).isEqualTo("queued");
        assertThat(response.progress()).isEqualTo(10);
    }

    private GeeknowClient clientFor(HttpServer primary, HttpServer fallback) {
        AiProperties properties = new AiProperties();
        properties.getGeeknow().setBaseUrl("http://127.0.0.1:" + primary.getAddress().getPort());
        properties.getGeeknow().setApiKey("test-key");
        properties.getGeeknow().setFallbackBaseUrl(fallback == null
                ? properties.getGeeknow().getBaseUrl()
                : "http://127.0.0.1:" + fallback.getAddress().getPort());
        return new GeeknowClient(properties, mock(StorageService.class));
    }
}
