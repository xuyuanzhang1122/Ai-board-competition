package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;

import java.util.Map;

/** Catalog code, upstream API ID and supplier identity are distinct fields. */
public final class TextModelRegistry {
    private TextModelRegistry() {}

    public record Definition(String code, String apiModelId, String provider) {}

    private static final Map<String, Definition> MODELS = Map.of(
            "deepseek-flash", new Definition("deepseek-flash", "deepseek-flash", "DeepSeek"),
            "deepseek-v4-pro", new Definition("deepseek-v4-pro", "deepseek-v4-pro", "DeepSeek"),
            "mimo-v2.6-pro", new Definition("mimo-v2.6-pro", "mimo-v2.6-pro", "MiMo"));

    public static Definition require(String code) {
        Definition definition = code == null ? null : MODELS.get(code);
        if (definition == null) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "文本模型已停用或不受支持，请重新选择");
        }
        return definition;
    }
}
