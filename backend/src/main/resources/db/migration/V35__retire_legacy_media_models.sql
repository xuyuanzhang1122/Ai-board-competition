-- Preserve model/history rows, assets, tasks, usage and wallet records.
-- Media adapters are unavailable until official capability and shared budget verification.
UPDATE ai_models SET enabled = 0 WHERE TRIM(UPPER(type)) IN ('IMAGE', 'VIDEO');
UPDATE pricing_rules SET enabled = 0 WHERE TRIM(UPPER(biz_type)) IN ('IMAGE_GENERATION', 'VIDEO_GENERATION');
-- Do not cancel upstream jobs, erase external IDs, refund costs or replay uncertain submissions.
