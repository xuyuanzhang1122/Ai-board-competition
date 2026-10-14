package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Database flags cannot override supported text models, suppliers or configured availability. */
@Component
@RequiredArgsConstructor
public class TextModelPolicy {
    private final TextGenerationProvider provider;

    public void validateForEnable(AiModel model) {
        if (model.getType() == null || !"LANGUAGE".equalsIgnoreCase(model.getType().trim())) return;
        var definition = TextModelRegistry.require(model.getCode());
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
