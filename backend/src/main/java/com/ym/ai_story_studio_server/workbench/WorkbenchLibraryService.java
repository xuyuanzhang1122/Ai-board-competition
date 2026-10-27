package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.util.AdminContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Shared reviewed reference library and immutable runtime prompt versions. */
@Service
public class WorkbenchLibraryService {
    public record Knowledge(long id, long revision, String title, String content, String sourceUrl,
            String sourceOrganization, String publishedOn, String collectedAt, String summary,
            String factType, String topics, String license, String status, String reviewNote,
            Long reviewedBy, String reviewedAt, String validUntil) {}
    public record KnowledgeEdit(long revision, String title, String content, String sourceUrl,
            String sourceOrganization, String publishedOn, String summary, String factType,
            String topics, String license, String validUntil) {}
    public record Review(long revision, String status, String reviewNote) {}
    public record Prompt(String stage, int version, String content, String variables, String capability,
            String status, String changeNote, Long authorId, String createdAt, int publishedVersion) {}
    public record PromptCreate(String stage, String content, String variables, String capability,
            String changeNote) {}
    public record PromptStatus(String status, int expectedPublishedVersion) {}

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ObjectMapper json = new ObjectMapper();

    private final RowMapper<Knowledge> knowledgeMapper = (r, n) -> new Knowledge(
            r.getLong("id"), r.getLong("revision"), r.getString("title"), r.getString("content"),
            r.getString("source_url"), r.getString("source_organization"), r.getString("published_on"),
            r.getString("collected_at"), r.getString("summary"), r.getString("fact_type"),
            r.getString("topics"), r.getString("license"), r.getString("status"), r.getString("review_note"),
            r.getObject("reviewed_by", Long.class), r.getString("reviewed_at"), r.getString("valid_until"));
    private final RowMapper<Prompt> promptMapper = (r, n) -> new Prompt(
            r.getString("stage"), r.getInt("version"), r.getString("content"), r.getString("variables"),
            r.getString("capability"), r.getString("status"), r.getString("change_note"),
            r.getObject("author_id", Long.class), r.getString("created_at"), r.getInt("published_version"));

    public WorkbenchLibraryService(JdbcTemplate db, TransactionTemplate tx) {
        this.db = db;
        this.tx = tx;
    }

    public List<Knowledge> knowledge(String query) {
        admin();
        return findKnowledge(query, false);
    }

    public List<Knowledge> approvedKnowledge(String query) {
        return findKnowledge(query, true);
    }

    private List<Knowledge> findKnowledge(String query, boolean approved) {
        String filter = approved
                ? " AND status='APPROVED' AND (fact_type<>'FACT' OR valid_until IS NULL OR valid_until>=CURRENT_DATE)"
                : "";
        queryPattern(query); // Validate the complete query before limiting its terms.
        String[] terms = value(query).trim().split("\\s+");
        var conditions = new java.util.ArrayList<String>();
        var arguments = new java.util.ArrayList<Object>();
        for (String term : java.util.Arrays.stream(terms).limit(8).toList()) {
            String like = queryPattern(term);
            conditions.add("(title LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!' OR topics LIKE ? ESCAPE '!')");
            arguments.add(like); arguments.add(like); arguments.add(like);
        }
        return db.query("SELECT * FROM workbench_knowledge WHERE (" + String.join(" OR ", conditions) + ")"
                + filter + " ORDER BY id DESC LIMIT 100", knowledgeMapper, arguments.toArray());
    }

    private Knowledge knowledge(long id, boolean lock) {
        var rows = db.query("SELECT * FROM workbench_knowledge WHERE id=?" + (lock ? " FOR UPDATE" : ""),
                knowledgeMapper, id);
        if (rows.isEmpty()) throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        return rows.get(0);
    }

    public Knowledge createKnowledge(KnowledgeEdit request) {
        long actor = admin();
        validateKnowledge(request);
        return tx.execute(transaction -> {
            var keys = new GeneratedKeyHolder();
            db.update(connection -> {
                var statement = connection.prepareStatement("""
                        INSERT INTO workbench_knowledge(title,content,source_url,source_organization,
                            published_on,summary,fact_type,topics,license,valid_until)
                        VALUES(?,?,?,?,?,?,?,?,?,?)
                        """, new String[]{"id"});
                Object[] values = {request.title(), request.content(), value(request.sourceUrl()),
                        value(request.sourceOrganization()), nullableDate(request.publishedOn()),
                        value(request.summary()), request.factType(), value(request.topics()),
                        value(request.license()), nullableDate(request.validUntil())};
                for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
                return statement;
            }, keys);
            Knowledge saved = knowledge(Objects.requireNonNull(keys.getKey()).longValue(), false);
            history(saved, actor);
            return saved;
        });
    }

