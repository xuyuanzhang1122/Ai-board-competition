package com.ym.ai_story_studio_server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.entity.ImageGenerationTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ImageGenerationTaskMapper extends BaseMapper<ImageGenerationTask> {

    @Select("""
            SELECT t.*
              FROM image_generation_tasks t
              JOIN jobs j ON j.id = t.job_id
              JOIN job_items i ON i.id = t.job_item_id
             WHERE t.status IN ('SUBMITTED', 'POLLING', 'COMPLETING')
               AND t.provider_task_id IS NOT NULL
               AND j.status IN ('PENDING', 'RUNNING')
               AND i.status IN ('PENDING', 'RUNNING')
            """)
    List<ImageGenerationTask> selectRecoverableActiveTasks();

    @Select("""
            SELECT t.*
              FROM image_generation_tasks t
              JOIN jobs j ON j.id = t.job_id
              JOIN job_items i ON i.id = t.job_item_id
             WHERE t.status = 'SUBMITTING'
               AND (t.lease_until IS NULL OR t.lease_until < NOW(3))
               AND j.status IN ('PENDING', 'RUNNING')
               AND i.status IN ('PENDING', 'RUNNING')
            """)
    List<ImageGenerationTask> selectStaleActiveSubmissions();

    @Update("""
            UPDATE image_generation_tasks
               SET status = 'SUBMITTING',
                   lease_until = DATE_ADD(NOW(3), INTERVAL #{leaseSeconds} SECOND),
                   error_message = NULL
             WHERE id = #{id}
               AND provider_task_id IS NULL
               AND (status = 'SUBMITTING' AND (lease_until IS NULL OR lease_until < NOW(3)))
            """)
    int reclaimSubmission(@Param("id") Long id, @Param("leaseSeconds") int leaseSeconds);

    @Update("""
            UPDATE image_generation_tasks
               SET status = 'COMPLETING',
                   lease_until = DATE_ADD(NOW(3), INTERVAL #{leaseSeconds} SECOND)
             WHERE id = #{id}
               AND provider_task_id IS NOT NULL
               AND (status IN ('SUBMITTED', 'POLLING')
                    OR (status = 'COMPLETING' AND (lease_until IS NULL OR lease_until < NOW(3))))
            """)
    int claimCompletion(@Param("id") Long id, @Param("leaseSeconds") int leaseSeconds);
}
