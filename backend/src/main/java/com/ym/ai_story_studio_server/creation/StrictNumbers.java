package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;
import java.io.IOException;

/** Apply equally to generated JSON, manual saves, and revision-bearing REST commands. */
public final class StrictNumbers {
    private StrictNumbers() {}
    public static final class IntValue extends JsonDeserializer<Integer> {
        @Override public Integer deserialize(JsonParser p,DeserializationContext context) throws IOException {
            if(p.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(p,"必须使用整数，不能隐式取整");
            return p.getIntValue();
        }
    }
    public static final class LongValue extends JsonDeserializer<Long> {
        @Override public Long deserialize(JsonParser p,DeserializationContext context) throws IOException {
            if(p.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(p,"版本必须使用整数");
            return p.getLongValue();
        }
    }
}