    public Knowledge updateKnowledge(long id, KnowledgeEdit request) {
        long actor = admin();
        validateKnowledge(request);
        return tx.execute(transaction -> {
            Knowledge old = knowledge(id, true);
            require(old.revision() == request.revision(), "资料版本已变化，请保留修改后刷新");
            // Any edit requires a fresh review, including metadata and authorization edits.
            db.update("""
                    UPDATE workbench_knowledge SET revision=revision+1,title=?,content=?,source_url=?,
                        source_organization=?,published_on=?,summary=?,fact_type=?,topics=?,license=?,
                        valid_until=?,status='DRAFT',review_note=NULL,reviewed_by=NULL,reviewed_at=NULL
                    WHERE id=?
                    """, request.title(), request.content(), value(request.sourceUrl()),
                    value(request.sourceOrganization()), nullableDate(request.publishedOn()),
                    value(request.summary()), request.factType(), value(request.topics()),
                    value(request.license()), nullableDate(request.validUntil()), id);
            Knowledge saved = knowledge(id, false);
            history(saved, actor);
            return saved;
        });
    }

    public Knowledge reviewKnowledge(long id, Review request) {
        long actor = admin();
        require(request != null, "审核不能为空");
        require(Set.of("APPROVED", "REJECTED").contains(value(request.status())), "审核状态无效");
        bounded(request.reviewNote(), 4000, "审核说明", true);
        return tx.execute(transaction -> {
            Knowledge old = knowledge(id, true);
            require(old.revision() == request.revision(), "资料版本已变化，请重新审核");
            db.update("""
                    UPDATE workbench_knowledge SET revision=revision+1,status=?,review_note=?,
                        reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?
                    """, request.status(), request.reviewNote(), actor, id);
            Knowledge saved = knowledge(id, false);
            history(saved, actor);
            return saved;
        });
    }

    private void history(Knowledge knowledge, long actor) {
        try {
            db.update("""
                    INSERT INTO workbench_knowledge_history(knowledge_id,revision,snapshot_json,actor_id)
                    VALUES(?,?,?,?)
                    """, knowledge.id(), knowledge.revision(), json.writeValueAsString(knowledge), actor);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("资料版本保存失败", e);
        }
    }

    public List<Prompt> prompts() {
        admin();
        return db.query("""
                SELECT p.*,s.published_version FROM workbench_prompts p
                JOIN workbench_prompt_stages s ON s.stage=p.stage ORDER BY p.stage,p.version DESC
                """, promptMapper);
    }

    /** Resolve exactly the active version; a disabled stage never falls back to old content. */
    public Prompt published(String stage) {
        Prompt prompt = publishedOrNull(stage);
        if (prompt == null) throw new BusinessException(ResultCode.CONFIG_ERROR, "提示词尚未发布或已禁用：" + stage);
        return prompt;
    }

