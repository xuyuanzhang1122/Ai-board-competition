package com.ym.ai_story_studio_server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 同一 Job 内本地参考图到 GeekNow 公网 URL 的持久化映射。 */
@Data
@TableName("image_reference_uploads")
public class ImageReferenceUpload {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long jobId;
    private String sourceUrlHash;
    private String sourceUrl;
    private String publicUrl;
    private String status;
    private String errorMessage;
    private LocalDateTime leaseUntil;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
