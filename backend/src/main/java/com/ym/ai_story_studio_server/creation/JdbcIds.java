package com.ym.ai_story_studio_server.creation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import java.util.Objects;
final class JdbcIds {
    private JdbcIds() {}
    static long insert(JdbcTemplate db,String sql,Object... args) {
        var key=new GeneratedKeyHolder();
        db.update(c->{var s=c.prepareStatement(sql,new String[]{"id"});for(int i=0;i<args.length;i++)s.setObject(i+1,args[i]);return s;},key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
}
