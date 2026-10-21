package com.ym.ai_story_studio_server.brainstorm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/** Firecrawl v2 adapter. Scraped pages never acquire the knowledge library's APPROVED status. */
@Component
public class BrainstormWeb {
    interface Transport { JsonNode post(String path, JsonNode body, String key) throws Exception; }
    private final ObjectMapper json;
    private final String key;
    private final PublicWebUrls urls;
    private final Transport transport;

    @Autowired
    public BrainstormWeb(ObjectMapper json, @Value("${brainstorm.web.firecrawl-api-key:${BRAINSTORM_WEB_FIRECRAWL_API_KEY:}}") String key) {
        this(json, key, new PublicWebUrls(), officialTransport(json));
    }
    BrainstormWeb(ObjectMapper json, String key, PublicWebUrls urls, Transport transport) {
        this.json = json; this.key = key == null ? "" : key.trim(); this.urls = urls; this.transport = transport;
    }
    public JsonNode search(String query) {
        if (query == null || query.isBlank() || query.length() > 300) throw new IllegalArgumentException("检索词须为1至300字");
        if (key.isBlank()) return unavailable();
        var body = json.createObjectNode().put("query", query).put("limit", 3).put("timeout", 20000).put("domainTools", false);
        body.putArray("sources").add("web");
        JsonNode response = request("/search", body);
        var sources = json.createArrayNode();
        JsonNode results = response.path("data").path("web");
        if (!response.path("success").asBoolean()) return failed();
        for (JsonNode item : results) {
            if (sources.size() == 3) break;
            try {
                String url = urls.validate(item.path("url").asText());
                sources.add(source(url, item.path("title").asText("网页检索结果"), item.path("description").asText("")));
            } catch (IllegalArgumentException ignored) { /* Unsafe results are not returned to the agent. */ }
        }
        return result(sources);
    }
    public JsonNode read(String rawUrl) {
        String url = urls.validate(rawUrl);
        if (key.isBlank()) return unavailable();
        var body = json.createObjectNode().put("url", url).put("onlyMainContent", true)
                .put("timeout", 20000).put("skipTlsVerification", false);
        body.putArray("formats").add("markdown");
        body.putArray("parsers"); // Do not expand PDFs or launch OCR page jobs.
        JsonNode response = request("/scrape", body);
        if (!response.path("success").asBoolean()) return failed();
        JsonNode data = response.path("data"), metadata = data.path("metadata");
        // Validate both original and final provider URLs before exposing any returned content.
        for (String field : new String[]{"sourceURL", "url", "ogUrl"}) {
            String returned = metadata.path(field).asText("");
            if (!returned.isBlank()) urls.validate(returned);
        }
        var sources = json.createArrayNode().add(source(url, metadata.path("title").asText("外部网页"), data.path("markdown").asText("")));
        return result(sources);
    }
    private JsonNode request(String path, JsonNode body) {
        try { return transport.post(path, body, key); }
        catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            // Do not expose upstream response bodies, request headers or credentials in audit records.
            return json.createObjectNode().put("success", false);
        }
    }
    private ObjectNode source(String url, String title, String content) {
        String id;
        try { id = "web-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8))).substring(0, 24); }
        catch (Exception e) { throw new IllegalStateException("来源编号生成失败", e); }
        return json.createObjectNode().put("id", id).put("title", clip(title, 200)).put("url", url)
                .put("content", clip(content, 6000)).put("license", "未核验；仅作资料线索，生成和展示授权需人工确认")
                .put("reviewStatus", "UNREVIEWED");
    }
    private ObjectNode result(ArrayNode sources) { return json.createObjectNode().put("status", "UNREVIEWED").set("sources", sources); }
    private ObjectNode unavailable() { return json.createObjectNode().put("status", "UNAVAILABLE").put("message", "外部网页工具尚未配置；可继续使用已审核知识或请求补充资料").set("sources", json.createArrayNode()); }
    private ObjectNode failed() { return json.createObjectNode().put("status", "ERROR").put("message", "外部资料服务未返回可用结果；未自动重试").set("sources", json.createArrayNode()); }
    private String clip(String s, int limit) { return s.length() > limit ? s.substring(0, limit) : s; }

    private static Transport officialTransport(ObjectMapper json) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
        return (path, body, key) -> {
            if (!path.equals("/search") && !path.equals("/scrape")) throw new IllegalArgumentException("不支持的网页工具");
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.firecrawl.dev/v2" + path))
                    .timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + key).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream stream = response.body()) {
                if (response.statusCode() != 200) return json.createObjectNode().put("success", false);
                byte[] bytes = stream.readNBytes(1_048_577);
                if (bytes.length > 1_048_576) throw new IllegalArgumentException("网页响应过大");
                return json.readTree(bytes);
            }
        };
    }
}
