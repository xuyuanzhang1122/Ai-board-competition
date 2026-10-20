package com.ym.ai_story_studio_server.provider;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;

/** Partial provider output is recoverable evidence, never a successful candidate. */
public final class IncompleteTextException extends BusinessException {
    private final String partialText;
    private final String finishReason;
    public IncompleteTextException(String partialText,String finishReason) {
        super(ResultCode.AI_SERVICE_ERROR,"文本供应商结果未完成，原始部分输出已保留，请核对任务记录");
        this.partialText=partialText;this.finishReason=finishReason;
    }
    public String getPartialText(){return partialText;}
    public String getFinishReason(){return finishReason;}
}
