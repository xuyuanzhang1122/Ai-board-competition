package com.ym.ai_story_studio_server.brainstorm;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;

/** The application only sends validated public URLs to a fixed external scraping service. */
final class PublicWebUrls {
    interface Resolver { InetAddress[] resolve(String host) throws UnknownHostException; }
    private final Resolver resolver;
    PublicWebUrls() { this(InetAddress::getAllByName); }
    PublicWebUrls(Resolver resolver) { this.resolver = resolver; }

    String validate(String value) {
        if (value == null || value.length() > 2000) throw invalid();
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getFragment() != null) throw invalid();
            host = host.toLowerCase(Locale.ROOT);
            // Forbid literals, obscure numeric IPv4 encodings and local hostnames before DNS.
            if (!host.matches("[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?") || !host.contains(".")
                    || host.matches("[0-9.]+") || host.endsWith(".localhost") || host.endsWith(".local")
                    || host.endsWith(".internal") || host.endsWith(".invalid") || host.contains("..")) throw invalid();
            InetAddress[] addresses = resolver.resolve(host);
            if (addresses.length == 0) throw invalid();
            for (InetAddress address : addresses) if (!isPublic(address)) throw invalid();
            return uri.normalize().toASCIIString();
        } catch (UnknownHostException | IllegalArgumentException e) { throw invalid(); }
    }

    private boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] b = address.getAddress();
        int a = b[0] & 255, c = b[1] & 255;
        if (b.length == 16) return (a & 0xe0) == 0x20; // Global-unicast only, no mapped/NAT64/local forms.
        return a != 0 && a != 10 && a != 127 && a < 224
                && !(a == 100 && c >= 64 && c <= 127)
                && !(a == 169 && c == 254) && !(a == 172 && c >= 16 && c <= 31)
                && !(a == 192 && (c == 0 || c == 168))
                && !(a == 198 && (c == 18 || c == 19 || c == 51))
                && !(a == 203 && c == 0);
    }
    private IllegalArgumentException invalid() { return new IllegalArgumentException("仅允许无凭据、使用标准端口的公开 HTTPS 网页；内网、元数据和未解析地址不可读取"); }
}
