package com.ym.ai_story_studio_server.mq;

import java.io.Serializable;

/**
 * 单次图片任务的一次轮询指令。消息只携带本地主键，业务上下文从数据库恢复，
 * 避免参数过期，也便于进程崩溃后重建轮询消息。
 */
public record ImagePollMessage(Long generationTaskId) implements Serializable {
}
