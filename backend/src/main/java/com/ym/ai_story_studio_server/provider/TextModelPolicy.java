package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Only verified text adapters are currently eligible; database flags cannot open unimplemented media. */
@Component
@RequiredArgsConstructor
public class TextModelPolicy {
    private final TextGenerationProvider provider;

    public void validateForEnable(AiModel model) {
        if (model.getType() == null || !"LANGUAGE".equalsIgnoreCase(model.getType().trim())) {
            throw new BusinessException(ResultCode.CONFIG_ERROR,
                    "图片/视频新供应商尚未完成接入与预算核验，不能启用");
        }
        var definition = TextModelRegistry.require(model);
        if (model.getProvider() == null || !definition.provider().equalsIgnoreCase(model.getProvider().trim())) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "文本模型与供应商不匹配");
        }
        provider.validateModelConfiguration(model.getCode());
    }

    public boolean isAvailable(AiModel model) {
        if (!Integer.valueOf(1).equals(model.getEnabled())) return false;
        try {
            validateForEnable(model);
            return true;
        } catch (BusinessException e) {
            return false;
        }
    }
}
