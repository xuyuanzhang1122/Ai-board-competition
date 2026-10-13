package com.ym.ai_story_studio_server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** RabbitMQ 驱动的单次上游图片生成任务。 */
@Data
@TableName("image_generation_tasks")
public class ImageGenerationTask {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long jobId;
    private Long jobItemId;
    private Long userId;
    private Long projectId;
    private Long shotId;
    private Integer taskIndex;
    private String providerTaskId;
    private String status;
    private Integer pollCount;
    private Integer queryFailureCount;
    private String prompt;
    private String model;
    private String aspectRatio;
    private String resultUrl;
    private String errorMessage;
    private LocalDateTime leaseUntil;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime finishedAt;
}
