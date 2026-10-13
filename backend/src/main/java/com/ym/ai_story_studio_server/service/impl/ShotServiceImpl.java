package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.provider.TextGenerationProvider;
import com.ym.ai_story_studio_server.provider.TextGenerationResult;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.dto.ai.AiParseScriptResult;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.shot.*;
import com.ym.ai_story_studio_server.entity.*;
import com.ym.ai_story_studio_server.mapper.*;
import com.ym.ai_story_studio_server.service.ShotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 分镜服务实现类
 *
 * <p>实现分镜的CRUD、排序、绑定管理等业务逻辑
 *
 * {{CODE-Cycle-Integration:
 *   Task_ID: [#Backend-Fix-ShotNo-Duplicate-TwoPhase]
 *   Timestamp: 2026-01-03T15:00:00+08:00
 *   Phase: [D-Develop]
 *   Context-Analysis: "Fixed duplicate key error in reorderAllActiveShots by implementing two-phase update strategy: Phase 1 - Set all shot_no to negative temp values (-shotId) to avoid conflicts with deleted records. Phase 2 - Set shot_no to final sequential values (1,2,3...). This ensures no unique constraint violations during reordering."
 *   Principle_Applied: "Advanced-Debugging-Protocol, Root-Cause-Analysis, Two-Phase-Commit-Pattern"
 * }}
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShotServiceImpl implements ShotService {

    private final StoryboardShotMapper shotMapper;
    private final ShotBindingMapper bindingMapper;
    private final ProjectMapper projectMapper;
    private final ProjectCharacterMapper projectCharacterMapper;
    private final ProjectSceneMapper projectSceneMapper;
    private final ProjectPropMapper projectPropMapper;
    private final PropLibraryMapper propLibraryMapper;
    private final CharacterLibraryMapper characterLibraryMapper;
    private final SceneLibraryMapper sceneLibraryMapper;
    private final AssetMapper assetMapper;
    private final AssetVersionMapper assetVersionMapper;
    private final TextGenerationProvider textProvider;
    private final AiProperties aiProperties;
    private final JobMapper jobMapper;
    private final JobItemMapper jobItemMapper;

    @Override
    public List<ShotVO> getShotList(Long userId, Long projectId) {
        return getShotList(userId, projectId, null);
    }

    @Override
    public List<ShotVO> getShotList(Long userId, Long projectId, List<Long> shotIdFilter) {
        long start = System.currentTimeMillis();

        // 1. 验证项目存在且属于当前用户
        validateProjectOwnership(userId, projectId);

        // 2. 查询项目下未删除的分镜(按shot_no升序)；可选按 shotIdFilter 收窄，用于定点刷新
        LambdaQueryWrapper<StoryboardShot> shotQuery = new LambdaQueryWrapper<StoryboardShot>()
                .eq(StoryboardShot::getProjectId, projectId)
                .isNull(StoryboardShot::getDeletedAt)
                .orderByAsc(StoryboardShot::getShotNo);
        if (shotIdFilter != null && !shotIdFilter.isEmpty()) {
            shotQuery.in(StoryboardShot::getId, shotIdFilter);
        }
        List<StoryboardShot> shots = shotMapper.selectList(shotQuery);
        if (shots.isEmpty()) {
            return new ArrayList<>();
        }

        // 3. 批量查询绑定关系并按 shotId 分组
        List<Long> shotIds = shots.stream()
                .map(StoryboardShot::getId)
                .collect(Collectors.toList());
        List<ShotBinding> bindings = bindingMapper.selectList(
                new LambdaQueryWrapper<ShotBinding>().in(ShotBinding::getShotId, shotIds));
        Map<Long, List<ShotBinding>> bindingMap = bindings.stream()
                .collect(Collectors.groupingBy(ShotBinding::getShotId));

        // 4. 生成中/失败状态从 jobs/job_items 落库状态读取（刷新页面也能恢复）
        Set<Long> generatingImageShotIds = findGeneratingShotImageIds(projectId, shotIds);
        Set<Long> generatingVideoShotIds = findVideoShotIds(projectId, shotIds, true);
        Set<Long> failedVideoShotIds = findVideoShotIds(projectId, shotIds, false);

        // 5. 批量装配 VO（内部不再逐 shot/逐绑定访问数据库）
        List<ShotVO> voList = assembleShotVOs(
                shots, bindingMap, generatingImageShotIds, generatingVideoShotIds, failedVideoShotIds);

        log.info("分镜列表: projectId={}, shots={}, bindings={}, 耗时={}ms",
                projectId, shots.size(), bindings.size(), System.currentTimeMillis() - start);
        return voList;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ShotVO createShot(Long userId, Long projectId, CreateShotRequest request) {
        log.info("创建分镜: userId={}, projectId={}, scriptText={}", userId, projectId, request.scriptText());

        // 1. 验证项目存在且属于当前用户
        Project project = validateProjectOwnership(userId, projectId);

        // 2. 获取当前项目最大的shot_no值 (包括已删除的记录,防止唯一约束冲突)
        LambdaQueryWrapper<StoryboardShot> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(StoryboardShot::getProjectId, projectId)
                .orderByDesc(StoryboardShot::getShotNo)
                .last("LIMIT 1");

        StoryboardShot maxShot = shotMapper.selectOne(queryWrapper);
        Integer tempShotNo = (maxShot == null) ? 1 : maxShot.getShotNo() + 1;

        log.info("分配临时分镜序号: {} (避免唯一约束冲突)", tempShotNo);

        // 3. 创建分镜实体
        StoryboardShot shot = new StoryboardShot();
        shot.setProjectId(projectId);
        shot.setShotNo(tempShotNo);
        shot.setScriptText(request.scriptText());

        // 4. 保存到数据库
        int result = shotMapper.insert(shot);
        if (result <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "分镜创建失败");
        }

        log.info("分镜创建成功: shotId={}, tempShotNo={}", shot.getId(), shot.getShotNo());

        // 5. 重新整理所有未删除分镜的序号,确保连续性 (1,2,3...)
        reorderAllActiveShots(projectId);

        // 6. 重新查询分镜(获取重排后的正确 shot_no)
        StoryboardShot refreshedShot = shotMapper.selectById(shot.getId());

        log.info("分镜序号已重排: shotId={}, finalShotNo={}", refreshedShot.getId(), refreshedShot.getShotNo());

        // 7. 返回ShotVO(无绑定关系,资产状态为空)
        return new ShotVO(
                refreshedShot.getId(),
                refreshedShot.getShotNo(),
                refreshedShot.getScriptText(),
                new ArrayList<>(),
                null,
                new ArrayList<>(),
                createEmptyAssetStatus(),
                createEmptyAssetStatus(),
                refreshedShot.getCreatedAt(),
                refreshedShot.getUpdatedAt()
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateShot(Long userId, Long projectId, Long shotId, UpdateShotRequest request) {
        log.info("更新分镜: userId={}, projectId={}, shotId={}, newScriptText={}",
                userId, projectId, shotId, request.scriptText());

        // 1. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 2. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 3. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 4. 更新剧本文本
        shot.setScriptText(request.scriptText());
        int result = shotMapper.updateById(shot);

        if (result <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "分镜更新失败");
        }

        log.info("分镜更新成功: shotId={}", shotId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteShot(Long userId, Long projectId, Long shotId) {
        log.info("删除分镜: userId={}, projectId={}, shotId={}", userId, projectId, shotId);

        // 1. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 2. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 3. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 4. 软删除分镜
        shot.setDeletedAt(LocalDateTime.now());
        int result = shotMapper.updateById(shot);

        if (result <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "分镜删除失败");
        }

        // 5. 删除相关绑定记录(物理删除)
        LambdaQueryWrapper<ShotBinding> bindingWrapper = new LambdaQueryWrapper<>();
        bindingWrapper.eq(ShotBinding::getShotId, shotId);
        int bindingResult = bindingMapper.delete(bindingWrapper);

        log.info("分镜删除成功: shotId={}, 删除了{}条绑定记录", shotId, bindingResult);

        // 6. 重新整理所有未删除分镜的序号,确保连续性 (1,2,3...)
        reorderAllActiveShots(projectId);
        log.info("分镜序号已重排,删除后保持连续性");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void reorderShots(Long userId, Long projectId, ReorderShotsRequest request) {
        log.info("调整分镜顺序: userId={}, projectId={}, shotIds={}",
                userId, projectId, request.shotIds());

        // 1. 验证项目存在且属于当前用户
        validateProjectOwnership(userId, projectId);

        List<Long> shotIds = request.shotIds();
        if (shotIds.isEmpty()) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "分镜ID列表不能为空");
        }

        // 2. 批量查询所有待调整的分镜
        List<StoryboardShot> shots = shotMapper.selectBatchIds(shotIds);

        // 3. 验证所有分镜都存在且未删除
        if (shots.size() != shotIds.size()) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "部分分镜不存在");
        }

        // 4. 验证所有分镜都属于该项目
        boolean allBelongToProject = shots.stream()
                .allMatch(shot -> shot.getProjectId().equals(projectId) && shot.getDeletedAt() == null);

        if (!allBelongToProject) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "部分分镜不属于该项目");
        }

        // 5. 采用两阶段更新策略避免唯一键冲突
        Map<Long, StoryboardShot> shotMap = shots.stream()
                .collect(Collectors.toMap(StoryboardShot::getId, shot -> shot));

        // 计算安全的临时序号基数（避免与现有序号冲突）
        int maxShotNo = shots.stream()
                .mapToInt(StoryboardShot::getShotNo)
                .max()
                .orElse(0);
        int tempBase = maxShotNo + 1000;

        // 第一阶段：将所有shotNo设置为临时值
        for (int i = 0; i < shotIds.size(); i++) {
            Long shotId = shotIds.get(i);
            StoryboardShot shot = shotMap.get(shotId);
            shot.setShotNo(tempBase + i);
            shotMapper.updateById(shot);
        }

        // 第二阶段：将所有shotNo设置为目标值
        for (int i = 0; i < shotIds.size(); i++) {
            Long shotId = shotIds.get(i);
            StoryboardShot shot = shotMap.get(shotId);
            shot.setShotNo(i + 1);
            shotMapper.updateById(shot);
        }

        log.info("分镜顺序调整成功,共调整{}条分镜", shotIds.size());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void createBinding(Long userId, Long projectId, Long shotId, CreateBindingRequest request) {
        log.info("创建绑定关系: userId={}, projectId={}, shotId={}, bindType={}, bindId={}",
                userId, projectId, shotId, request.bindType(), request.bindId());

        // 1. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 2. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 3. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 4. 根据bindType验证绑定对象是否存在
        String bindType = request.bindType();
        Long bindId = request.bindId();

        if ("PCHAR".equals(bindType)) {
            // 验证项目角色是否存在
            ProjectCharacter character = projectCharacterMapper.selectById(bindId);
            if (character == null ) {
                throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "项目角色不存在");
            }
            if (!character.getProjectId().equals(projectId)) {
                throw new BusinessException(ResultCode.ACCESS_DENIED, "该角色不属于该项目");
            }
        } else if ("PSCENE".equals(bindType)) {
            // 验证项目场景是否存在
            ProjectScene scene = projectSceneMapper.selectById(bindId);
            if (scene == null ) {
                throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "项目场景不存在");
            }
            if (!scene.getProjectId().equals(projectId)) {
                throw new BusinessException(ResultCode.ACCESS_DENIED, "该项目场景不属于该项目");
            }
        } else if ("PPROP".equals(bindType)) {
            // 验证项目道具是否存在
            ProjectProp prop = projectPropMapper.selectById(bindId);
            if (prop == null) {
                throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "项目道具不存在");
            }
            if (!prop.getProjectId().equals(projectId)) {
                throw new BusinessException(ResultCode.ACCESS_DENIED, "该道具不属于该项目");
            }
        }

        // 5. 检查是否已存在相同的绑定(防止重复)
        LambdaQueryWrapper<ShotBinding> checkWrapper = new LambdaQueryWrapper<>();
        checkWrapper.eq(ShotBinding::getShotId, shotId)
                .eq(ShotBinding::getBindType, bindType)
                .eq(ShotBinding::getBindId, bindId);

        long count = bindingMapper.selectCount(checkWrapper);
        if (count > 0) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "该绑定关系已存在");
        }

        // 6. 创建绑定记录
        ShotBinding binding = new ShotBinding();
        binding.setShotId(shotId);
        binding.setBindType(bindType);
        binding.setBindId(bindId);

        int result = bindingMapper.insert(binding);
        if (result <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "绑定创建失败");
        }

        log.info("绑定关系创建成功: bindingId={}", binding.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteBinding(Long userId, Long projectId, Long shotId, Long bindingId) {
        log.info("删除绑定关系: userId={}, projectId={}, shotId={}, bindingId={}",
                userId, projectId, shotId, bindingId);

        // 1. 查询绑定记录是否存在
        ShotBinding binding = bindingMapper.selectById(bindingId);
        if (binding == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "绑定记录不存在");
        }

        // 2. 验证绑定记录属于指定分镜
        if (!binding.getShotId().equals(shotId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "该绑定记录不属于该分镜");
        }

        // 3. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 4. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 5. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 6. 物理删除绑定记录
        int result = bindingMapper.deleteById(bindingId);
        if (result <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "绑定删除失败");
        }

        log.info("绑定关系删除成功: bindingId={}", bindingId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ShotVO> parseScriptAndCreateShots(Long userId, Long projectId, ParseScriptRequest request) {
        log.info("AI解析剧本: userId={}, projectId={}, scriptLength={}", userId, projectId, request.fullScript().length());

        // 1. 验证项目存在且属于当前用户
        validateProjectOwnership(userId, projectId);

        // 2. 调用AI解析剧本，拆分成多条分镜、角色和场景
        AiParseScriptResult parseResult = parseScriptWithCharactersAndScenes(request.fullScript());
        List<String> scriptSegments = parseResult.getScriptSegments();
        List<String> characters = parseResult.getCharacters();
        List<String> scenes = parseResult.getScenes();
        
        log.info("AI解析完成，拆分为{}条分镜，{}个角色，{}个场景", 
                scriptSegments.size(), characters.size(), scenes.size());

        if (scriptSegments.isEmpty()) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "AI解析结果为空，请检查剧本内容");
        }

        // 3. 批量创建分镜
        List<ShotVO> createdShots = new ArrayList<>();
        for (String segment : scriptSegments) {
            if (segment.isBlank()) {
                continue;
            }
            ShotVO shot = createShot(userId, projectId, new CreateShotRequest(segment.trim()));
            createdShots.add(shot);
        }

        // 4. 创建项目角色和场景，并绑定到分镜
        createAndBindCharactersAndScenes(userId, projectId, createdShots, characters, scenes);

        log.info("批量创建分镜完成: count={}", createdShots.size());
        return createdShots;
    }

    /**
     * 解析完整剧本，提取分镜、角色和场景
     *
     * @param fullScript 完整剧本文本
     * @return AI解析结果，包含分镜段落、角色名称和场景描述
     */
    private AiParseScriptResult parseScriptWithCharactersAndScenes(String fullScript) {
        String systemPrompt = """
            一、你是一个专业的剧本大师，请将以下文案转换为剧本格式，并提取角色和场景信息
            
            要求：
            1.将内容分镜化，每个镜头的字数严格控制在99字以内
            2.保持文案所有情节，角色对话全部保留，不得增删改一字
            3.严格按照剧本格式输出
            4.提取剧本中出现的所有角色名称
            5.提取剧本中涉及的所有场景描述
            
            格式规范:
            -场景编号格式:场x-y，如"场1-1"代表第1集第一个场景
            -时间信息:夜/日，清晰表明是晚上还是白天
            -地点类型:外/内，明确是室外还是室内
            -具体地点:如别墅、酒店、广场等
            -使用括号标注镜头和动作
            -不要使用**等非剧本格式的符号
            -允许使用的景别：中景、近景、特写
            -中景：用于展示两人互动、相对位置或上半身动作
            -近景：用于常规对话、面部表情捕捉
            -特写：用于强调手部动作、物品细节或眼神微表情
            
            输出格式要求：
            1. 使用JSON格式输出，包含三个字段：script_segments、characters、scenes
            2. script_segments: 分镜段落列表，每个分镜之间用 "---" 分隔
            3. characters: 角色名称列表，去重，只包含人名，不包含描述
            4. scenes: 场景描述列表，包含时间、地点、环境等描述
            5. JSON格式如下：
            {
                "script_segments": [
                    "场1-1 日 内 咖啡厅\n出场人物:林辰、林清雪\n（中景）林辰和林清雪面对面坐着，桌上放着咖啡，叶辰说：\"我想和你谈谈我们的未来。\"\n（近景）叶辰表情严肃，镜头切至林清雪抬头看他，林清雪说：\"什么意思？\"\n（特写）叶辰的手从包里拿出户口本放在桌上，叶辰说：\"我想和你结婚。\"",
                    "场1-2 日 内 咖啡厅\n出场人物:林辰、林清雪\n（近景）林清雪震惊地看着户口本，林清雪说：\"可是...我爸不同意。\"\n（特写）叶辰紧紧握住林清雪的手，叶辰说：\"我会说服他的，相信我。\"\n（中景）林清雪流泪，随后坚定地点头。林清雪说：\"我相信你。\""
                ],
                "characters": ["林辰", "林清雪"],
                "scenes": ["咖啡厅 日 内", "咖啡厅 日 内"]
            }
            
            直接输出JSON，不要其他说明。
            """;

        String prompt = systemPrompt + "\n\n用户文案：\n" + fullScript;

        // 调用AI生成
        AiProperties.Text textConfig = aiProperties.getText();
        TextGenerationResult response = textProvider.generateText(
                prompt,
                textConfig.getModel(),
                textConfig.getMaxTokens(),
                0.3,  // 使用较低的温度以获得更稳定的输出
                0.9
        );

        // 提取生成的文本
        String generatedText = response.text();

        log.debug("AI解析结果: {}", generatedText);
        
        // 解析JSON响应
        return parseAiResponseToJson(generatedText);
    }
    
    /**
     * 解析AI返回的JSON响应
     *
     * @param jsonResponse AI返回的JSON字符串
     * @return 解析后的AI解析结果
     */
    private AiParseScriptResult parseAiResponseToJson(String jsonResponse) {
        try {
            // 尝试从AI响应中提取JSON部分
            String cleanJson = extractJsonFromResponse(jsonResponse);
            
            // 使用Jackson ObjectMapper解析JSON
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            
            // 解析为Map
            @SuppressWarnings("unchecked")
            Map<String, Object> jsonMap = mapper.readValue(cleanJson, Map.class);
            
            // 提取各个字段
            List<String> scriptSegments = (List<String>) jsonMap.getOrDefault("script_segments", new ArrayList<>());
            List<String> characters = (List<String>) jsonMap.getOrDefault("characters", new ArrayList<>());
            List<String> scenes = (List<String>) jsonMap.getOrDefault("scenes", new ArrayList<>());
            
            // 如果scriptSegments为空，尝试从AI响应中提取分镜内容
            if (scriptSegments == null || scriptSegments.isEmpty()) {
                scriptSegments = extractScriptSegmentsFromText(jsonResponse);
            }
            
            // 如果characters为空，尝试从分镜中提取角色
            if (characters == null || characters.isEmpty()) {
                characters = extractCharactersFromScriptSegments(scriptSegments);
            }
            
            // 如果scenes为空，尝试从分镜中提取场景
            if (scenes == null || scenes.isEmpty()) {
                scenes = extractScenesFromScriptSegments(scriptSegments);
            }
            
            return new AiParseScriptResult(scriptSegments, characters, scenes);
        } catch (Exception e) {
            log.error("解析AI JSON响应失败: {}", e.getMessage(), e);
            // 如果JSON解析失败，使用备用方法解析
            return fallbackParseScriptWithCharactersAndScenes(jsonResponse);
        }
    }
    
    /**
     * 从AI响应中提取JSON部分
     *
     * @param response AI响应字符串
     * @return 提取出的JSON字符串
     */
    private String extractJsonFromResponse(String response) {
        // 查找第一个 { 和最后一个 }
        int startIndex = response.indexOf('{');
        int endIndex = response.lastIndexOf('}');
        
        if (startIndex != -1 && endIndex != -1 && endIndex > startIndex) {
            return response.substring(startIndex, endIndex + 1);
        }
        
        // 如果找不到JSON结构，返回原响应
        return response;
    }
    
    /**
     * 从文本中提取分镜段落
     *
     * @param text 包含分镜的文本
     * @return 分镜段落列表
     */
    private List<String> extractScriptSegmentsFromText(String text) {
        // 按 "---" 分割
        String[] segments = text.split("---");
        List<String> result = new ArrayList<>();
        
        for (String segment : segments) {
            String trimmedSegment = segment.trim();
            if (!trimmedSegment.isEmpty()) {
                result.add(trimmedSegment);
            }
        }
        
        return result;
    }
    
    /**
     * 从分镜段落中提取角色名称
     *
     * @param scriptSegments 分镜段落列表
     * @return 角色名称列表
     */
    private List<String> extractCharactersFromScriptSegments(List<String> scriptSegments) {
        List<String> allCharacters = new ArrayList<>();
        
        for (String segment : scriptSegments) {
            // 匹配 "出场人物:" 后面的角色名称
            Pattern pattern = Pattern.compile("出场人物[::：]([^\\n]+)");
            Matcher matcher = pattern.matcher(segment);
            
            if (matcher.find()) {
                String charactersText = matcher.group(1);
                // 按逗号、顿号或空格分割角色名称
                String[] names = charactersText.split("[,、，。 ]+");
                for (String name : names) {
                    name = name.trim();
                    if (!name.isEmpty() && !allCharacters.contains(name)) {
                        allCharacters.add(name);
                    }
                }
            }
        }
        
        return allCharacters;
    }
    
    /**
     * 从分镜段落中提取场景描述
     *
     * @param scriptSegments 分镜段落列表
     * @return 场景描述列表
     */
    private List<String> extractScenesFromScriptSegments(List<String> scriptSegments) {
        List<String> allScenes = new ArrayList<>();
        
        for (String segment : scriptSegments) {
            // 匹配场次开头的场景信息，如 "场1-1 日 内 咖啡厅"
            Pattern pattern = Pattern.compile("^场\\d+-\\d+\\s+([^\\n]+)");
            Matcher matcher = pattern.matcher(segment);
            
            if (matcher.find()) {
                String sceneInfo = matcher.group(1).trim();
                // 提取场景描述部分（去除时间、内外景信息）
                String[] parts = sceneInfo.split("\\s+");
                if (parts.length >= 3) {
                    String sceneDesc = parts[2]; // 通常第三部分是具体的地点
                    if (!allScenes.contains(sceneDesc)) {
                        allScenes.add(sceneDesc);
                    }
                }
            }
        }
        
        return allScenes;
    }
    
    /**
     * 备用方法：当JSON解析失败时，解析剧本并提取角色和场景
     *
     * @param fullScript 完整剧本文本
     * @return AI解析结果
     */
    private AiParseScriptResult fallbackParseScriptWithCharactersAndScenes(String fullScript) {
        log.info("使用备用方法解析剧本");
        
        // 使用原来的分镜解析方法
        List<String> scriptSegments = parseScriptToSegments(fullScript);
        
        // 从分镜中提取角色和场景
        List<String> characters = extractCharactersFromScriptSegments(scriptSegments);
        List<String> scenes = extractScenesFromScriptSegments(scriptSegments);
        
        return new AiParseScriptResult(scriptSegments, characters, scenes);
    }
    
    /**
     * 解析完整剧本，拆分成分镜段落（原有方法，保留用于备选）
     *
     * @param fullScript 完整剧本文本
     * @return 分镜段落列表
     */
    private List<String> parseScriptToSegments(String fullScript) {
        String systemPrompt = """
            一、你是一个专业的剧本大师，请将以下文案转换为剧本格式
            
            要求：
            1.将内容分镜化，每个镜头的字数严格控制在99字以内
            2.保持文案所有情节，角色对话全部保留，不得增删改一字
            3.严格按照剧本格式输出
            
            格式规范:
            -场景编号格式:场x-y，如"场1-1"代表第1集第一个场景
            -时间信息:夜/日，清晰表明是晚上还是白天
            -地点类型:外/内，明确是室外还是室内
            -具体地点:如别墅、酒店、广场等
            -使用括号标注镜头和动作
            -不要使用**等非剧本格式的符号
            -允许使用的景别：中景、近景、特写
            -中景：用于展示两人互动、相对位置或上半身动作
            -近景：用于常规对话、面部表情捕捉
            -特写：用于强调手部动作、物品细节或眼神微表情
            
            输出格式要求：
            1. 直接输出每个分镜场景
            2. 每个分镜之间用 "---" 分隔
            3. 不要在开头汇总角色或场景
            
            示例格式:
            场1-1 日 内 咖啡厅
            出场人物:林辰、林清雪
            （中景）林辰和林清雪面对面坐着，桌上放着咖啡，叶辰说：“我想和你谈谈我们的未来。”
            （近景）叶辰表情严肃，镜头切至林清雪抬头看他，林清雪说：“什么意思？”
            （特写）叶辰的手从包里拿出户口本放在桌上，叶辰说：“我想和你结婚。”
            ---
            场1-2 日 内 咖啡厅
            出场人物:林辰、林清雪
            （近景）林清雪震惊地看着户口本，林清雪说：“可是...我爸不同意。”
            （特写）叶辰紧紧握住林清雪的手，叶辰说：“我会说服他的，相信我。”
            （中景）林清雪流泪，随后坚定地点头。林清雪说：“我相信你。”
            ---
            
            直接输出分镜内容，不要其他说明。
            """;

        String prompt = systemPrompt + "\n\n用户文案：\n" + fullScript;

        // 调用AI生成
        AiProperties.Text textConfig = aiProperties.getText();
        TextGenerationResult response = textProvider.generateText(
                prompt,
                textConfig.getModel(),
                textConfig.getMaxTokens(),
                0.3,  // 使用较低的温度以获得更稳定的输出
                0.9
        );

        // 提取生成的文本
        String generatedText = response.text();

        log.debug("AI解析结果: {}", generatedText);

        // 按分隔符拆分
        return Arrays.stream(generatedText.split("---"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }
    
    /**
     * 创建项目角色和场景，并绑定到分镜
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param shots 分镜列表
     * @param characters 角色名称列表
     * @param scenes 场景描述列表
     */
    private void createAndBindCharactersAndScenes(Long userId, Long projectId, List<ShotVO> shots, 
                                                  List<String> characters, List<String> scenes) {
        log.info("开始创建角色和场景并绑定到分镜: characters={}, scenes={}", 
                characters.size(), scenes.size());
        
        // 创建项目角色
        Map<String, ProjectCharacter> projectCharacterMap = createProjectCharacters(userId, projectId, characters);
        
        // 创建项目场景
        Map<String, ProjectScene> projectSceneMap = createProjectScenes(userId, projectId, scenes);
        
        // 绑定角色和场景到分镜
        bindCharactersAndScenesToShots(userId, projectId, shots, projectCharacterMap, projectSceneMap);
    }
    
    /**
     * 创建项目角色
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param characters 角色名称列表
     * @return 项目角色映射（角色名 -> 项目角色对象）
     */
    private Map<String, ProjectCharacter> createProjectCharacters(Long userId, Long projectId, List<String> characters) {
        Map<String, ProjectCharacter> characterMap = new java.util.HashMap<>();
        
        for (String characterName : characters) {
            if (characterName == null || characterName.trim().isEmpty()) {
                continue;
            }
            
            characterName = characterName.trim();
            
            // 检查是否已存在同名角色
            LambdaQueryWrapper<ProjectCharacter> queryWrapper = new LambdaQueryWrapper<>();
            queryWrapper.eq(ProjectCharacter::getProjectId, projectId)
                      .eq(ProjectCharacter::getDisplayName, characterName);
            
            ProjectCharacter existingCharacter = projectCharacterMapper.selectOne(queryWrapper);
            
            if (existingCharacter == null) {
                // 创建新角色
                ProjectCharacter character = new ProjectCharacter();
                character.setProjectId(projectId);
                character.setDisplayName(characterName);
                character.setLibraryCharacterId(null); // 无库角色关联，使用项目内自定义
                
                projectCharacterMapper.insert(character);
                characterMap.put(characterName, character);
                
                log.info("创建项目角色: {}", characterName);
            } else {
                characterMap.put(characterName, existingCharacter);
                log.info("角色已存在，跳过创建: {}", characterName);
            }
        }
        
        return characterMap;
    }
    
    /**
     * 创建项目场景
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param scenes 场景描述列表
     * @return 项目场景映射（场景名 -> 项目场景对象）
     */
    private Map<String, ProjectScene> createProjectScenes(Long userId, Long projectId, List<String> scenes) {
        Map<String, ProjectScene> sceneMap = new java.util.HashMap<>();
        
        for (String sceneName : scenes) {
            if (sceneName == null || sceneName.trim().isEmpty()) {
                continue;
            }
            
            sceneName = sceneName.trim();
            
            // 只保留地点名称，去掉"日/夜"和"内/外"等信息
            // 例如 "宿舍 日 内" -> "宿舍"
            String[] parts = sceneName.split("\\s+");
            if (parts.length > 0) {
                sceneName = parts[0];
            }
            
            // 检查是否已存在同名场景
            LambdaQueryWrapper<ProjectScene> queryWrapper = new LambdaQueryWrapper<>();
            queryWrapper.eq(ProjectScene::getProjectId, projectId)
                      .eq(ProjectScene::getDisplayName, sceneName);
            
            ProjectScene existingScene = projectSceneMapper.selectOne(queryWrapper);
            
            if (existingScene == null) {
                // 创建新场景
                ProjectScene scene = new ProjectScene();
                scene.setProjectId(projectId);
                scene.setDisplayName(sceneName);
                scene.setLibrarySceneId(null); // 无库场景关联，使用项目内自定义
                
                projectSceneMapper.insert(scene);
                sceneMap.put(sceneName, scene);
                
                log.info("创建项目场景: {}", sceneName);
            } else {
                sceneMap.put(sceneName, existingScene);
                log.info("场景已存在，跳过创建: {}", sceneName);
            }
        }
        
        return sceneMap;
    }
    
    /**
     * 绑定角色和场景到分镜
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param shots 分镜列表
     * @param characterMap 项目角色映射
     * @param sceneMap 项目场景映射
     */
    private void bindCharactersAndScenesToShots(Long userId, Long projectId, List<ShotVO> shots,
                                               Map<String, ProjectCharacter> characterMap,
                                               Map<String, ProjectScene> sceneMap) {
        for (ShotVO shot : shots) {
            String scriptText = shot.scriptText();
            
            // 从剧本文本中提取出场人物
            List<String> shotCharacters = extractCharactersFromScript(scriptText);
            
            // 绑定角色到分镜
            for (String characterName : shotCharacters) {
                ProjectCharacter projectCharacter = characterMap.get(characterName);
                if (projectCharacter != null) {
                    createBindingIfNotExists(userId, projectId, shot.id(), "PCHAR", projectCharacter.getId());
                }
            }
            
            // 提取地点名称并匹配场景
            String placeName = extractSceneFromScript(scriptText);
            log.debug("提取到的地点名称: {}, shotId={}", placeName, shot.id());
            
            if (placeName != null && !placeName.isEmpty()) {
                ProjectScene projectScene = sceneMap.get(placeName);
                if (projectScene != null) {
                    createBindingIfNotExists(userId, projectId, shot.id(), "PSCENE", projectScene.getId());
                    log.info("场景绑定成功: shotId={}, sceneName={}", shot.id(), placeName);
                } else {
                    log.warn("场景未找到: placeName={}, sceneMapKeys={}", placeName, sceneMap.keySet());
                }
            }
        }
    }
    
    /**
     * 创建绑定关系（如果不存在）
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param shotId 分镜ID
     * @param bindType 绑定类型
     * @param bindId 绑定对象ID
     */
    private void createBindingIfNotExists(Long userId, Long projectId, Long shotId, String bindType, Long bindId) {
        try {
            // 检查是否已存在相同的绑定
            LambdaQueryWrapper<ShotBinding> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(ShotBinding::getShotId, shotId)
                      .eq(ShotBinding::getBindType, bindType)
                      .eq(ShotBinding::getBindId, bindId);
            
            long count = bindingMapper.selectCount(checkWrapper);
            
            if (count == 0) {
                // 创建绑定记录
                ShotBinding binding = new ShotBinding();
                binding.setShotId(shotId);
                binding.setBindType(bindType);
                binding.setBindId(bindId);
                
                bindingMapper.insert(binding);
                
                log.info("创建绑定关系: shotId={}, bindType={}, bindId={}", shotId, bindType, bindId);
            } else {
                log.info("绑定关系已存在: shotId={}, bindType={}, bindId={}", shotId, bindType, bindId);
            }
        } catch (Exception e) {
            log.error("创建绑定关系失败: shotId={}, bindType={}, bindId={}", shotId, bindType, bindId, e);
        }
    }
    
    /**
     * 从剧本文本中提取角色名称
     *
     * @param scriptText 剧本文本
     * @return 角色名称列表
     */
    private List<String> extractCharactersFromScript(String scriptText) {
        List<String> characters = new ArrayList<>();
        
        // 匹配 "出场人物:" 后面的角色名称
        Pattern pattern = Pattern.compile("出场人物[::：]([^\\n]+)");
        Matcher matcher = pattern.matcher(scriptText);
        
        if (matcher.find()) {
            String charactersText = matcher.group(1);
            // 按逗号、顿号或空格分割角色名称
            String[] names = charactersText.split("[,、，。 ]+");
            for (String name : names) {
                name = name.trim();
                if (!name.isEmpty() && !characters.contains(name)) {
                    characters.add(name);
                }
            }
        }
        
        return characters;
    }
    
    /**
     * 从剧本文本中提取场景名称
     *
     * @param scriptText 剧本文本
     * @return 场景名称
     */
    private String extractSceneFromScript(String scriptText) {
        // 匹配场次开头的场景信息，如 "场1-1 日 内 咖啡厅"
        Pattern pattern = Pattern.compile("^场\\d+-\\d+\\s+[^\\s]+\\s+[^\\s]+\\s+(.+?)\\s*$", Pattern.MULTILINE);
        Matcher matcher = pattern.matcher(scriptText);
        
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        
        return null;
    }

    /**
     * 验证项目存在且属于当前用户
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @return 项目实体
     */
    private Project validateProjectOwnership(Long userId, Long projectId) {
        Project project = projectMapper.selectById(projectId);
        if (project == null || project.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "项目不存在");
        }
        if (!project.getUserId().equals(userId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该项目");
        }
        return project;
    }

    /**
     * 重新整理项目所有未删除分镜的序号,确保连续性
     *
     * <p>将所有未删除分镜的 shot_no 重新排列为 1, 2, 3...,避免序号跳号
     * <p>使用两阶段更新策略避免与已删除记录的唯一约束冲突
     *
     * @param projectId 项目ID
     */
    private void reorderAllActiveShots(Long projectId) {
        // 1. 物理删除所有已软删除的分镜(避免唯一约束冲突)
        LambdaQueryWrapper<StoryboardShot> deleteQuery = new LambdaQueryWrapper<>();
        deleteQuery.eq(StoryboardShot::getProjectId, projectId)
                .isNotNull(StoryboardShot::getDeletedAt);
        int deletedCount = shotMapper.delete(deleteQuery);
        if (deletedCount > 0) {
            log.debug("物理删除了{}条已软删除的分镜记录", deletedCount);
        }

        // 2. 查询所有未删除的分镜,按当前 shot_no 升序排列
        LambdaQueryWrapper<StoryboardShot> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(StoryboardShot::getProjectId, projectId)
                .isNull(StoryboardShot::getDeletedAt)
                .orderByAsc(StoryboardShot::getShotNo);

        List<StoryboardShot> activeShots = shotMapper.selectList(queryWrapper);

        if (activeShots.isEmpty()) {
            return;
        }

        // 3. 查询当前项目的最大 shot_no,用于计算安全的临时值
        LambdaQueryWrapper<StoryboardShot> maxQuery = new LambdaQueryWrapper<>();
        maxQuery.eq(StoryboardShot::getProjectId, projectId)
                .orderByDesc(StoryboardShot::getShotNo)
                .last("LIMIT 1");
        StoryboardShot maxShot = shotMapper.selectOne(maxQuery);
        int tempBase = (maxShot == null ? 0 : maxShot.getShotNo()) + 1000;

        // 4. 第一阶段：将所有分镜的 shot_no 设置为安全的临时值(maxShotNo+1000+索引)
        for (int i = 0; i < activeShots.size(); i++) {
            StoryboardShot shot = activeShots.get(i);
            shot.setShotNo(tempBase + i);
            shotMapper.updateById(shot);
        }

        // 5. 第二阶段：将所有分镜的 shot_no 设置为目标连续值 (1, 2, 3...)
        // 此时已删除记录已被物理删除,不会有唯一约束冲突
        for (int i = 0; i < activeShots.size(); i++) {
            StoryboardShot shot = activeShots.get(i);
            shot.setShotNo(i + 1);
            shotMapper.updateById(shot);
        }

        log.debug("重新整理分镜序号完成: projectId={}, 调整了{}条分镜", projectId, activeShots.size());
    }

    /**
     * 批量装配分镜 VO：一次性加载所有绑定目标、库缩略图与资产状态，
     * 逐 shot 组装时不再访问数据库（消除 N+1）。
     */
    private List<ShotVO> assembleShotVOs(List<StoryboardShot> shots,
                                         Map<Long, List<ShotBinding>> bindingMap,
                                         Set<Long> generatingImageShotIds,
                                         Set<Long> generatingVideoShotIds,
                                         Set<Long> failedVideoShotIds) {
        List<ShotBinding> allBindings = bindingMap.values().stream()
                .flatMap(List::stream)
                .collect(Collectors.toList());

        // 1. 按类型批量加载项目角色/场景/道具
        Map<Long, ProjectCharacter> characterMap = batchLoad(
                projectCharacterMapper, bindIds(allBindings, "PCHAR"), ProjectCharacter::getId);
        Map<Long, ProjectScene> sceneMap = batchLoad(
                projectSceneMapper, bindIds(allBindings, "PSCENE"), ProjectScene::getId);
        Map<Long, ProjectProp> propMap = batchLoad(
                projectPropMapper, bindIds(allBindings, "PPROP"), ProjectProp::getId);

        // 2. 批量加载库缩略图
        Map<Long, String> characterLibThumb = new java.util.HashMap<>();
        List<Long> libCharIds = characterMap.values().stream()
                .map(ProjectCharacter::getLibraryCharacterId).filter(java.util.Objects::nonNull)
                .distinct().collect(Collectors.toList());
        if (!libCharIds.isEmpty()) {
            characterLibraryMapper.selectBatchIds(libCharIds).forEach(c -> {
                if (c.getThumbnailUrl() != null) characterLibThumb.put(c.getId(), c.getThumbnailUrl());
            });
        }
        Map<Long, String> sceneLibThumb = new java.util.HashMap<>();
        List<Long> libSceneIds = sceneMap.values().stream()
                .map(ProjectScene::getLibrarySceneId).filter(java.util.Objects::nonNull)
                .distinct().collect(Collectors.toList());
        if (!libSceneIds.isEmpty()) {
            sceneLibraryMapper.selectBatchIds(libSceneIds).forEach(s -> {
                if (s.getThumbnailUrl() != null) sceneLibThumb.put(s.getId(), s.getThumbnailUrl());
            });
        }
        Map<Long, String> propLibThumb = new java.util.HashMap<>();
        List<Long> libPropIds = propMap.values().stream()
                .map(ProjectProp::getLibraryPropId).filter(java.util.Objects::nonNull)
                .distinct().collect(Collectors.toList());
        if (!libPropIds.isEmpty()) {
            propLibraryMapper.selectBatchIds(libPropIds).forEach(p -> {
                if (p.getThumbnailUrl() != null) propLibThumb.put(p.getId(), p.getThumbnailUrl());
            });
        }

        // 3. 解析缩略图，收集需回退到资产版本的 owner
        Map<Long, String> characterThumb = new java.util.HashMap<>();
        Set<Long> charNeedAsset = new java.util.HashSet<>();
        for (ProjectCharacter c : characterMap.values()) {
            String thumb;
            if (c.getLibraryCharacterId() == null) {
                thumb = c.getThumbnailUrl();
            } else if (c.getThumbnailUrl() != null && !c.getThumbnailUrl().isEmpty()) {
                thumb = c.getThumbnailUrl();
            } else {
                thumb = characterLibThumb.get(c.getLibraryCharacterId());
            }
            if (thumb == null) charNeedAsset.add(c.getId());
            else characterThumb.put(c.getId(), thumb);
        }
        Map<Long, String> sceneThumb = new java.util.HashMap<>();
        Set<Long> sceneNeedAsset = new java.util.HashSet<>();
        for (ProjectScene s : sceneMap.values()) {
            String thumb = s.getThumbnailUrl();
            if (thumb == null && s.getLibrarySceneId() != null) {
                thumb = sceneLibThumb.get(s.getLibrarySceneId());
            }
            if (thumb == null) sceneNeedAsset.add(s.getId());
            else sceneThumb.put(s.getId(), thumb);
        }
        Map<Long, String> propThumb = new java.util.HashMap<>();
        Set<Long> propNeedAsset = new java.util.HashSet<>();
        for (ProjectProp p : propMap.values()) {
            String thumb = p.getThumbnailUrl();
            if (thumb == null && p.getLibraryPropId() != null) {
                thumb = propLibThumb.get(p.getLibraryPropId());
            }
            if (thumb == null) propNeedAsset.add(p.getId());
            else propThumb.put(p.getId(), thumb);
        }

        // 4. 批量加载资产状态（绑定目标仅在缩略图缺失时回退；分镜图/视频必查）
        Map<Long, AssetStatusVO> charAsset = getAssetStatusBatch(charNeedAsset, "PCHAR", "IMAGE");
        Map<Long, AssetStatusVO> sceneAsset = getAssetStatusBatch(sceneNeedAsset, "PSCENE", "IMAGE");
        Map<Long, AssetStatusVO> propAsset = getAssetStatusBatch(propNeedAsset, "PPROP", "IMAGE");
        List<Long> shotIds = shots.stream().map(StoryboardShot::getId).collect(Collectors.toList());
        Map<Long, AssetStatusVO> shotImageAsset = getAssetStatusBatch(shotIds, "SHOT", "SHOT_IMG");
        Map<Long, AssetStatusVO> videoAsset = getAssetStatusBatch(shotIds, "SHOT", "VIDEO");

        // 5. 逐 shot 组装（纯内存，不再访问数据库）
        List<ShotVO> result = new ArrayList<>(shots.size());
        for (StoryboardShot shot : shots) {
            List<ShotBinding> shotBindings = bindingMap.getOrDefault(shot.getId(), java.util.Collections.emptyList());
            List<BoundCharacterVO> characters = new ArrayList<>();
            BoundSceneVO scene = null;
            List<BoundPropVO> props = new ArrayList<>();

            for (ShotBinding binding : shotBindings) {
                String type = binding.getBindType();
                if ("PCHAR".equals(type)) {
                    ProjectCharacter c = characterMap.get(binding.getBindId());
                    if (c != null) {
                        characters.add(new BoundCharacterVO(binding.getId(), c.getId(), c.getDisplayName(),
                                resolveThumb(characterThumb, charAsset, c.getId())));
                    }
                } else if ("PSCENE".equals(type)) {
                    ProjectScene s = sceneMap.get(binding.getBindId());
                    if (s != null) {
                        scene = new BoundSceneVO(binding.getId(), s.getId(), s.getDisplayName(),
                                resolveThumb(sceneThumb, sceneAsset, s.getId()));
                    }
                } else if ("PPROP".equals(type)) {
                    ProjectProp p = propMap.get(binding.getBindId());
                    if (p != null) {
                        props.add(new BoundPropVO(binding.getId(), p.getId(), p.getDisplayName(),
                                resolveThumb(propThumb, propAsset, p.getId())));
                    }
                }
            }

            AssetStatusVO shotImageStatus = applyShotImageState(
                    shotImageAsset.get(shot.getId()), generatingImageShotIds.contains(shot.getId()));
            AssetStatusVO videoStatus = applyVideoState(
                    videoAsset.get(shot.getId()),
                    generatingVideoShotIds.contains(shot.getId()),
                    failedVideoShotIds.contains(shot.getId()));

            result.add(new ShotVO(
                    shot.getId(), shot.getShotNo(), shot.getScriptText(),
                    characters, scene, props, shotImageStatus, videoStatus,
                    shot.getCreatedAt(), shot.getUpdatedAt()));
        }
        return result;
    }

    private <T> Map<Long, T> batchLoad(BaseMapper<T> mapper, Set<Long> ids, java.util.function.Function<T, Long> idGetter) {
        if (ids == null || ids.isEmpty()) {
            return java.util.Collections.emptyMap();
        }
        return mapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(idGetter, t -> t, (a, b) -> a));
    }

    private static Set<Long> bindIds(List<ShotBinding> bindings, String type) {
        return bindings.stream()
                .filter(b -> type.equals(b.getBindType()))
                .map(ShotBinding::getBindId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private static String resolveThumb(Map<Long, String> thumbMap, Map<Long, AssetStatusVO> assetMap, Long ownerId) {
        String thumb = thumbMap.get(ownerId);
        if (thumb != null) {
            return thumb;
        }
        AssetStatusVO asset = assetMap.get(ownerId);
        return asset != null ? asset.currentUrl() : null;
    }

    private AssetStatusVO applyShotImageState(AssetStatusVO status, boolean generating) {
        AssetStatusVO base = status != null ? status : createEmptyAssetStatus();
        if (generating) {
            return new AssetStatusVO(base.assetId(), base.currentVersionId(), base.currentUrl(),
                    "GENERATING", base.totalVersions());
        }
        return base;
    }

    private AssetStatusVO applyVideoState(AssetStatusVO status, boolean generating, boolean failed) {
        AssetStatusVO base = status != null ? status : createEmptyAssetStatus();
        if (generating) {
            return new AssetStatusVO(base.assetId(), base.currentVersionId(), base.currentUrl(),
                    "GENERATING", base.totalVersions());
        }
        if (base.currentVersionId() == null && failed) {
            return new AssetStatusVO(null, null, null, "FAILED", 0);
        }
        return base;
    }

    /**
     * 查询某项目下"分镜图正在生成中"的分镜ID集合。
     *
     * <p>数据来源是 jobs + job_items（生成提交时落库）。判定以 <b>Job 的状态</b>为准：
     * 只要父 Job 仍处于 PENDING/RUNNING，其下的 SHOT 子项即视为生成中。这样即使
     * worker 没来得及更新子项状态，Job 终态（在现有 worker 的 finally/catch 中可靠写入）
     * 也会让 GENERATING 自动消失，不会出现永久卡住的转圈。
     *
     * @param projectId 项目ID
     * @param shotIds 当前项目的分镜ID列表（用于限定结果范围）
     * @return 正在生成分镜图的分镜ID集合
     */
    private Set<Long> findGeneratingShotImageIds(Long projectId, List<Long> shotIds) {
        if (shotIds == null || shotIds.isEmpty()) {
            return Collections.emptySet();
        }

        List<Job> activeJobs = jobMapper.selectList(
                new LambdaQueryWrapper<Job>()
                        .eq(Job::getProjectId, projectId)
                        .eq(Job::getJobType, "BATCH_GEN_SHOT_IMG")
                        .in(Job::getStatus, Arrays.asList("PENDING", "RUNNING"))
        );
        if (activeJobs.isEmpty()) {
            return Collections.emptySet();
        }

        List<Long> jobIds = activeJobs.stream().map(Job::getId).collect(Collectors.toList());
        List<JobItem> items = jobItemMapper.selectList(
                new LambdaQueryWrapper<JobItem>()
                        .in(JobItem::getJobId, jobIds)
                        .eq(JobItem::getTargetType, "SHOT")
                        .in(JobItem::getStatus, Arrays.asList("PENDING", "RUNNING"))
        );

        return items.stream()
                .map(JobItem::getTargetId)
                .filter(shotIds::contains)
                .collect(Collectors.toSet());
    }

    /** Resolve persisted video generation state so refresh/reload does not lose the spinner or failure. */
    private Set<Long> findVideoShotIds(Long projectId, List<Long> shotIds, boolean generating) {
        if (shotIds == null || shotIds.isEmpty()) {
            return Collections.emptySet();
        }

        LambdaQueryWrapper<Job> jobQuery = new LambdaQueryWrapper<Job>()
                .eq(Job::getProjectId, projectId)
                .in(Job::getJobType, Arrays.asList("BATCH_GEN_VIDEO", "SINGLE_SHOT_VIDEO"));
        if (generating) {
            jobQuery.in(Job::getStatus, Arrays.asList("PENDING", "RUNNING"));
        } else {
            // A partially successful batch is SUCCEEDED while individual failed
            // items must still be visible as FAILED when no video asset exists.
            jobQuery.in(Job::getStatus, Arrays.asList("FAILED", "SUCCEEDED"));
        }

        List<Job> jobs = jobMapper.selectList(jobQuery);
        if (jobs.isEmpty()) {
            return Collections.emptySet();
        }

        LambdaQueryWrapper<JobItem> itemQuery = new LambdaQueryWrapper<JobItem>()
                .in(JobItem::getJobId, jobs.stream().map(Job::getId).collect(Collectors.toList()))
                .eq(JobItem::getTargetType, "SHOT");
        if (generating) {
            itemQuery.in(JobItem::getStatus, Arrays.asList("PENDING", "RUNNING"));
        } else {
            itemQuery.eq(JobItem::getStatus, "FAILED");
        }

        return jobItemMapper.selectList(itemQuery).stream()
                .map(JobItem::getTargetId)
                .filter(shotIds::contains)
                .collect(Collectors.toSet());
    }

    /**
     * 批量查询资产状态：每个 owner 取 createdAt 最新的资产，再取其 versionNo 最大的版本。
     * 与旧的逐条 getAssetStatus 行为一致，但把 N 次查询压成 2 次。
     */
    private Map<Long, AssetStatusVO> getAssetStatusBatch(java.util.Collection<Long> ownerIds,
                                                         String ownerType, String assetType) {
        Map<Long, AssetStatusVO> result = new java.util.HashMap<>();
        if (ownerIds == null || ownerIds.isEmpty()) {
            return result;
        }
        List<Long> ids = ownerIds.stream().distinct().collect(Collectors.toList());

        List<Asset> assets = assetMapper.selectList(new LambdaQueryWrapper<Asset>()
                .eq(Asset::getOwnerType, ownerType)
                .eq(Asset::getAssetType, assetType)
                .in(Asset::getOwnerId, ids));
        if (assets.isEmpty()) {
            return result;
        }

        // 每个 owner 取 createdAt 最新的资产（等价旧逻辑 order by created_at desc limit 1）
        Map<Long, Asset> latestAssetByOwner = new java.util.HashMap<>();
        for (Asset asset : assets) {
            Asset current = latestAssetByOwner.get(asset.getOwnerId());
            if (current == null || isAfter(asset.getCreatedAt(), current.getCreatedAt())) {
                latestAssetByOwner.put(asset.getOwnerId(), asset);
            }
        }

        List<Long> assetIds = latestAssetByOwner.values().stream()
                .map(Asset::getId).collect(Collectors.toList());
        Map<Long, List<AssetVersion>> versionsByAsset = assetVersionMapper.selectList(
                        new LambdaQueryWrapper<AssetVersion>().in(AssetVersion::getAssetId, assetIds))
                .stream()
                .collect(Collectors.groupingBy(AssetVersion::getAssetId));

        for (Map.Entry<Long, Asset> entry : latestAssetByOwner.entrySet()) {
            Asset asset = entry.getValue();
            List<AssetVersion> versions = versionsByAsset.get(asset.getId());
            if (versions == null || versions.isEmpty()) {
                continue;
            }
            AssetVersion latest = versions.stream()
                    .max(java.util.Comparator.comparing(AssetVersion::getVersionNo)).orElse(null);
            result.put(entry.getKey(), new AssetStatusVO(
                    asset.getId(), latest.getId(), latest.getUrl(), latest.getStatus(), versions.size()));
        }
        return result;
    }

    private static boolean isAfter(LocalDateTime a, LocalDateTime b) {
        if (a == null) {
            return false;
        }
        if (b == null) {
            return true;
        }
        return a.isAfter(b);
    }

    /**
     * 创建空的资产状态VO
     *
     * @return 空资产状态VO
     */
    private AssetStatusVO createEmptyAssetStatus() {
        return new AssetStatusVO(null, null, null, "NONE", 0);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteShotImageAsset(Long userId, Long projectId, Long shotId) {
        log.info("删除分镜图资产: userId={}, projectId={}, shotId={}", userId, projectId, shotId);

        // 1. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 2. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 3. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 4. 查询分镜图资产
        LambdaQueryWrapper<Asset> assetQuery = new LambdaQueryWrapper<>();
        assetQuery.eq(Asset::getOwnerId, shotId)
                .eq(Asset::getOwnerType, "SHOT")
                .eq(Asset::getAssetType, "SHOT_IMG")
                .orderByDesc(Asset::getCreatedAt)
                .last("LIMIT 1");

        Asset asset = assetMapper.selectOne(assetQuery);
        if (asset == null) {
            log.info("分镜图资产不存在，无需删除: shotId={}", shotId);
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜图资产不存在");
        }

        // 5. 删除资产的所有版本
        LambdaQueryWrapper<AssetVersion> versionQuery = new LambdaQueryWrapper<>();
        versionQuery.eq(AssetVersion::getAssetId, asset.getId());
        int versionCount = assetVersionMapper.delete(versionQuery);

        // 6. 删除资产
        int assetResult = assetMapper.deleteById(asset.getId());

        if (assetResult <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "资产删除失败");
        }

        log.info("分镜图资产删除成功: shotId={}, assetId={}, 删除了{}个版本", 
                shotId, asset.getId(), versionCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteVideoAsset(Long userId, Long projectId, Long shotId) {
        log.info("删除视频资产: userId={}, projectId={}, shotId={}", userId, projectId, shotId);

        // 1. 查询分镜是否存在且未删除
        StoryboardShot shot = shotMapper.selectById(shotId);
        if (shot == null || shot.getDeletedAt() != null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "分镜不存在");
        }

        // 2. 验证分镜属于指定项目
        if (!shot.getProjectId().equals(projectId)) {
            throw new BusinessException(ResultCode.ACCESS_DENIED, "无权限访问该分镜");
        }

        // 3. 验证项目属于当前用户
        validateProjectOwnership(userId, projectId);

        // 4. 查询视频资产
        LambdaQueryWrapper<Asset> assetQuery = new LambdaQueryWrapper<>();
        assetQuery.eq(Asset::getOwnerId, shotId)
                .eq(Asset::getOwnerType, "SHOT")
                .eq(Asset::getAssetType, "VIDEO")
                .orderByDesc(Asset::getCreatedAt)
                .last("LIMIT 1");

        Asset asset = assetMapper.selectOne(assetQuery);
        if (asset == null) {
            log.info("视频资产不存在，无需删除: shotId={}", shotId);
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND, "视频资产不存在");
        }

        // 5. 删除资产的所有版本
        LambdaQueryWrapper<AssetVersion> versionQuery = new LambdaQueryWrapper<>();
        versionQuery.eq(AssetVersion::getAssetId, asset.getId());
        int versionCount = assetVersionMapper.delete(versionQuery);

        // 6. 删除资产
        int assetResult = assetMapper.deleteById(asset.getId());

        if (assetResult <= 0) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "资产删除失败");
        }

        log.info("视频资产删除成功: shotId={}, assetId={}, 删除了{}个版本", 
                shotId, asset.getId(), versionCount);
    }
}
