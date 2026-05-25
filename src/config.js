/**
 * 探店管理 - 前端配置文件 (Cloudflare 部署版)
 * API 通过 Cloudflare Workers 提供，前端部署在 Cloudflare Pages
 */

// API 配置
const API_CONFIG = {
  // 基础API地址
  // 本地开发时自动使用 127.0.0.1:8787 (wrangler dev)
  // 部署后使用同域（Cloudflare Pages + Workers Functions）
  get baseUrl() {
    // 本地开发环境检测：前端通常在 :8080，API 在 :8787
    const host = window.location.host;
    if (host.startsWith('127.0.0.1:') || host.startsWith('localhost:')) {
      return 'http://127.0.0.1:8787';
    }
    // 生产环境：同域部署（Pages 前端 + Workers Functions）
    return window.location.origin;
  },

  // API端点
  endpoints: {
    // 用户相关
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
    userInfo: '/api/user/info',
    updateUser: '/api/user/update',

    // 探店记录相关
    records: '/api/records',
    recordDetail: '/api/records/',
    addRecord: '/api/records',
    updateRecord: '/api/records',
    deleteRecord: '/api/records',

    // VIP会员相关
    vipActivate: '/api/vip/activate',
  },

};
