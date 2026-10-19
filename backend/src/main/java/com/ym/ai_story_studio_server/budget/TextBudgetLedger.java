package com.ym.ai_story_studio_server.budget;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/** Durable conservative reservations, not wallet charges or reconciled supplier bills. */
@Repository
public class TextBudgetLedger {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate independent;

    public TextBudgetLedger(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.independent = new TransactionTemplate(transactionManager);
        this.independent.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record Reservation(String id, Long userId, TextBudgetPolicy.Quote quote) {}
    public record Usage(String responseModel, String requestId, Integer inputTokens, Integer outputTokens, Integer totalTokens) {}
    public record Status(BigDecimal limitCny, BigDecimal reservedCny, BigDecimal remainingCny,
                         String blockedReason, long unresolvedCount) {}
    public enum ReviewReason {
        TRANSPORT_ERROR, HTTP_ERROR, INVALID_RESPONSE, UNKNOWN_USAGE,
        MODEL_MISMATCH, USAGE_OUT_OF_BOUNDS, INCONSISTENT_USAGE, INVALID_USAGE, AUDIT_WRITE_FAILED
    }

    public Reservation reserve(TextBudgetPolicy.Quote quote, Long userId) {
        if (userId == null || userId <= 0 || quote == null || quote.ceilingCny() == null
                || quote.ceilingCny().signum() <= 0 || quote.ceilingCny().scale() > 6) {
            throw new BusinessException(ResultCode.CONFIG_ERROR, "预算预留参数或用户归属无效");
        }
        return Objects.requireNonNull(independent.execute(transaction -> {
            int claimed = jdbc.update("""
                UPDATE generation_budget_accounts
                SET reserved_cny = reserved_cny + ?, updated_at = CURRENT_TIMESTAMP(3)
                WHERE id = 1 AND blocked_reason IS NULL AND reserved_cny + ? <= limit_cny
                """, quote.ceilingCny(), quote.ceilingCny());
            if (claimed != 1) {
                throw new BusinessException(ResultCode.CONFIG_ERROR, "生成预算不足或存在待核对调用，请联系管理员");
            }
            String id = UUID.randomUUID().toString();
            jdbc.update("""
                INSERT INTO generation_budget_reservations
                  (id,user_id,model_code,status,ceiling_cny,quote_revision,quote_verified_at,quote_reference,
                   expected_response_model,input_token_limit,output_token_limit,input_cny_per_million,output_cny_per_million)
                VALUES (?,?,?,'RESERVED',?,?,?,?,?,?,?,?,?)
                """, id, userId, quote.model(), quote.ceilingCny(), quote.revision(), quote.verifiedAt().toString(),
                    quote.reference(), quote.responseModel(), quote.maxInputTokens(), quote.maxOutputTokens(),
                    quote.inputRate(), quote.outputRate());
            return new Reservation(id, userId, quote);
        }));
    }

    public void complete(Reservation reservation, Usage usage) {
        saveOutcome(reservation, usage, reviewReason(reservation.quote(), usage));
    }

    public void recordReview(Reservation reservation, Usage usage, ReviewReason reason) {
        saveOutcome(reservation, usage, Objects.requireNonNull(reason));
    }

    private void saveOutcome(Reservation reservation, Usage usage, ReviewReason reason) {
        independent.executeWithoutResult(transaction -> {
            int changed = jdbc.update("""
                UPDATE generation_budget_reservations
                SET status=?, response_model=?, provider_request_id=?, input_tokens=?, output_tokens=?, total_tokens=?,
                    review_reason=?, finished_at=CURRENT_TIMESTAMP(3)
                WHERE id=? AND user_id=? AND status='RESERVED'
                """, reason == null ? "SUCCEEDED" : "REVIEW_REQUIRED",
                    bounded(usage.responseModel(), 128), bounded(usage.requestId(), 256),
                    usage.inputTokens(), usage.outputTokens(), usage.totalTokens(), reason == null ? null : reason.name(),
                    reservation.id(), reservation.userId());
            if (changed == 1 && reason != null) block(reason);
        });
    }

    public void requireReview(Reservation reservation, ReviewReason reason) {
        recordReview(reservation, new Usage(null, null, null, null, null), reason);
    }

    public Status status() {
        return jdbc.queryForObject("""
            SELECT limit_cny, reserved_cny, blocked_reason,
              (SELECT COUNT(*) FROM generation_budget_reservations WHERE status <> 'SUCCEEDED') AS unresolved
            FROM generation_budget_accounts WHERE id=1
            """, (row, index) -> new Status(row.getBigDecimal("limit_cny"), row.getBigDecimal("reserved_cny"),
                row.getBigDecimal("limit_cny").subtract(row.getBigDecimal("reserved_cny")),
                row.getString("blocked_reason"), row.getLong("unresolved")));
    }

    private void block(ReviewReason reason) {
        jdbc.update("""
            UPDATE generation_budget_accounts SET blocked_reason=COALESCE(blocked_reason, ?),
                updated_at=CURRENT_TIMESTAMP(3) WHERE id=1
            """, reason.name());
    }

    private ReviewReason reviewReason(TextBudgetPolicy.Quote quote, Usage usage) {
        if (!quote.responseModel().equals(usage.responseModel())) return ReviewReason.MODEL_MISMATCH;
        if (usage.inputTokens() == null || usage.outputTokens() == null) return ReviewReason.UNKNOWN_USAGE;
        if (usage.inputTokens() < 0 || usage.inputTokens() > quote.maxInputTokens()
                || usage.outputTokens() < 0 || usage.outputTokens() > quote.maxOutputTokens()) return ReviewReason.USAGE_OUT_OF_BOUNDS;
        if (usage.totalTokens() != null && (long) usage.inputTokens() + usage.outputTokens() != usage.totalTokens()) {
            return ReviewReason.INCONSISTENT_USAGE;
        }
        return null;
    }

    private String bounded(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max);
    }
}
