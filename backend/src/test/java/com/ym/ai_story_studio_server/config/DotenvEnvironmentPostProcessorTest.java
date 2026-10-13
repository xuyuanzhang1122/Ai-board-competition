package com.ym.ai_story_studio_server.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.SimpleCommandLinePropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DotenvEnvironmentPostProcessorTest {

    @TempDir
    Path root;

    private StandardEnvironment environment(Map<String, Object> variables) {
        StandardEnvironment env = new StandardEnvironment();
        env.getPropertySources().replace(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME,
                new MapPropertySource(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME, Map.of()));
        env.getPropertySources().replace(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                new SystemEnvironmentPropertySource(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, variables));
        return env;
    }

    private void write(String name, String value) throws IOException {
        Path file = root.resolve(name);
        Files.createDirectories(file.getParent());
        Files.writeString(file, value);
    }

    private void process(StandardEnvironment env) {
        new DotenvEnvironmentPostProcessor(root).postProcessEnvironment(env, null);
    }

    @Test
    void environmentAndCommandLineOverrideLocalFiles() throws IOException {
        write(".env", "DB_HOST=original-db\nAPP_PORT=8080\n");
        StandardEnvironment env = environment(Map.of("DB_HOST", "competition-db"));
        env.getPropertySources().addFirst(new SimpleCommandLinePropertySource("--APP_PORT=18080"));
        process(env);
        assertThat(env.getProperty("DB_HOST")).isEqualTo("competition-db");
        assertThat(env.getProperty("APP_PORT")).isEqualTo("18080");
    }

    @Test
    void filesRemainFallbacksForApplicationPlaceholders() throws IOException {
        write(".env", "DB_HOST=competition-db\n");
        StandardEnvironment env = environment(Map.of());
        env.getPropertySources().addLast(new MapPropertySource("applicationConfig",
                Map.of("spring.datasource.url", "jdbc:mysql://${DB_HOST}:13307/ai_board_competition")));
        process(env);
        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:mysql://competition-db:13307/ai_board_competition");
    }

    @Test
    void backendFileOverridesRootFileAndKeepsDotenvSyntax() throws IOException {
        write(".env", "SHARED=root\nROOT_ONLY=kept\n");
        write("backend/.env", "export SHARED='backend'\nQUOTED=\"first\\nsecond\"\nCOMMENT=value # note\n");
        StandardEnvironment env = environment(Map.of());
        process(env);
        assertThat(env.getProperty("SHARED")).isEqualTo("backend");
        assertThat(env.getProperty("ROOT_ONLY")).isEqualTo("kept");
        assertThat(env.getProperty("QUOTED")).isEqualTo("first\nsecond");
        assertThat(env.getProperty("COMMENT")).isEqualTo("value");
    }

    @Test
    void disabledLoaderNeverReadsLocalFiles() throws IOException {
        write(".env", "MUST_NOT_LOAD=value\n");
        StandardEnvironment env = environment(Map.of("APP_DOTENV_ENABLED", "false"));
        process(env);
        assertThat(env.getPropertySources().contains("projectDotenv")).isFalse();
        assertThat(env.getProperty("MUST_NOT_LOAD")).isNull();
    }

    @Test
    void explicitFileDoesNotMergeCopiedProjectFiles() throws IOException {
        write(".env", "ORIGINAL_ONLY=must-not-load\nDB_HOST=original-db\n");
        write("backend/.env", "BACKEND_ONLY=must-not-load\n");
        write("competition.env", "DB_HOST=competition-db\n");
        StandardEnvironment env = environment(Map.of("APP_DOTENV_PATH", root.resolve("competition.env").toString()));
        process(env);
        assertThat(env.getProperty("DB_HOST")).isEqualTo("competition-db");
        assertThat(env.getProperty("ORIGINAL_ONLY")).isNull();
        assertThat(env.getProperty("BACKEND_ONLY")).isNull();
    }

    @Test
    void missingOrMalformedExplicitFileFailsWithoutPrintingContents() throws IOException {
        write(".env", "DB_HOST=original-db\n");
        StandardEnvironment missing = environment(Map.of("APP_DOTENV_PATH", "missing.env"));
        assertThatThrownBy(() -> process(missing)).isInstanceOf(IllegalStateException.class)
                .hasMessage("Explicit dotenv file cannot be loaded");
        Files.write(root.resolve("invalid.env"), new byte[]{(byte) 0xff});
        StandardEnvironment invalid = environment(Map.of("APP_DOTENV_PATH", "invalid.env"));
        assertThatThrownBy(() -> process(invalid)).isInstanceOf(IllegalStateException.class)
                .hasMessage("Explicit dotenv file cannot be loaded");
    }

    @Test
    void startingFromBackendUsesSameRootAndMissingOptionalFilesAreAllowed() throws IOException {
        Files.createDirectories(root.resolve("backend"));
        StandardEnvironment empty = environment(Map.of());
        new DotenvEnvironmentPostProcessor(root.resolve("backend")).postProcessEnvironment(empty, null);
        assertThat(empty.getPropertySources().contains("projectDotenv")).isFalse();
        write(".env", "ROOT_ONLY=kept\n");
        StandardEnvironment env = environment(Map.of());
        new DotenvEnvironmentPostProcessor(root.resolve("backend")).postProcessEnvironment(env, null);
        assertThat(env.getProperty("ROOT_ONLY")).isEqualTo("kept");
    }
}
