package com.ym.ai_story_studio_server.provider;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AiModelMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Enforce the catalog flag on execution, including direct calls outside the job service. */
@Component
@RequiredArgsConstructor
public class TextModelAccess {
    private final AiModelMapper mapper;

    public void requireEnabled(String code) {
        var definition = TextModelRegistry.require(code);
        AiModel row = mapper.selectOne(new LambdaQueryWrapper<AiModel>().eq(AiModel::getCode, code));
        if (row == null || !code.equals(row.getCode()) || !Integer.valueOf(1).equals(row.getEnabled())
                || row.getType() == null || !"LANGUAGE".equalsIgnoreCase(row.getType().trim())
                || row.getProvider() == null || !definition.provider().equalsIgnoreCase(row.getProvider().trim())) {
            throw new BusinessException(ResultCode.CONFIG_ERROR, "所选文本模型未启用或目录配置不匹配");
        }
    }
}
