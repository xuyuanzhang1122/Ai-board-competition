package com.ym.ai_story_studio_server.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Loads project .env files before Spring binds application.yml placeholders.
 *
 * <p>Load order is project root .env first, then backend/.env, so backend-specific
 * values can override shared values. Loaded values are added before system
 * environment variables to make the local .env the source of truth in dev.
 */
public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final String PROPERTY_SOURCE_NAME = "projectDotenv";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> properties = new LinkedHashMap<>();
        for (Path path : candidateFiles()) {
            if (Files.isRegularFile(path)) {
                load(path, properties);
            }
        }
        if (!properties.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, properties));
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }

    private static Set<Path> candidateFiles() {
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        Path projectRoot = cwd;
        if ("backend".equalsIgnoreCase(String.valueOf(cwd.getFileName()))) {
            projectRoot = cwd.getParent();
        } else if (!Files.isDirectory(cwd.resolve("backend")) && cwd.getParent() != null
                && Files.isDirectory(cwd.getParent().resolve("backend"))) {
            projectRoot = cwd.getParent();
        }

        Set<Path> candidates = new LinkedHashSet<>();
        candidates.add(projectRoot.resolve(".env").normalize());
        candidates.add(projectRoot.resolve("backend").resolve(".env").normalize());
        candidates.add(cwd.resolve(".env").normalize());
        return candidates;
    }

    private static void load(Path path, Map<String, Object> target) {
        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                parseLine(line).forEach(target::put);
            }
        } catch (IOException ignored) {
            // Optional local configuration; keep startup behavior unchanged if unreadable.
        }
    }

    private static Map<String, String> parseLine(String rawLine) {
        String line = rawLine.trim();
        if (line.isEmpty() || line.startsWith("#")) {
            return Map.of();
        }
        if (line.startsWith("export ")) {
            line = line.substring("export ".length()).trim();
        }

        int separator = line.indexOf('=');
        if (separator <= 0) {
            return Map.of();
        }

        String key = line.substring(0, separator).trim();
        String value = line.substring(separator + 1).trim();
        if (key.isEmpty()) {
            return Map.of();
        }
        return Map.of(key, unquote(value));
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1)
                    .replace("\\n", "\n")
                    .replace("\\r", "\r")
                    .replace("\\t", "\t")
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        if (value.length() >= 2 && value.startsWith("'") && value.endsWith("'")) {
            return value.substring(1, value.length() - 1);
        }

        int inlineComment = value.indexOf(" #");
        if (inlineComment >= 0) {
            value = value.substring(0, inlineComment).trim();
        }
        return value;
    }
}
