package com.ym.ai_story_studio_server.mq;

import com.rabbitmq.client.Channel;
import com.ym.ai_story_studio_server.client.GeeknowClient;
import com.ym.ai_story_studio_server.config.AiProperties;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import com.ym.ai_story_studio_server.exception.RetryableAiException;
import com.ym.ai_story_studio_server.service.AsyncImageTaskService;
import com.ym.ai_story_studio_server.service.ImageGenerationTaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.Message;

import java.util.List;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ImagePollConsumerTest {

    @Mock private GeeknowClient geeknowClient;
    @Mock private ImageGenerationTaskService generationTaskService;
    @Mock private AsyncImageTaskService asyncImageTaskService;
    @Mock private MQProducer mqProducer;
    @Mock private Channel channel;

    private ImagePollConsumer consumer;
    private ImageGenerationTask task;
    private Message message;

    @BeforeEach
    void setUp() {
        consumer = new ImagePollConsumer(
                geeknowClient,
                generationTaskService,
                asyncImageTaskService,
                mqProducer,
                new AiProperties()
        );
        task = new ImageGenerationTask();
        task.setId(7L);
        task.setProviderTaskId("provider-7");
        task.setStatus(ImageGenerationTaskService.POLLING);
        task.setPollCount(2);
        task.setQueryFailureCount(0);
        message = new Message(new byte[0]);
        message.getMessageProperties().setDeliveryTag(41L);
        when(generationTaskService.get(7L)).thenReturn(task);
        when(generationTaskService.isTerminal(task.getStatus())).thenReturn(false);
    }

    @Test
    void pendingTaskIsDelayedBeforeCurrentMessageIsAcked() throws Exception {
        when(geeknowClient.queryImageTask("provider-7"))
                .thenReturn(response("processing", List.of()));

        consumer.handle(new ImagePollMessage(7L), message, channel);

        verify(generationTaskService).markPollPending(7L, 3);
        verify(mqProducer).sendImagePollDelayed(7L, 3);
        verify(channel).basicAck(41L, false);
        verify(channel, never()).basicNack(anyLong(), anyBoolean(), anyBoolean());
    }

    @Test
    void completedTaskIsPersistedBeforeAck() throws Exception {
        GeeknowClient.ImageTaskApiResponse response = response(
                "completed",
                List.of(new GeeknowClient.ImageTaskData("https://example.com/image.png", null, null))
        );
        when(geeknowClient.queryImageTask("provider-7")).thenReturn(response);
        when(generationTaskService.claimCompletion(7L)).thenReturn(true);

        consumer.handle(new ImagePollMessage(7L), message, channel);

        verify(asyncImageTaskService).completeQueuedImageTask(7L, response);
        verify(channel).basicAck(41L, false);
        verify(mqProducer, never()).sendImagePollDelayed(anyLong(), anyInt());
    }

    @Test
    void queryFailureUsesDelayQueueInsteadOfImmediateRequeue() throws Exception {
        when(geeknowClient.queryImageTask("provider-7"))
                .thenThrow(new RetryableAiException("temporary"));
        when(generationTaskService.markQueryFailure(7L, "temporary")).thenReturn(1);

        consumer.handle(new ImagePollMessage(7L), message, channel);

        verify(mqProducer).sendImagePollDelayed(7L, 3);
        verify(channel).basicAck(41L, false);
        verify(channel, never()).basicNack(41L, false, true);
    }

    @Test
    void providerFailureIsTerminalWithoutAnotherPoll() throws Exception {
        GeeknowClient.ImageTaskApiResponse response = new GeeknowClient.ImageTaskApiResponse(
                "provider-7", null, "model", "generation_failed", 10,
                null, null, null, null, List.of(),
                new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"message\":\"rejected\"}")
        );
        when(geeknowClient.queryImageTask("provider-7")).thenReturn(response);

        consumer.handle(new ImagePollMessage(7L), message, channel);

        verify(generationTaskService).markFailed(7L, "rejected");
        verify(channel).basicNack(41L, false, false);
        verify(mqProducer, never()).sendImagePollDelayed(anyLong(), anyInt());
    }

    @Test
    void terminalOwnerStopsBeforeProviderQuery() throws Exception {
        when(generationTaskService.cancelIfOwnerTerminal(7L)).thenReturn(true);

        consumer.handle(new ImagePollMessage(7L), message, channel);

        verifyNoInteractions(geeknowClient);
        verify(channel).basicAck(41L, false);
    }

    private GeeknowClient.ImageTaskApiResponse response(
            String status,
            List<GeeknowClient.ImageTaskData> data
    ) {
        return new GeeknowClient.ImageTaskApiResponse(
                "provider-7", null, "model", status, null,
                null, null, null, null, data, null
        );
    }
}
