package com.ym.ai_story_studio_server.controller;

import com.ym.ai_story_studio_server.common.Result;
import com.ym.ai_story_studio_server.dto.admin.ModelUpsertRequest;
import com.ym.ai_story_studio_server.entity.AiModel;
import com.ym.ai_story_studio_server.service.AdminModelService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 后台模型配置控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/models")
@RequiredArgsConstructor
public class AdminModelController {

    private final AdminModelService adminModelService;

    /**
     * 模型列表（含未启用），可按 type 过滤
     */
    @GetMapping
    public Result<List<AiModel>> list(@RequestParam(required = false) String type) {
        return Result.success(adminModelService.listModels(type));
    }

    /**
     * 新增模型
     */
    @PostMapping
    public Result<AiModel> create(@Valid @RequestBody ModelUpsertRequest request) {
        return Result.success(adminModelService.createModel(request));
    }

    /**
     * 编辑模型
     */
    @PutMapping("/{id}")
    public Result<AiModel> update(@PathVariable Long id, @Valid @RequestBody ModelUpsertRequest request) {
        return Result.success(adminModelService.updateModel(id, request));
    }

    /**
     * 启停模型
     */
    @PatchMapping("/{id}/enabled")
    public Result<AiModel> toggle(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        return Result.success(adminModelService.toggleEnabled(id, enabled));
    }

    /**
     * 删除模型
     */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        adminModelService.deleteModel(id);
        return Result.success();
    }
}
