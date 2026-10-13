package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.config.StorageProperties;
import com.ym.ai_story_studio_server.entity.Asset;
import com.ym.ai_story_studio_server.entity.AssetVersion;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.AssetVersionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 资产创建服务
 * 
 * <p>专门负责AI生成资产的创建逻辑
 * 
 * @author AI Story Studio
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AssetCreationService {

    private final AssetMapper assetMapper;
    private final AssetVersionMapper assetVersionMapper;
    private final StorageProperties storageProperties;

    public String findResultUrlBySourceTaskId(String sourceTaskId) {
        if (sourceTaskId == null || sourceTaskId.isBlank()) {
            return null;
        }
        AssetVersion existing = assetVersionMapper.selectOne(
                new LambdaQueryWrapper<AssetVersion>()
                        .eq(AssetVersion::getSourceTaskId, sourceTaskId)
                        .last("LIMIT 1")
        );
        return existing == null ? null : existing.getUrl();
    }

    /**
     * 创建资产并保存第一个版本
     * 
     * @param projectId 项目ID
     * @param ownerType 归属对象类型 (如: SHOT, PCHAR, PSCENE, LIB_CHAR, LIB_SCENE)
     * @param ownerId 归属对象ID
     * @param assetType 资产类型 (如: SHOT_IMG, VIDEO)
     * @param ossUrl 当前存储服务返回的URL
     * @param prompt 生成提示词
     * @param model AI模型
     * @param aspectRatio 画幅比例
     * @param userId 创建用户ID
     * @return 创建的Asset对象
     */
    @Transactional(rollbackFor = Exception.class)
    public Asset createAssetWithVersion(
            Long projectId,
            String ownerType,
            Long ownerId,
            String assetType,
            String ossUrl,
            String prompt,
            String model,
            String aspectRatio,
            Long userId
    ) {
        return createAssetWithVersion(
                projectId, ownerType, ownerId, assetType, ossUrl,
                prompt, model, aspectRatio, userId, null
        );
    }

    /**
     * 带上游任务幂等键的资产创建。RabbitMQ 重投时，若该 taskId 已落资产，
     * 直接返回原资产，不再创建重复版本。
     */
    @Transactional(rollbackFor = Exception.class)
    public Asset createAssetWithVersion(
            Long projectId,
            String ownerType,
            Long ownerId,
            String assetType,
            String ossUrl,
            String prompt,
            String model,
            String aspectRatio,
            Long userId,
            String sourceTaskId
    ) {
        if (sourceTaskId != null && !sourceTaskId.isBlank()) {
            AssetVersion existingVersion = assetVersionMapper.selectOne(
                    new LambdaQueryWrapper<AssetVersion>()
                            .eq(AssetVersion::getSourceTaskId, sourceTaskId)
                            .last("LIMIT 1")
            );
            if (existingVersion != null) {
                log.info("资产幂等命中 - sourceTaskId: {}, assetId: {}",
                        sourceTaskId, existingVersion.getAssetId());
                return assetMapper.selectById(existingVersion.getAssetId());
            }
        }

        log.debug("创建资产 - ownerType: {}, ownerId: {}, assetType: {}", ownerType, ownerId, assetType);

        // 1. 创建Asset主记录
        Asset asset = new Asset();
        asset.setProjectId(projectId);
        asset.setOwnerType(ownerType);
        asset.setOwnerId(ownerId);
        asset.setAssetType(assetType);
        assetMapper.insert(asset);

        log.info("Asset创建成功 - assetId: {}, ownerType: {}, ownerId: {}", asset.getId(), ownerType, ownerId);

        // 2. 创建第一个版本
        AssetVersion version = new AssetVersion();
        version.setAssetId(asset.getId());
        version.setVersionNo(1);
        version.setSource("AI");
        version.setProvider(getStorageProvider());
        version.setUrl(ossUrl);
        version.setPrompt(prompt);
        version.setSourceTaskId(sourceTaskId);
        version.setStatus("READY");
        version.setCreatedBy(userId);

        // 3. 保存生成参数JSON
        if (model != null || aspectRatio != null) {
            String paramsJson = buildParamsJson(model, aspectRatio);
            version.setParamsJson(paramsJson);
        }

        assetVersionMapper.insert(version);

        log.info("AssetVersion创建成功 - versionId: {}, assetId: {}, url: {}", 
                version.getId(), asset.getId(), ossUrl);

        return asset;
    }

    /**
     * 构建参数JSON字符串
     */
    private String buildParamsJson(String model, String aspectRatio) {
        StringBuilder json = new StringBuilder("{");
        if (model != null) {
            json.append("\"model\":\"").append(model).append("\"");
        }
        if (aspectRatio != null) {
            if (model != null) {
                json.append(",");
            }
            json.append("\"aspectRatio\":\"").append(aspectRatio).append("\"");
        }
        json.append("}");
        return json.toString();
    }

    private String getStorageProvider() {
        String provider = storageProperties.getProvider();
        return provider == null || provider.isBlank() ? "LOCAL" : provider.toUpperCase();
    }
}
