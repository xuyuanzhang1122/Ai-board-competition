package com.ym.ai_story_studio_server.mq;

import com.ym.ai_story_studio_server.provider.ImageGenerationProvider;
import com.ym.ai_story_studio_server.provider.ImageTaskResult;
import com.rabbitmq.client.Channel;

import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.exception.RetryableAiException;
import com.ym.ai_story_studio_server.service.AsyncImageTaskService;
import com.ym.ai_story_studio_server.service.ImageGenerationTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * RabbitMQ 驱动的图片轮询消费者。
 *
 * <p>每条消息只查一次上游：未完成则发到 TTL 延迟队列后 ack；成功则在
 * 资产落库后 ack；崩溃时未 ack 消息由 broker 自动重投。因此没有长时占用的
 * {@code while + sleep} 线程，队列深度也能真实表示系统积压。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImagePollConsumer {

    private static final int MAX_CONSECUTIVE_FAILURES = 10;

    private final ImageGenerationProvider imageProvider;
    private final ImageGenerationTaskService generationTaskService;
    private final AsyncImageTaskService asyncImageTaskService;
    private final MQProducer mqProducer;
    private final AiProperties aiProperties;

    @RabbitListener(
            queues = MQConstant.QUEUE_IMAGE_POLL,
            concurrency = "${rabbit.workers.image-poll:8}"
    )
    public void handle(ImagePollMessage payload, Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        Long localTaskId = payload.generationTaskId();
        ImageGenerationTask task = generationTaskService.get(localTaskId);

        if (task == null || generationTaskService.isTerminal(task.getStatus())) {
            channel.basicAck(deliveryTag, false);
            return;
        }
        if (generationTaskService.cancelIfOwnerTerminal(localTaskId)) {
            log.info("图片任务所属 Job 已结束，停止轮询 - generationTaskId: {}", localTaskId);
            channel.basicAck(deliveryTag, false);
            return;
        }
        if (task.getProviderTaskId() == null || task.getProviderTaskId().isBlank()) {
            deadLetter(localTaskId, "图片轮询任务缺少上游taskId", deliveryTag, channel);
            return;
        }

        ImageTaskResult response;
        try {
            response = imageProvider.queryImageTask(task.getProviderTaskId());
        } catch (RetryableAiException queryError) {
            int failures = generationTaskService.markQueryFailure(localTaskId, queryError.getMessage());
            log.warn("图片任务单次查询失败 - generationTaskId: {}, providerTaskId: {}, failures: {}/{}, error: {}",
                    localTaskId, task.getProviderTaskId(), failures, MAX_CONSECUTIVE_FAILURES,
                    queryError.getMessage());
            if (failures >= MAX_CONSECUTIVE_FAILURES) {
                deadLetter(localTaskId, "图片任务查询连续失败: " + queryError.getMessage(), deliveryTag, channel);
            } else {
                int retryStage = (task.getPollCount() == null ? 0 : task.getPollCount()) + failures;
                delayAndAck(localTaskId, retryStage, deliveryTag, channel);
            }
            return;
        } catch (Exception terminalQueryError) {
            deadLetter(localTaskId,
                    "图片任务查询不可重试: " + terminalQueryError.getMessage(), deliveryTag, channel);
            return;
        }

        String status = response.status();
        if (isCompleted(status)) {
            handleCompleted(task, response, deliveryTag, channel);
            return;
        }
        if (isFailed(response)) {
            String providerMessage = response.errorMessage();
            deadLetter(localTaskId,
                    providerMessage == null || providerMessage.isBlank()
                            ? "图片生成失败(status: " + status + ")"
                            : providerMessage,
                    deliveryTag,
                    channel);
            return;
        }

        int pollCount = (task.getPollCount() == null ? 0 : task.getPollCount()) + 1;
        int maxPollCount = Math.max(1, aiProperties.getImage().getMaxPollCount());
        if (pollCount >= maxPollCount) {
            deadLetter(localTaskId, "图片生成超时(API响应超过预期时间)", deliveryTag, channel);
            return;
        }

        generationTaskService.markPollPending(localTaskId, pollCount);
        delayAndAck(localTaskId, pollCount, deliveryTag, channel);
    }

    private void handleCompleted(
            ImageGenerationTask task,
            ImageTaskResult response,
            long deliveryTag,
            Channel channel
    ) throws Exception {
        Long taskId = task.getId();
        if (!generationTaskService.claimCompletion(taskId)) {
            // 另一条重复消息/实例正在收尾，延迟再检查结果；租约超时后可接管。
            delayAndAck(taskId, task.getPollCount() == null ? 0 : task.getPollCount(), deliveryTag, channel);
            return;
        }
        try {
            asyncImageTaskService.completeQueuedImageTask(taskId, response);
            channel.basicAck(deliveryTag, false);
        } catch (RetryableAiException completionError) {
            generationTaskService.releaseCompletion(taskId, completionError.getMessage());
            int failures = generationTaskService.markQueryFailure(taskId, completionError.getMessage());
            log.error("图片任务收尾失败 - generationTaskId: {}, failures: {}/{}, error: {}",
                    taskId, failures, MAX_CONSECUTIVE_FAILURES, completionError.getMessage(), completionError);
            if (failures >= MAX_CONSECUTIVE_FAILURES) {
                deadLetter(taskId, "图片收尾连续失败: " + completionError.getMessage(), deliveryTag, channel);
            } else {
                int retryStage = (task.getPollCount() == null ? 0 : task.getPollCount()) + failures;
                delayAndAck(taskId, retryStage, deliveryTag, channel);
            }
        } catch (Exception terminalCompletionError) {
            generationTaskService.releaseCompletion(taskId, terminalCompletionError.getMessage());
            deadLetter(taskId, "图片任务收尾不可重试: " + terminalCompletionError.getMessage(),
                    deliveryTag, channel);
        }
    }

    /** 必须先收到延迟消息的 publisher confirm，才能 ack 当前消息。 */
    private void delayAndAck(Long taskId, int pollCount, long deliveryTag, Channel channel) throws Exception {
        try {
            mqProducer.sendImagePollDelayed(taskId, pollCount);
            channel.basicAck(deliveryTag, false);
        } catch (Exception publishError) {
            log.error("图片轮询延迟重发失败，保留原消息 - generationTaskId: {}", taskId, publishError);
            channel.basicNack(deliveryTag, false, true);
        }
    }

    private void deadLetter(Long taskId, String error, long deliveryTag, Channel channel) throws Exception {
        generationTaskService.markFailed(taskId, error);
        channel.basicNack(deliveryTag, false, false);
        log.error("图片调度任务进入DLQ - generationTaskId: {}, error: {}", taskId, error);
    }

    private boolean isCompleted(String status) {
        return "completed".equalsIgnoreCase(status)
                || "succeeded".equalsIgnoreCase(status)
                || "success".equalsIgnoreCase(status);
    }

    private boolean isFailed(ImageTaskResult response) {
        if (response.errorMessage() != null && !response.errorMessage().isBlank()) return true;
        String status = response.status();
        if (status == null) return false;
        String normalized = status.trim().toLowerCase(java.util.Locale.ROOT)
                .replace('-', '_').replace(' ', '_');
        return normalized.contains("fail")
                || normalized.contains("error")
                || normalized.contains("cancel")
                || normalized.contains("reject")
                || normalized.contains("expired");
    }
}
