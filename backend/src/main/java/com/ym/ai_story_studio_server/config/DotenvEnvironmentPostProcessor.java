package com.ym.ai_story_studio_server.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

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
 * values can override shared values. Explicit startup properties and system
 * environment variables always override local files.
 * Set APP_DOTENV_ENABLED=false to skip local files, or APP_DOTENV_PATH to load
 * exactly one explicit file without merging copied project files.
 */
public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final String PROPERTY_SOURCE_NAME = "projectDotenv";
    private final Path workingDirectory;

    public DotenvEnvironmentPostProcessor() {
        this(Paths.get(""));
    }

    DotenvEnvironmentPostProcessor(Path workingDirectory) {
        this.workingDirectory = workingDirectory.toAbsolutePath().normalize();
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (!environment.getProperty("app.dotenv.enabled", Boolean.class, true)) {
            return;
        }
        Map<String, Object> properties = new LinkedHashMap<>();
        String explicitPath = environment.getProperty("app.dotenv.path");
        if (explicitPath != null) {
            try {
                load(workingDirectory.resolve(explicitPath).normalize(), properties);
            } catch (IOException | RuntimeException e) {
                throw new IllegalStateException("Explicit dotenv file cannot be loaded");
            }
        } else {
            for (Path path : candidateFiles()) {
                if (Files.isRegularFile(path)) {
                    try {
                        load(path, properties);
                    } catch (IOException ignored) {
                        // Default local files remain optional for development.
                    }
                }
            }
        }
        if (!properties.isEmpty()) {
            MapPropertySource source = new MapPropertySource(PROPERTY_SOURCE_NAME, properties);
            if (environment.getPropertySources().contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME)) {
                environment.getPropertySources().addAfter(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, source);
            } else {
                environment.getPropertySources().addLast(source);
            }
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }

    private Set<Path> candidateFiles() {
        Path cwd = workingDirectory;
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

    private static void load(Path path, Map<String, Object> target) throws IOException {
        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                parseLine(line).forEach(target::put);
            }
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
