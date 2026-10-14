package com.ym.ai_story_studio_server.service;

import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 参赛版免费生成策略。结果中的零表示用户积分费用，不代表供应商成本为零。
 * 实际供应商用量由任务执行器记录，人民币预算限制需由独立额度控制完成，不能用积分字段代替。
 * 不查询、扣除或伪造钱包余额，不创建虚假的交易或使用记录。
 */
@Service
public class ChargingService {
    public ChargingResult charge(ChargingRequest request) {
        return ChargingResult.builder()
                .success(true)
                .totalCost(0)
                .unitPrice(0)
                .quantity(request.getQuantity())
                .unit("COMPETITION_FREE")
                .build();
    }

    /**
     * 计费请求参数
     */
    @lombok.Data
    @lombok.Builder
    public static class ChargingRequest {
        /**
         * 任务ID
         */
        private Long jobId;

        /**
         * 业务类型(TEXT_GENERATION/IMAGE_GENERATION/VIDEO_GENERATION)
         */
        private String bizType;

        /**
         * 模型代码
         */
        private String modelCode;

        /**
         * 数量(token数/图片张数/视频秒数)
         */
        private Integer quantity;

        /**
         * 扩展信息(可选)
         */
        private Map<String, Object> metaData;
    }

    /**
     * 计费结果
     */
    @lombok.Data
    @lombok.Builder
    public static class ChargingResult {
        /**
         * 是否成功
         */
        private Boolean success;

        /**
         * 总费用(积分)
         */
        private Integer totalCost;

        /**
         * 单价(分/单位)
         */
        private Integer unitPrice;

        /**
         * 数量
         */
        private Integer quantity;

        /**
         * 计费单位
         */
        private String unit;

        /**
         * 扣费前余额
         */
        private Integer balanceBefore;

        /**
         * 扣费后余额
         */
        private Integer balanceAfter;

        /**
         * 流水记录ID
         */
        private Long transactionId;

        /**
         * 使用扣费记录ID
         */
        private Long usageChargeId;
    }
}
