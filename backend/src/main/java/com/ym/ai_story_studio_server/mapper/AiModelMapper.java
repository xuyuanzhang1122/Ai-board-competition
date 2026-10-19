// {{CODE-Cycle-Integration:
//   Task_ID: [#T-BACKEND-MODEL-API]
//   Timestamp: 2026-01-04T15:55:39+08:00
//   Phase: [D-Develop]
//   Context-Analysis: "Creating AiModelMapper following StylePresetMapper pattern. Extends MyBatis-Plus BaseMapper."
//   Principle_Applied: "KISS, DRY, SOLID"
// }}
// {{START_MODIFICATIONS}}
package com.ym.ai_story_studio_server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.entity.AiModel;
import org.apache.ibatis.annotations.Mapper;

/**
 * AI模型配置表 Mapper
 */
@Mapper
public interface AiModelMapper extends BaseMapper<AiModel> {
    @org.apache.ibatis.annotations.Update("""
        UPDATE ai_models SET enabled=#{enabled},sort_order=#{sortOrder},updated_at=CURRENT_TIMESTAMP(3)
        WHERE id=#{id} AND upstream_present=1 AND catalog_revision=#{revision}
          AND (#{enabled}=0 OR type='LANGUAGE')
        """)
    int updateCatalogSettings(@org.apache.ibatis.annotations.Param("id") Long id,
        @org.apache.ibatis.annotations.Param("revision") String revision,
        @org.apache.ibatis.annotations.Param("enabled") Integer enabled,
        @org.apache.ibatis.annotations.Param("sortOrder") Integer sortOrder);

}
// {{END_MODIFICATIONS}}
