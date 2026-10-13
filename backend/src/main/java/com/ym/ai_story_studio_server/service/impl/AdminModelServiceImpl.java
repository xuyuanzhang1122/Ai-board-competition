package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.admin.ModelUpsertRequest;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AiModelMapper;
import com.ym.ai_story_studio_server.service.AdminModelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 后台模型配置服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminModelServiceImpl implements AdminModelService {

    private final AiModelMapper aiModelMapper;

    @Override
    public List<AiModel> listModels(String type) {
        LambdaQueryWrapper<AiModel> qw = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(type)) {
            qw.eq(AiModel::getType, type);
        }
        qw.orderByAsc(AiModel::getType).orderByAsc(AiModel::getSortOrder).orderByAsc(AiModel::getId);
        return aiModelMapper.selectList(qw);
    }

    @Override
    public AiModel createModel(ModelUpsertRequest request) {
        assertCodeAvailable(request.code(), null);
        AiModel model = new AiModel();
        apply(model, request);
        aiModelMapper.insert(model);
        log.info("管理员新增模型: code={}", request.code());
        return aiModelMapper.selectById(model.getId());
    }

    @Override
    public AiModel updateModel(Long id, ModelUpsertRequest request) {
        AiModel model = aiModelMapper.selectById(id);
        if (model == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "模型不存在");
        }
        assertCodeAvailable(request.code(), id);
        apply(model, request);
        aiModelMapper.updateById(model);
        return aiModelMapper.selectById(id);
    }

    @Override
    public AiModel toggleEnabled(Long id, boolean enabled) {
        AiModel model = aiModelMapper.selectById(id);
        if (model == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "模型不存在");
        }
        model.setEnabled(enabled ? 1 : 0);
        aiModelMapper.updateById(model);
        return aiModelMapper.selectById(id);
    }

    @Override
    public void deleteModel(Long id) {
        AiModel model = aiModelMapper.selectById(id);
        if (model == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "模型不存在");
        }
        aiModelMapper.deleteById(id);
        log.info("管理员删除模型: id={}, code={}", id, model.getCode());
    }

    private void apply(AiModel model, ModelUpsertRequest request) {
        model.setCode(request.code());
        model.setName(request.name());
        model.setType(request.type());
        model.setProvider(request.provider());
        model.setEnabled(request.enabled() != null ? request.enabled() : 1);
        model.setSortOrder(request.sortOrder() != null ? request.sortOrder() : 0);
        model.setDescription(request.description());
    }

    private void assertCodeAvailable(String code, Long excludeId) {
        LambdaQueryWrapper<AiModel> qw = new LambdaQueryWrapper<AiModel>().eq(AiModel::getCode, code);
        if (excludeId != null) {
            qw.ne(AiModel::getId, excludeId);
        }
        Long c = aiModelMapper.selectCount(qw);
        if (c != null && c > 0) {
            throw new BusinessException(ResultCode.DUPLICATE_RESOURCE, "模型编码已存在");
        }
    }
}
