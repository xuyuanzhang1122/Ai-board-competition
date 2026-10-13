package com.ym.ai_story_studio_server.service.impl;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.PutObjectRequest;
import com.ym.ai_story_studio_server.config.StorageProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CosStorageServiceImplTest {

    @TempDir
    Path tempDir;

    @Test
    void legacyLocalReferenceIsUploadedUnderAiboardPrefixAndSigned() throws Exception {
        Path legacyFile = tempDir.resolve("2026/07/01/reference.png");
        Files.createDirectories(legacyFile.getParent());
        Files.write(legacyFile, new byte[]{1, 2, 3});

        StorageProperties properties = properties();
        properties.getLocal().setBasePath(tempDir.toString());
        COSClient cosClient = mock(COSClient.class);
        when(cosClient.generatePresignedUrl(
                eq("test-bucket-123"), any(String.class), any(), any()))
                .thenReturn(new URL("https://signed.example/reference.png?signature=test"));
        CosStorageServiceImpl storageService = new CosStorageServiceImpl(properties);
        ReflectionTestUtils.setField(storageService, "cosClient", cosClient);

        String externalUrl = storageService.resolveExternalAccessUrl(
                "/uploads/2026/07/01/reference.png", 120);

        assertThat(externalUrl).isEqualTo("https://signed.example/reference.png?signature=test");
        ArgumentCaptor<PutObjectRequest> requestCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(cosClient).putObject(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getKey()).startsWith("aiboard/");
        verify(cosClient).generatePresignedUrl(
                eq("test-bucket-123"),
                eq(requestCaptor.getValue().getKey()),
                any(),
                any());
    }

    @Test
    void uploadAssetUsesAssetsPrefixInsteadOfAiboard() {
        StorageProperties properties = properties();
        COSClient cosClient = mock(COSClient.class);
        CosStorageServiceImpl storageService = new CosStorageServiceImpl(properties);
        ReflectionTestUtils.setField(storageService, "cosClient", cosClient);

        storageService.uploadAsset(
                new ByteArrayInputStream(new byte[]{1, 2, 3}), "shot_image.png", "image/png");

        ArgumentCaptor<PutObjectRequest> requestCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(cosClient).putObject(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getKey()).startsWith("assets/");
    }

    @Test
    void ownCosUrlIsSignedWithoutUploadingAgain() throws Exception {
        StorageProperties properties = properties();
        COSClient cosClient = mock(COSClient.class);
        when(cosClient.generatePresignedUrl(
                eq("test-bucket-123"), eq("aiboard/2026/07/03/ref.png"), any(), any()))
                .thenReturn(new URL("https://signed.example/ref.png?signature=test"));
        CosStorageServiceImpl storageService = new CosStorageServiceImpl(properties);
        ReflectionTestUtils.setField(storageService, "cosClient", cosClient);

        String externalUrl = storageService.resolveExternalAccessUrl(
                "https://test-bucket-123.cos.ap-beijing.myqcloud.com/aiboard/2026/07/03/ref.png",
                120
        );

        assertThat(externalUrl).isEqualTo("https://signed.example/ref.png?signature=test");
        verify(cosClient).generatePresignedUrl(
                eq("test-bucket-123"), eq("aiboard/2026/07/03/ref.png"), any(), any());
    }

    private StorageProperties properties() {
        StorageProperties properties = new StorageProperties();
        properties.setProvider("cos");
        properties.getCos().setSecretId("secret-id");
        properties.getCos().setSecretKey("secret-key");
        properties.getCos().setRegion("ap-beijing");
        properties.getCos().setBucket("test-bucket-123");
        properties.getCos().setUrlPrefix(
                "https://test-bucket-123.cos.ap-beijing.myqcloud.com");
        properties.getLocal().setUrlPrefix("/uploads");
        return properties;
    }
}
