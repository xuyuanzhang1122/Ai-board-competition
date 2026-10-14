package com.ym.ai_story_studio_server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.entity.Job;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

/**
 * 任务表 Mapper 接口
 */
@Mapper
public interface JobMapper extends BaseMapper<Job> {

    @Select("SELECT * FROM jobs WHERE id = #{id} FOR UPDATE")
    Job selectByIdForUpdate(Long id);

    @Update("""
        UPDATE jobs SET status = 'CANCELED', finished_at = CURRENT_TIMESTAMP(3)
        WHERE id = #{id} AND user_id = #{userId} AND status IN ('PENDING', 'RUNNING')
        """)
    int cancelActiveJob(@Param("id") Long id, @Param("userId") Long userId);

    @Update("""
        UPDATE jobs SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP(3)
        WHERE id = #{id} AND user_id = #{userId} AND project_id = #{projectId}
          AND job_type IN ('TEXT_GENERATION', 'PARSE_TEXT') AND status = 'PENDING'
        """)
    int claimPendingTextJob(@Param("id") Long id, @Param("userId") Long userId,
                            @Param("projectId") Long projectId);

    @Update("""
        UPDATE jobs SET
          progress = CASE WHEN status = 'RUNNING' THEN #{job.progress} ELSE progress END,
          done_items = CASE WHEN status = 'RUNNING' THEN #{job.doneItems} ELSE done_items END,
          error_message = CASE WHEN status = 'RUNNING' THEN #{job.errorMessage} ELSE error_message END,
          cost_points = #{job.costPoints}, meta_json = #{job.metaJson},
          finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP(3)),
          status = CASE WHEN status = 'RUNNING' THEN #{job.status} ELSE status END
        WHERE id = #{job.id} AND user_id = #{job.userId} AND project_id = #{job.projectId}
          AND job_type IN ('TEXT_GENERATION', 'PARSE_TEXT') AND status IN ('RUNNING', 'CANCELED')
        """)
    int finishClaimedTextJob(@Param("job") Job job);

    @Update("""
        UPDATE jobs SET status = 'FAILED', error_message = #{reason}, finished_at = CURRENT_TIMESTAMP(3)
        WHERE id = #{id} AND user_id = #{userId} AND project_id = #{projectId}
          AND job_type IN ('TEXT_GENERATION', 'PARSE_TEXT') AND status = 'PENDING'
        """)
    int failPendingTextJob(@Param("id") Long id, @Param("userId") Long userId,
                           @Param("projectId") Long projectId, @Param("reason") String reason);
}