    /** Legacy picker reads omit unpublished system presets, never their mutable historical bodies. */
    public Prompt publishedOrNull(String stage) {
        var rows = db.query("""
                SELECT p.*,s.published_version FROM workbench_prompts p
                JOIN workbench_prompt_stages s ON s.stage=p.stage AND s.published_version=p.version
                WHERE p.stage=? AND p.status='PUBLISHED'
                """, promptMapper, stage);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Prompt createPrompt(PromptCreate request) {
        long actor = admin();
        require(request != null, "提示词不能为空");
        require(request.stage() != null && request.stage().matches("[A-Z][A-Z0-9_]{0,63}"), "阶段无效");
        bounded(request.content(), 40000, "提示词", true);
        bounded(request.variables(), 1000, "变量", false);
        bounded(request.capability(), 100, "能力", true);
        bounded(request.changeNote(), 4000, "变更说明", true);
        require(capability(request.stage()).equals(request.capability()), "阶段不支持此能力");
        validateVariables(request.stage(), request.variables());
        validatePlaceholders(request.content(), request.variables());
        return tx.execute(transaction -> {
            var stages = db.queryForList("SELECT * FROM workbench_prompt_stages WHERE stage=? FOR UPDATE",
                    request.stage());
            require(!stages.isEmpty(), "阶段无效");
            int version = ((Number) stages.get(0).get("next_version")).intValue();
            db.update("UPDATE workbench_prompt_stages SET next_version=next_version+1 WHERE stage=?", request.stage());
            db.update("""
                    INSERT INTO workbench_prompts(stage,version,content,variables,capability,change_note,author_id)
                    VALUES(?,?,?,?,?,?,?)
                    """, request.stage(), version, request.content(), value(request.variables()),
                    request.capability(), request.changeNote(), actor);
            return prompt(request.stage(), version);
        });
    }

    public Prompt changePromptStatus(String stage, int version, PromptStatus request) {
        admin();
        require(request != null && Set.of("PUBLISHED", "DISABLED").contains(value(request.status())), "提示词状态无效");
        return tx.execute(transaction -> {
            // Serialize both version allocation and publication by stage, including the first publication.
            var stages = db.queryForList("SELECT * FROM workbench_prompt_stages WHERE stage=? FOR UPDATE", stage);
            require(!stages.isEmpty(), "阶段无效");
            int current = ((Number) stages.get(0).get("published_version")).intValue();
            require(current == request.expectedPublishedVersion(), "发布版本已变化，请刷新后重试");
            Prompt target = prompt(stage, version);
            if ("PUBLISHED".equals(request.status())) {
                require(!"DISABLED".equals(target.status()), "已禁用版本不能再次发布，请新建版本");
                if (current != version) {
                    db.update("UPDATE workbench_prompts SET status='DISABLED' WHERE stage=? AND status='PUBLISHED'", stage);
                    db.update("UPDATE workbench_prompts SET status='PUBLISHED' WHERE stage=? AND version=?", stage, version);
                    db.update("UPDATE workbench_prompt_stages SET published_version=? WHERE stage=?", version, stage);
                }
            } else {
                db.update("UPDATE workbench_prompts SET status='DISABLED' WHERE stage=? AND version=?", stage, version);
                if (current == version) db.update("UPDATE workbench_prompt_stages SET published_version=0 WHERE stage=?", stage);
            }
            return prompt(stage, version);
        });
    }

    private Prompt prompt(String stage, int version) {
        var rows = db.query("""
                SELECT p.*,s.published_version FROM workbench_prompts p
                JOIN workbench_prompt_stages s ON s.stage=p.stage WHERE p.stage=? AND p.version=?
                """, promptMapper, stage, version);
        if (rows.isEmpty()) throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        return rows.get(0);
    }

    private void validateKnowledge(KnowledgeEdit request) {
        require(request != null, "资料不能为空");
        bounded(request.title(), 200, "标题", true);
        bounded(request.content(), 40000, "内容", true);
        bounded(request.sourceUrl(), 2000, "来源URL", false);
        bounded(request.sourceOrganization(), 200, "来源机构", false);
        bounded(request.summary(), 4000, "摘要", false);
        bounded(request.topics(), 1000, "主题", false);
        bounded(request.license(), 4000, "授权", false);
        require(Set.of("FACT", "LEGEND", "FICTION").contains(value(request.factType())), "事实类型无效");
        date(request.publishedOn());
        date(request.validUntil());
    }

    private void validateVariables(String stage, String variables) {
        Set<String> allowed = switch (stage) {
            case "SCRIPT", "STORYBOARD" -> Set.of("brief", "confirmedScript");
            case "STORYBOARD_PARTIAL" -> Set.of("brief", "confirmedScript", "storyboard", "shotIds", "lockedShotIds", "instruction");
            case "BRAINSTORM" -> Set.of("brief", "sources", "evidence");
            case "SHOT_PARSE", "SHOT_PARSE_ASSETS", "SHOT_PARSE_SEGMENTS" -> Set.of("rawText");
            case "ASSET_CHARACTER_DESCRIPTION", "ASSET_SCENE_DESCRIPTION", "ASSET_PROP_DESCRIPTION" -> Set.of("assetName", "sourceText");
            case "SHOT_IMAGE" -> Set.of("scriptText");
            case "CHARACTER_IMAGE", "SCENE_IMAGE", "PROP_IMAGE" -> Set.of("assetName", "description");
            case "SHOT_VIDEO" -> Set.of("scriptText");
            case "VIDEO_REFERENCES" -> Set.of("references");
            case "MEDIA_STYLE_3DGC", "MEDIA_STYLE_REALISTIC" -> Set.of();
            default -> Set.of();
        };
        for (String variable : value(variables).split(",")) {
            require(variable.isBlank() || allowed.contains(variable.trim()), "阶段不支持此变量：" + variable);
        }
    }

    static String capability(String stage) {
        if (Set.of("SHOT_IMAGE", "CHARACTER_IMAGE", "SCENE_IMAGE", "PROP_IMAGE").contains(stage)) return "IMAGE";
        if (Set.of("SHOT_VIDEO", "VIDEO_REFERENCES").contains(stage)) return "VIDEO";
        if (stage.startsWith("MEDIA_STYLE_") || stage.startsWith("STYLE_PRESET_")) return "MEDIA";
        return "TEXT";
    }

    private void validatePlaceholders(String content, String variables) {
        var declared = new java.util.HashSet<>(java.util.Arrays.asList(value(variables).split(",")));
        var matcher = java.util.regex.Pattern.compile("\\{\\{([A-Za-z][A-Za-z0-9_]*)\\}\\}").matcher(content);
        while (matcher.find()) require(declared.stream().anyMatch(v -> v.trim().equals(matcher.group(1))), "模板含未声明变量：" + matcher.group(1));
    }

    private long admin() {
        Long id = AdminContext.getAdminId();
        if (id == null) throw new BusinessException(ResultCode.ACCESS_DENIED);
        return id;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new BusinessException(ResultCode.PARAM_INVALID, message);
    }

    private static String value(String string) { return string == null ? "" : string; }
    private static String nullableDate(String string) { return string == null || string.isBlank() ? null : string; }

    private static void bounded(String string, int max, String label, boolean required) {
        require(!required || string != null && !string.isBlank(), label + "不能为空");
        require(string == null || string.length() <= max, label + "过长");
    }

    private static String queryPattern(String query) {
        query = value(query).trim();
        bounded(query, 200, "查询", false);
        return "%" + query.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private static void date(String string) {
        if (string == null || string.isBlank()) return;
        try {
            LocalDate.parse(string);
        } catch (Exception e) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "日期格式无效");
        }
    }
}
