import base from "/Users/xumy/Desktop/AI\u521b\u65b0\u5927\u8d5b/Ai-board-competition/frontend-admin/vite.config.ts";
export default {...base, envDir: false, server: {...base.server,host:"127.0.0.1",port:13001,strictPort:true,proxy:{"/api":{target:"http://127.0.0.1:18080",changeOrigin:true},"/uploads":{target:"http://127.0.0.1:18080",changeOrigin:true}}}};
