package com.ym.ai_story_studio_server.brainstorm;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetAddress;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BrainstormWebTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PublicWebUrls urls = new PublicWebUrls(host -> new InetAddress[]{InetAddress.getByName("8.8.8.8")});

    @Test void rejectsPrivateAndCredentialUrlsBeforeTransport() {
        var web = new BrainstormWeb(json, "secret", urls, (path, body, key) -> { fail("must not contact provider"); return null; });
        for (String url : new String[]{"http://example.com", "https://localhost/x", "https://127.0.0.1", "https://169.254.169.254/latest", "https://user:pass@example.com", "https://[::1]", "https://example.com:8080", "https://2130706433"})
            assertThrows(IllegalArgumentException.class, () -> web.read(url), url);
    }
    @Test void rejectsPrivateDnsAndMappedIpv6() {
        var privateDns = new PublicWebUrls(host -> new InetAddress[]{InetAddress.getByName("192.168.1.2")});
        assertThrows(IllegalArgumentException.class, () -> privateDns.validate("https://public-looking.example"));
        assertThrows(IllegalArgumentException.class, () -> urls.validate("https://[::ffff:127.0.0.1]"));
    }
    @Test void missingKeyIsExplicitlyUnavailable() {
        var web = new BrainstormWeb(json, "", urls, (path, body, key) -> { fail("must not call without key"); return null; });
        assertEquals("UNAVAILABLE", web.search("八仙过海").path("status").asText());
    }
    @Test void searchFiltersUnsafeResultsAndPreservesUnreviewedProvenance() throws Exception {
        var requested = new AtomicReference<String>();
        var web = new BrainstormWeb(json, "secret", urls, (path, body, key) -> {
            requested.set(path + ":" + body.path("limit").asInt());
            return json.readTree("{\"success\":true,\"data\":{\"web\":[{\"url\":\"https://example.com/story\",\"title\":\"传说\",\"description\":\"传说内容\"},{\"url\":\"https://127.0.0.1/secrets\",\"description\":\"never expose\"}]}}");
        });
        var result = web.search("八仙过海");
        assertEquals("/search:3", requested.get());
        assertEquals(1, result.path("sources").size());
        assertEquals("UNREVIEWED", result.path("sources").get(0).path("reviewStatus").asText());
        assertFalse(result.toString().contains("never expose"));
        assertFalse(result.toString().contains("secret"));
    }
    @Test void rejectsRedirectedPrivateSourceAndBoundsContent() throws Exception {
        var web = new BrainstormWeb(json, "secret", urls, (path, body, key) -> json.readTree("{\"success\":true,\"data\":{\"markdown\":\"secret content\",\"metadata\":{\"sourceURL\":\"https://127.0.0.1/x\"}}}"));
        assertThrows(IllegalArgumentException.class, () -> web.read("https://example.com/story"));
        var safe = new BrainstormWeb(json, "secret", urls, (path, body, key) -> {
            assertFalse(body.path("skipTlsVerification").asBoolean());
            assertEquals("markdown", body.path("formats").get(0).asText());
            return json.createObjectNode().put("success", true).set("data", json.createObjectNode().put("markdown", "x".repeat(20000)));
        });
        assertTrue(safe.read("https://example.com/story").path("sources").get(0).path("content").asText().length() <= 6000);
    }
}
