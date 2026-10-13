package com.ym.ai_story_studio_server.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.service.StorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SudashuiVideoClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void multiReferenceRequestUsesStorageResolvedUrlsInMetadataPayload() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/video/generations", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = ("{\"id\":\"task_1\",\"task_id\":\"task_1\",\"object\":\"video\","
                    + "\"model\":\"sd-api-2-fast-720p\",\"status\":\"queued\",\"progress\":0,"
                    + "\"created_at\":1780990464}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        StorageService storageService = mock(StorageService.class);
        when(storageService.resolveExternalAccessUrl("/uploads/one.png", 120))
                .thenReturn("https://signed.example/one.png?token=1");
        when(storageService.resolveExternalAccessUrl("/uploads/two.png", 120))
                .thenReturn("https://signed.example/two.png?token=2");

        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, storageService);

        SudashuiVideoClient.VideoTaskResponse response = client.createVideo(
                "镜头缓慢推进",
                SudashuiVideoClient.MODEL_BYPASS_FAST_720P,
                "16:9",
                10,
                "854x480",
                List.of("/uploads/one.png", "/uploads/two.png")
        );

        assertThat(response.taskId()).isEqualTo("task_1");

        JsonNode sentBody = objectMapper.readTree(requestBody.get());
        assertThat(sentBody.get("model").asText()).isEqualTo("sd-api-2-fast-720p");
        assertThat(sentBody.get("duration").asInt()).isEqualTo(10);
        assertThat(sentBody.has("resolution")).isFalse();
        assertThat(sentBody.has("aspectRatio")).isFalse();
        assertThat(sentBody.has("imageUrls")).isFalse();

        JsonNode payload = objectMapper.readTree(sentBody.get("metadata").get("payload").asText());
        assertThat(payload.get("aspectRatio").asText()).isEqualTo("16:9");
        assertThat(payload.get("mode").asText()).isEqualTo("references");
        List<String> imageUrls = objectMapper.convertValue(payload.get("imageUrls"), List.class);
        assertThat(imageUrls).containsExactly(
                "https://signed.example/one.png?token=1",
                "https://signed.example/two.png?token=2");

        verify(storageService).resolveExternalAccessUrl("/uploads/one.png", 120);
        verify(storageService).resolveExternalAccessUrl("/uploads/two.png", 120);
    }

    @Test
    void wrappedQueryResponseDownloadsOnceWithoutLeakingProviderAuthorization() throws Exception {
        AtomicInteger queryCount = new AtomicInteger();
        AtomicReference<String> downloadAuthorization = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        int port = server.getAddress().getPort();
        server.createContext("/v1/video/generations/task_2", exchange -> {
            queryCount.incrementAndGet();
            String json = "{\"code\":\"success\",\"message\":\"\",\"data\":{"
                    + "\"task_id\":\"task_2\",\"status\":\"SUCCESS\","
                    + "\"result_url\":\"http://127.0.0.1:" + port + "/result.mp4\","
                    + "\"progress\":\"100%\","
                    + "\"data\":{\"state\":\"success\",\"message\":\"\",\"err_code\":\"\",\"creations\":["
                    + "{\"id\":\"c1\",\"url\":\"http://127.0.0.1:" + port + "/result.mp4\","
                    + "\"cover_url\":\"http://127.0.0.1:" + port + "/first.jpg\"}]}}}";
            byte[] response = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.createContext("/result.mp4", exchange -> {
            downloadAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] response = new byte[]{1, 2, 3};
            exchange.getResponseHeaders().set("Content-Type", "video/mp4");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:" + port);
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, mock(StorageService.class));

        SudashuiVideoClient.VideoTaskResponse status = client.queryTaskStatus("task_2");
        SudashuiVideoClient.VideoContentResponse content = client.downloadVideoContent(status);

        assertThat(status.status()).isEqualTo("SUCCESS");
        assertThat(status.progress()).isEqualTo(100);
        assertThat(status.videoUrl()).isEqualTo("http://127.0.0.1:" + port + "/result.mp4");
        assertThat(content.content()).containsExactly(1, 2, 3);
        assertThat(queryCount).hasValue(1);
        assertThat(downloadAuthorization.get()).isNull();
    }

    @Test
    void fallsBackToCreationsUrlWhenResultUrlMissing() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        int port = server.getAddress().getPort();
        server.createContext("/v1/video/generations/task_3", exchange -> {
            String json = "{\"code\":\"success\",\"message\":\"\",\"data\":{"
                    + "\"task_id\":\"task_3\",\"status\":\"SUCCESS\",\"progress\":\"100%\","
                    + "\"data\":{\"state\":\"success\",\"creations\":["
                    + "{\"id\":\"c1\",\"url\":\"http://127.0.0.1:" + port + "/creation.mp4\"}]}}}";
            byte[] response = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:" + port);
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, mock(StorageService.class));

        SudashuiVideoClient.VideoTaskResponse status = client.queryTaskStatus("task_3");

        assertThat(status.videoUrl()).isEqualTo("http://127.0.0.1:" + port + "/creation.mp4");
    }

    @Test
    void failedQueryResponseSurfacesFailReason() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/video/generations/task_4", exchange -> {
            String json = "{\"code\":\"success\",\"message\":\"\",\"data\":{"
                    + "\"task_id\":\"task_4\",\"status\":\"FAILURE\","
                    + "\"fail_reason\":\"Real human faces are not supported.\","
                    + "\"progress\":\"100%\",\"data\":{\"state\":\"failed\","
                    + "\"message\":\"Real human faces are not supported.\",\"creations\":[]}}}";
            byte[] response = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, mock(StorageService.class));

        SudashuiVideoClient.VideoTaskResponse status = client.queryTaskStatus("task_4");

        assertThat(status.status()).isEqualTo("FAILURE");
        assertThat(status.errorMessage()).isEqualTo("Real human faces are not supported.");
    }

    @Test
    void createFailureUnwrapsNestedJsonMessage() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/video/generations", exchange -> {
            String json = "{\"code\":\"fail_to_fetch_task\","
                    + "\"message\":\"{\\\"state\\\":\\\"failed\\\",\\\"err_code\\\":\\\"invalid_request\\\","
                    + "\\\"message\\\":\\\"duration must be from 4 to 15 seconds.\\\",\\\"creations\\\":[]}\","
                    + "\"data\":null}";
            byte[] response = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, mock(StorageService.class));

        assertThatThrownBy(() -> client.createVideo(
                "prompt", SudashuiVideoClient.MODEL_BYPASS_FAST_720P, "16:9", 2, null, List.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("duration must be from 4 to 15 seconds.");
    }

    @Test
    void durationIsClampedToFourToFifteenSecondRange() {
        AiProperties properties = new AiProperties();
        properties.getSudashuiVideo().setBaseUrl("http://127.0.0.1:1");
        properties.getSudashuiVideo().setApiKey("test-key");
        SudashuiVideoClient client = new SudashuiVideoClient(properties, mock(StorageService.class));

        assertThat(client.resolveVideoDuration(SudashuiVideoClient.MODEL_STANDARD_720P, 2)).isEqualTo(4);
        assertThat(client.resolveVideoDuration(SudashuiVideoClient.MODEL_STANDARD_720P, 20)).isEqualTo(15);
        assertThat(client.resolveVideoDuration(SudashuiVideoClient.MODEL_STANDARD_720P, null)).isEqualTo(5);
    }
}
