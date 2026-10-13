package com.ym.ai_story_studio_server.exception;

/**
 * 仅表示可以安全重试、且尚未得到上游业务终态的传输或调度故障。
 *
 * <p>上游明确返回失败、参数校验失败和参考图上传失败都不应使用此异常。
 */
public class RetryableAiException extends RuntimeException {

    public RetryableAiException(String message) {
        super(message);
    }

    public RetryableAiException(String message, Throwable cause) {
        super(message, cause);
    }
}
