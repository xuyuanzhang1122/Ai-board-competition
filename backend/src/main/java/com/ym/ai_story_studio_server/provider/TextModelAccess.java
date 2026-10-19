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
    private final OfficialModelCatalog catalog;

    public TextModelRegistry.Definition definition(String code) {
        catalog.refreshIfStale();
        AiModel row=mapper.selectOne(new LambdaQueryWrapper<AiModel>().eq(AiModel::getCode,code));
        if(row==null || !java.util.Objects.equals(code,row.getCode()))
            throw new BusinessException(ResultCode.CONFIG_ERROR,"模型不在当前上游目录中");
        return TextModelRegistry.require(row);
    }

    public void requireEnabled(String code) {
        definition(code);
        AiModel row=mapper.selectOne(new LambdaQueryWrapper<AiModel>().eq(AiModel::getCode,code));
        if(row==null || !Integer.valueOf(1).equals(row.getEnabled()))
            throw new BusinessException(ResultCode.CONFIG_ERROR,"所选文本模型未启用");
    }
}
