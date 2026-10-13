package com.ym.ai_story_studio_server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ym.ai_story_studio_server.entity.Admin;
import org.apache.ibatis.annotations.Mapper;

/**
 * 管理员表 Mapper 接口
 */
@Mapper
public interface AdminMapper extends BaseMapper<Admin> {
}
