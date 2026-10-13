package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.entity.ImageReferenceUpload;
import com.ym.ai_story_studio_server.mapper.ImageReferenceUploadMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

/** 持久化参考图上传结果，避免 Rabbit 重投或并发分镜重复上传同一文件。 */
@Service
@RequiredArgsConstructor
public class ImageReferenceUploadService {

    public static final String UPLOADING = "UPLOADING";
    public static final String SUCCEEDED = "SUCCEEDED";
    public static final String FAILED = "FAILED";
    private static final int UPLOAD_LEASE_SECONDS = 180;

    private final ImageReferenceUploadMapper mapper;

    public record UploadClaim(ImageReferenceUpload upload, boolean shouldUpload) {}

    @Transactional
    public UploadClaim claim(Long jobId, String sourceUrl) {
        String hash = sha256(sourceUrl);
        ImageReferenceUpload existing = find(jobId, hash);
        if (existing != null) {
            if (!UPLOADING.equals(existing.getStatus())) {
                return new UploadClaim(existing, false);
            }
            if (mapper.reclaim(existing.getId(), UPLOAD_LEASE_SECONDS) == 1) {
                return new UploadClaim(mapper.selectById(existing.getId()), true);
            }
            return new UploadClaim(existing, false);
        }

        ImageReferenceUpload upload = new ImageReferenceUpload();
        upload.setJobId(jobId);
        upload.setSourceUrlHash(hash);
        upload.setSourceUrl(sourceUrl);
        upload.setStatus(UPLOADING);
        upload.setLeaseUntil(LocalDateTime.now().plusSeconds(UPLOAD_LEASE_SECONDS));
        try {
            mapper.insert(upload);
            return new UploadClaim(upload, true);
        } catch (DuplicateKeyException race) {
            return new UploadClaim(find(jobId, hash), false);
        }
    }

    @Transactional
    public void markSucceeded(Long id, String publicUrl) {
        ImageReferenceUpload upload = mapper.selectById(id);
        if (upload == null || SUCCEEDED.equals(upload.getStatus())) return;
        upload.setStatus(SUCCEEDED);
        upload.setPublicUrl(publicUrl);
        upload.setErrorMessage(null);
        upload.setLeaseUntil(null);
        mapper.updateById(upload);
    }

    @Transactional
    public void markFailed(Long id, String error) {
        ImageReferenceUpload upload = mapper.selectById(id);
        if (upload == null || SUCCEEDED.equals(upload.getStatus()) || FAILED.equals(upload.getStatus())) return;
        upload.setStatus(FAILED);
        upload.setErrorMessage(error);
        upload.setLeaseUntil(null);
        mapper.updateById(upload);
    }

    private ImageReferenceUpload find(Long jobId, String hash) {
        return mapper.selectOne(new LambdaQueryWrapper<ImageReferenceUpload>()
                .eq(ImageReferenceUpload::getJobId, jobId)
                .eq(ImageReferenceUpload::getSourceUrlHash, hash)
                .last("LIMIT 1"));
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("无法计算参考图指纹", e);
        }
    }
}
