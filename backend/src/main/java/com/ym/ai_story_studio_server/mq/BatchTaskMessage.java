package com.ym.ai_story_studio_server.mq;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 批量任务消息
 *
 * <p>用于MQ传递批量生成任务信息
 *
 * @author AI Story Studio
 * @since 1.0.0
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BatchTaskMessage implements Serializable {
    
    /**
     * 任务ID
     */
    private Long jobId;
    
    /**
     * 用户ID
     */
    private Long userId;
    
    /**
     * 项目ID
     */
    private Long projectId;
    
    /**
     * 目标ID列表（分镜ID/角色ID/场景ID）
     */
    private List<Long> targetIds;
    
    /**
     * 生成模式：ALL(全部生成) / MISSING(仅缺失)
     */
    private String mode;
    
    /**
     * 每个目标生成数量
     */
    private Integer countPerItem;
    
    /**
     * 画幅比例
     */
    private String aspectRatio;
    
    /**
     * 模型名称
     */
    private String model;

    /** 视频时长（秒），仅视频任务使用。 */
    private Integer duration;

    public BatchTaskMessage(Long jobId, Long userId, Long projectId, List<Long> targetIds,
                            String mode, Integer countPerItem, String aspectRatio, String model) {
        this(jobId, userId, projectId, targetIds, mode, countPerItem, aspectRatio, model, null);
    }
}
