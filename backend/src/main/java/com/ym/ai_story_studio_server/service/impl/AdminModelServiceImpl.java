package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.admin.ModelUpsertRequest;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AiModelMapper;
import com.ym.ai_story_studio_server.service.AdminModelService;
import com.ym.ai_story_studio_server.provider.TextModelPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 后台模型配置服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminModelServiceImpl implements AdminModelService {

    private final AiModelMapper aiModelMapper;
    private final com.ym.ai_story_studio_server.provider.OfficialModelCatalog catalog;
    private final TextModelPolicy textModelPolicy;

    @Override
    public List<AiModel> listModels(String type) {
        catalog.refreshIfStale();
        LambdaQueryWrapper<AiModel> qw = new LambdaQueryWrapper<>();
        qw.eq(AiModel::getUpstreamPresent, 1);
        if (type != null && !type.isBlank()) {
            qw.eq(AiModel::getType, type);
        }
        qw.orderByAsc(AiModel::getType).orderByAsc(AiModel::getSortOrder).orderByAsc(AiModel::getId);
        return aiModelMapper.selectList(qw);
    }

    @Override
    public AiModel createModel(ModelUpsertRequest request) {
        throw new BusinessException(ResultCode.PARAM_INVALID,"模型只能从官方上游同步，不能手工新增");
    }

    @Override
    public AiModel updateModel(Long id, ModelUpsertRequest request) {
        AiModel model = aiModelMapper.selectById(id);
        if (model == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "模型不存在");
        }
        if (!java.util.Objects.equals(model.getCode(),request.code())
                || !java.util.Objects.equals(model.getProvider(),request.provider())
                || !java.util.Objects.equals(model.getType(),request.type()))
            throw new BusinessException(ResultCode.PARAM_INVALID,"上游模型标识和类型不可修改，请同步官方目录");
        model.setEnabled(request.enabled()==null?model.getEnabled():request.enabled());
        model.setSortOrder(request.sortOrder()==null?model.getSortOrder():request.sortOrder());
        if (Integer.valueOf(1).equals(model.getEnabled())) textModelPolicy.validateForEnable(model);
        saveSettings(model);
        return aiModelMapper.selectById(id);
    }

    @Override
    public AiModel toggleEnabled(Long id, boolean enabled) {
        AiModel model = aiModelMapper.selectById(id);
        if (model == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "模型不存在");
        }
        if (enabled) textModelPolicy.validateForEnable(model);
        model.setEnabled(enabled ? 1 : 0);
        saveSettings(model);
        return aiModelMapper.selectById(id);
    }

    private void saveSettings(AiModel model) {
        if(aiModelMapper.updateCatalogSettings(model.getId(),model.getCatalogRevision(),model.getEnabled(),model.getSortOrder())!=1)
            throw new BusinessException(ResultCode.CONFIG_ERROR,"上游目录已变化，请刷新后重试");
    }

    @Override
    public void deleteModel(Long id) {
        throw new BusinessException(ResultCode.PARAM_INVALID,"模型目录来自官方上游，请通过停用控制使用");
    }
}
