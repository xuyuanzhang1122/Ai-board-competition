package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.config.TextTaskExecutorConfig;
import com.ym.ai_story_studio_server.dto.ai.TextGenerateRequest;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.provider.TextGenerationResult;
import com.ym.ai_story_studio_server.util.UserContext;
import org.apache.ibatis.session.SqlSessionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.*;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;

/** Real Spring transaction advice, production MyBatis mapper, isolated H2 only. */
class AiTextTransactionTest {
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private AiTextService service;
    private TextGenerationProvider provider;
    private final TextGenerateRequest request = new TextGenerateRequest("八仙过海", null, null, null);

    @Configuration
    @EnableTransactionManagement
    @Import({AiTextService.class, TextTaskExecutorConfig.class})
    static class Config {
        @Bean DataSource dataSource() {
            JdbcDataSource source = new JdbcDataSource();
            source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
            new JdbcTemplate(source).execute("""
                    CREATE TABLE jobs (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, project_id BIGINT,
                      toolbox_session_id BIGINT, toolbox_deleted_at TIMESTAMP, job_type VARCHAR(50), status VARCHAR(32),
                      progress INT, total_items INT, done_items INT, started_at TIMESTAMP, finished_at TIMESTAMP,
                      error_message VARCHAR(1024), result_url VARCHAR(1024), cost_points INT, meta_json CLOB,
                      created_at TIMESTAMP, updated_at TIMESTAMP)
                    """);
            return source;
        }
        @Bean PlatformTransactionManager transactions(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean SqlSessionFactory sessions(DataSource source) throws Exception {
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.addMapper(JobMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setConfiguration(configuration);
            factory.setDataSource(source);
            return factory.getObject();
        }
        @Bean JobMapper jobs(SqlSessionFactory sessions) { return new SqlSessionTemplate(sessions).getMapper(JobMapper.class); }
        @Bean TextGenerationProvider provider() { return mock(TextGenerationProvider.class); }
        @Bean ChargingService charging() { return mock(ChargingService.class); }
        @Bean AiProperties settings() { return new AiProperties(); }
        @Bean ObjectMapper mapper() { return new ObjectMapper(); }
    }

    @BeforeEach
    void setup() {
        context = new AnnotationConfigApplicationContext(Config.class);
        jdbc = new JdbcTemplate(context.getBean(DataSource.class));
        service = context.getBean(AiTextService.class);
        provider = context.getBean(TextGenerationProvider.class);
        when(context.getBean(ChargingService.class).charge(any())).thenReturn(
                ChargingService.ChargingResult.builder().totalCost(0).build());
        when(provider.generateText(any(), any(), any(), any(), any())).thenReturn(
                new TextGenerationResult("草稿", "revision", "DEEPSEEK", "request-1", 10));
        UserContext.setUserId(1L);
    }

    @AfterEach
    void cleanup() {
        UserContext.clear();
        context.close();
        jdbc.execute("SHUTDOWN");
    }

    @Test
    void failedSynchronousCallRetainsQueryableJobAndFrozenInput() throws Exception {
        when(provider.generateText(any(), any(), any(), any(), any()))
                .thenThrow(new BusinessException(ResultCode.AI_SERVICE_ERROR, "模拟上游失败"));
        assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
        assertThat(jdbc.queryForList("SELECT status FROM jobs", String.class)).containsExactly("FAILED");
        var metadata = new ObjectMapper().readTree(jdbc.queryForObject("SELECT meta_json FROM jobs", String.class));
        assertThat(metadata.path("textSnapshot").path("prompt").asText()).isEqualTo("八仙过海");
        assertThat(metadata.path("executionError").asText()).contains("模拟上游失败");
    }

    @Test
    void outerRollbackCannotEraseSuccessfulCallAndHttpDoesNotHoldTransaction() {
        AtomicReference<Boolean> activeAtProvider = new AtomicReference<>();
        when(provider.generateText(any(), any(), any(), any(), any())).thenAnswer(call -> {
            activeAtProvider.set(TransactionSynchronizationManager.isActualTransactionActive());
            return new TextGenerationResult("草稿", "revision", "DEEPSEEK", "request-1", 10);
        });
        new TransactionTemplate(context.getBean(PlatformTransactionManager.class)).executeWithoutResult(tx -> {
            service.generateText(request);
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            tx.setRollbackOnly();
        });
        assertThat(activeAtProvider.get()).isFalse();
        assertThat(jdbc.queryForList("SELECT status FROM jobs", String.class)).containsExactly("SUCCEEDED");
        assertThat(jdbc.queryForObject("SELECT meta_json FROM jobs", String.class)).contains("request-1");
    }

    @Test
    void outerRollbackCannotEraseFailedCallAndCallerTransactionIsRestored() {
        when(provider.generateText(any(), any(), any(), any(), any()))
                .thenThrow(new BusinessException(ResultCode.AI_SERVICE_ERROR, "模拟上游失败"));
        new TransactionTemplate(context.getBean(PlatformTransactionManager.class)).executeWithoutResult(tx -> {
            assertThatThrownBy(() -> service.generateText(request)).isInstanceOf(BusinessException.class);
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            tx.setRollbackOnly();
        });
        assertThat(jdbc.queryForList("SELECT status FROM jobs", String.class)).containsExactly("FAILED");
    }

    @Test
    void asyncJobIsCommittedBeforeDispatchAndSurvivesOuterRollback() {
        new TransactionTemplate(context.getBean(PlatformTransactionManager.class)).executeWithoutResult(tx -> {
            assertThat(service.generateTextAsync(request).jobId()).isNotNull();
            tx.setRollbackOnly();
        });
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() ->
                assertThat(jdbc.queryForList("SELECT status FROM jobs", String.class)).containsExactly("SUCCEEDED"));
        assertThat(jdbc.queryForObject("SELECT user_id FROM jobs", Long.class)).isEqualTo(1L);
    }
}
