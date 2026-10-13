package com.ym.ai_story_studio_server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.entity.ImageReferenceUpload;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ImageReferenceUploadMapper extends BaseMapper<ImageReferenceUpload> {

    @Update("""
            UPDATE image_reference_uploads
               SET lease_until = DATE_ADD(NOW(3), INTERVAL #{leaseSeconds} SECOND),
                   error_message = NULL
             WHERE id = #{id}
               AND status = 'UPLOADING'
               AND (lease_until IS NULL OR lease_until < NOW(3))
            """)
    int reclaim(@Param("id") Long id, @Param("leaseSeconds") int leaseSeconds);
}
