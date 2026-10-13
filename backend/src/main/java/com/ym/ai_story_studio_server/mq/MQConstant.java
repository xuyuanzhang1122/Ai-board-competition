package com.ym.ai_story_studio_server.mq;

/**
 * MQ常量类
 * 
 * <p>统一管理交换机、队列、路由键的命名
 * 
 * @author AI Story Studio
 * @since 1.0.0
 */
public class MQConstant {

    // ==================== 交换机 ====================
    /**
     * 业务交换机（Direct类型）
     */
    public static final String EXCHANGE_BUSINESS = "ai.story.business.exchange";
    
    /**
     * 死信交换机
     */
    public static final String EXCHANGE_DEAD_LETTER = "ai.story.dlx.exchange";

    /** 延迟/重试交换机（消息先进 TTL 队列，到期后死信回业务交换机）。 */
    public static final String EXCHANGE_RETRY = "ai.story.retry.exchange";

    // ==================== 队列 ====================
    /**
     * 批量生成分镜图队列
     */
    public static final String QUEUE_BATCH_SHOT_IMAGE = "ai.story.batch.shot.image.queue";
    
    /**
     * 单个分镜图生成队列(支持自定义prompt)
     */
    public static final String QUEUE_SINGLE_SHOT_IMAGE = "ai.story.single.shot.image.queue";
    
    /**
     * 批量生成视频队列
     */
    public static final String QUEUE_BATCH_VIDEO = "ai.story.batch.video.queue";
    
    /**
     * 单个分镜视频生成队列
     */
    public static final String QUEUE_SINGLE_SHOT_VIDEO = "ai.story.single.shot.video.queue";
    
    /**
     * 批量生成角色画像队列
     */
    public static final String QUEUE_BATCH_CHARACTER_IMAGE = "ai.story.batch.character.image.queue";
    
    /**
     * 批量生成场景画像队列
     */
    public static final String QUEUE_BATCH_SCENE_IMAGE = "ai.story.batch.scene.image.queue";
    
    /**
     * 批量生成道具画像队列
     */
    public static final String QUEUE_BATCH_PROP_IMAGE = "ai.story.batch.prop.image.queue";
    
    /**
     * 文本解析队列
     */
    public static final String QUEUE_TEXT_PARSING = "ai.story.text.parsing.queue";
    
    /**
     * 死信队列
     */
    public static final String QUEUE_DEAD_LETTER = "ai.story.dlx.queue";

    /** 分镜生图提交失败的延迟重试队列。 */
    public static final String QUEUE_BATCH_SHOT_IMAGE_RETRY = "ai.story.batch.shot.image.retry.queue";
    public static final String QUEUE_SINGLE_SHOT_IMAGE_RETRY = "ai.story.single.shot.image.retry.queue";

    /** 单次上游图片任务的轮询队列。 */
    public static final String QUEUE_IMAGE_POLL = "ai.story.image.poll.queue";

    /** 轮询延迟队列：不设消费者，TTL 到期后转入 QUEUE_IMAGE_POLL。 */
    public static final String QUEUE_IMAGE_POLL_DELAY = "ai.story.image.poll.delay.queue";
    public static final String QUEUE_IMAGE_POLL_DELAY_MEDIUM = "ai.story.image.poll.delay.15s.queue";
    public static final String QUEUE_IMAGE_POLL_DELAY_SLOW = "ai.story.image.poll.delay.30s.queue";

    /** 图片调度专用死信队列，便于运维单独重放。 */
    public static final String QUEUE_IMAGE_DEAD_LETTER = "ai.story.image.dlx.queue";

    // ==================== 路由键 ====================
    /**
     * 批量生成分镜图路由键
     */
    public static final String ROUTING_KEY_BATCH_SHOT_IMAGE = "batch.shot.image";
    
    /**
     * 单个分镜图生成路由键(支持自定义prompt)
     */
    public static final String ROUTING_KEY_SINGLE_SHOT_IMAGE = "single.shot.image";
    
    /**
     * 批量生成视频路由键
     */
    public static final String ROUTING_KEY_BATCH_VIDEO = "batch.video";
    
    /**
     * 单个分镜视频生成路由键
     */
    public static final String ROUTING_KEY_SINGLE_SHOT_VIDEO = "single.shot.video";
    
    /**
     * 批量生成角色画像路由键
     */
    public static final String ROUTING_KEY_BATCH_CHARACTER_IMAGE = "batch.character.image";
    
    /**
     * 批量生成场景画像路由键
     */
    public static final String ROUTING_KEY_BATCH_SCENE_IMAGE = "batch.scene.image";
    
    /**
     * 批量生成道具画像路由键
     */
    public static final String ROUTING_KEY_BATCH_PROP_IMAGE = "batch.prop.image";
    
    /**
     * 文本解析路由键
     */
    public static final String ROUTING_KEY_TEXT_PARSING = "text.parsing";
    
    /**
     * 死信路由键
     */
    public static final String ROUTING_KEY_DEAD_LETTER = "dead.letter";

    public static final String ROUTING_KEY_BATCH_SHOT_IMAGE_RETRY = "batch.shot.image.retry";
    public static final String ROUTING_KEY_SINGLE_SHOT_IMAGE_RETRY = "single.shot.image.retry";
    public static final String ROUTING_KEY_IMAGE_POLL = "image.poll";
    public static final String ROUTING_KEY_IMAGE_POLL_DELAY = "image.poll.delay";
    public static final String ROUTING_KEY_IMAGE_POLL_DELAY_MEDIUM = "image.poll.delay.15s";
    public static final String ROUTING_KEY_IMAGE_POLL_DELAY_SLOW = "image.poll.delay.30s";
    public static final String ROUTING_KEY_IMAGE_DEAD_LETTER = "image.dead.letter";

    // ==================== 死信配置参数 ====================
    /**
     * 死信交换机参数名
     */
    public static final String X_DEAD_LETTER_EXCHANGE = "x-dead-letter-exchange";
    
    /**
     * 死信路由键参数名
     */
    public static final String X_DEAD_LETTER_ROUTING_KEY = "x-dead-letter-routing-key";
    
    /**
     * 消息TTL参数名（毫秒）
     */
    public static final String X_MESSAGE_TTL = "x-message-ttl";

    // ==================== 其他配置 ====================
    /**
     * 默认消息TTL：7天（毫秒）
     */
    public static final int DEFAULT_MESSAGE_TTL = 7 * 24 * 60 * 60 * 1000;

    /** 提交上游失败后的重试间隔。 */
    public static final int SHOT_IMAGE_RETRY_TTL = 15_000;

    /** 分镜提交最多重试次数。 */
    public static final int MAX_SUBMISSION_RETRIES = 3;
}
