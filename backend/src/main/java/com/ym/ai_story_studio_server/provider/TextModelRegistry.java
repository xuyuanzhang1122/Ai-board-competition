package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;

/** Identity derives from an upstream-synced row, never a hardcoded model-id whitelist. */
public final class TextModelRegistry {
    private TextModelRegistry() {}
    public record Definition(String code,String apiModelId,String provider) {}
    public static Definition require(AiModel row) {
        boolean official=row!=null && Integer.valueOf(1).equals(row.getUpstreamPresent())
            && ("DeepSeek".equals(row.getProvider()) && "https://api.deepseek.com/models".equals(row.getSourceUrl())
                || "MiMo".equals(row.getProvider()) && java.util.Set.of("https://api.xiaomimimo.com/v1/models","https://token-plan-cn.xiaomimimo.com/v1/models").contains(row.getSourceUrl()==null?"":row.getSourceUrl()));
        if(!official || !"LANGUAGE".equals(row.getType()) || row.getCode()==null || row.getCode().isBlank())
            throw new BusinessException(ResultCode.PARAM_INVALID,"所选模型不在当前官方文本目录中，请刷新目录");
        return new Definition(row.getCode(),row.getCode(),row.getProvider());
    }
}
