package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.dto.admin.ModelUpsertRequest;
import com.ym.ai_story_studio_server.entity.AiModel;

import java.util.List;

/**
 * 后台模型配置服务
 */
public interface AdminModelService {

    /**
     * 列出所有模型（可按类型过滤），含未启用项，按 type + sortOrder 排序
     */
    List<AiModel> listModels(String type);

    /**
     * 新增模型
     */
    AiModel createModel(ModelUpsertRequest request);

    /**
     * 编辑模型
     */
    AiModel updateModel(Long id, ModelUpsertRequest request);

    /**
     * 启停模型
     */
    AiModel toggleEnabled(Long id, boolean enabled);

    /**
     * 删除模型
     */
    void deleteModel(Long id);
}
