package com.ym.ai_story_studio_server.mapper;

import com.ym.ai_story_studio_server.entity.Job;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** Executes production mapper SQL against an isolated in-memory database, never application config. */
class TextJobClaimTest {
    private JdbcTemplate jdbc;
    private SqlSessionFactory sessions;

    @BeforeEach
    void setup() {
        var source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("""
            CREATE TABLE jobs (id BIGINT PRIMARY KEY, user_id BIGINT, project_id BIGINT,
              job_type VARCHAR(50), status VARCHAR(32), started_at TIMESTAMP, finished_at TIMESTAMP,
              progress INT, done_items INT, error_message VARCHAR(1024), cost_points INT, meta_json CLOB)
            """);
        jdbc.update("INSERT INTO jobs(id,user_id,project_id,job_type,status,meta_json,progress,done_items) VALUES(1,42,7,'PARSE_TEXT','PENDING','{}',0,0)");
        Configuration config = new Configuration(new Environment("test", new JdbcTransactionFactory(), source));
        config.addMapper(JobMapper.class);
        sessions = new SqlSessionFactoryBuilder().build(config);
    }

    @AfterEach
    void close() { jdbc.execute("SHUTDOWN"); }

    @Test
    void concurrentDeliveriesOnlyOneClaimSucceeds() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Integer> claim = () -> {
                start.await();
                try (var session = sessions.openSession(true)) {
                    return session.getMapper(JobMapper.class).claimPendingTextJob(1L, 42L, 7L);
                }
            };
            var first = pool.submit(claim);
            var second = pool.submit(claim);
            start.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS) + second.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("RUNNING");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void wrongOwnerOrProjectCannotClaim() {
        try (var session = sessions.openSession(true)) {
            JobMapper mapper = session.getMapper(JobMapper.class);
            assertThat(mapper.claimPendingTextJob(1L, 99L, 7L)).isZero();
            assertThat(mapper.claimPendingTextJob(1L, 42L, 8L)).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("PENDING");
    }

    @Test
    void completionWinsBeforeCancellationWriteAndRetainsAudit() {
        jdbc.update("UPDATE jobs SET status='RUNNING' WHERE id=1");
        // The cancel service can have read RUNNING already; its later SQL must check current status.
        Job completed = new Job();
        completed.setId(1L);
        completed.setUserId(42L);
        completed.setProjectId(7L);
        completed.setStatus("SUCCEEDED");
        completed.setProgress(100);
        completed.setDoneItems(1);
        completed.setMetaJson("{\"providerRequestId\":\"req-finished\"}");
        try (var session = sessions.openSession(true)) {
            JobMapper mapper = session.getMapper(JobMapper.class);
            assertThat(mapper.finishClaimedTextJob(completed)).isEqualTo(1);
            assertThat(mapper.cancelActiveJob(1L, 42L)).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("SUCCEEDED");
        assertThat(jdbc.queryForObject("SELECT meta_json FROM jobs WHERE id=1", String.class)).contains("req-finished");
    }

    @Test
    void cancelChecksOwnerAndPreservesSnapshotThenRejectsRepeat() {
        jdbc.update("UPDATE jobs SET meta_json='{\"textSnapshot\":{\"version\":1}}' WHERE id=1");
        try (var session = sessions.openSession(true)) {
            JobMapper mapper = session.getMapper(JobMapper.class);
            assertThat(mapper.cancelActiveJob(1L, 99L)).isZero();
            assertThat(mapper.cancelActiveJob(1L, 42L)).isEqualTo(1);
            assertThat(mapper.cancelActiveJob(1L, 42L)).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("CANCELED");
        assertThat(jdbc.queryForObject("SELECT meta_json FROM jobs WHERE id=1", String.class)).contains("textSnapshot");
    }

    @Test
    void staleCompletionAndFailureCannotOverwriteCanceledOrClaimedJob() {
        jdbc.update("UPDATE jobs SET status='CANCELED' WHERE id=1");
        Job finished = new Job();
        finished.setId(1L);
        finished.setUserId(42L);
        finished.setProjectId(7L);
        finished.setStatus("SUCCEEDED");
        finished.setProgress(100);
        finished.setDoneItems(1);
        finished.setMetaJson("{\"providerRequestId\":\"req-1\"}");
        try (var session = sessions.openSession(true)) {
            JobMapper mapper = session.getMapper(JobMapper.class);
            assertThat(mapper.finishClaimedTextJob(finished)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("CANCELED");
            assertThat(jdbc.queryForObject("SELECT progress FROM jobs WHERE id=1", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT meta_json FROM jobs WHERE id=1", String.class)).contains("req-1");
            assertThat(mapper.failPendingTextJob(1L, 42L, 7L, "late-error")).isZero();
            jdbc.update("UPDATE jobs SET status='RUNNING' WHERE id=1");
            assertThat(mapper.failPendingTextJob(1L, 42L, 7L, "late-validation")).isZero();
            assertThat(mapper.finishClaimedTextJob(finished)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT status FROM jobs WHERE id=1", String.class)).isEqualTo("SUCCEEDED");
        assertThat(jdbc.queryForObject("SELECT progress FROM jobs WHERE id=1", Integer.class)).isEqualTo(100);
    }
}
