/**
 * TimZoo 探店管理 - Cloudflare Pages Functions API 入口
 *
 * 文件路径: functions/api/[[path]].js
 * 匹配所有 /api/* 路径（不拦截静态文件）
 *
 * 必须配置: Settings → Functions → Bindings → D1 Database (变量名 DB)
 */

export const onRequest = async ({ request, env }) => {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // 路由分发（pathname 已经是 /api/xxx 格式，因为文件在 api/ 目录下）
    const path = url.pathname;
    const method = request.method;

    try {
      let response;

      // ---------- 健康检查 ----------
      if (path === '/api/health' && method === 'GET') {
        response = json({ status: 'ok', time: new Date().toISOString() });
      }

      // ========== 用户认证 ==========
      else if (path === '/api/auth/login' && method === 'POST') response = await handleLogin(request, env);
      else if (path === '/api/auth/register' && method === 'POST') response = await handleRegister(request, env);

      else {
        // 以下需要认证的接口 - 解析用户信息
        const userId = request.headers.get('X-User-Id') || url.searchParams.get('userId');
        let user = null;
        if (userId) {
          user = await getUserById(env.DB, userId);
        }

        // ========== 用户信息 ==========
        if (path === '/api/user/info' && method === 'GET') response = handleUserInfo(env, userId, user);
        else if (path === '/api/user/update' && method === 'POST') response = await handleUserUpdate(request, env, userId, user);

        // ========== 探店记录 CRUD ==========
        else if (path === '/api/records' && method === 'GET') response = await handleGetRecords(env, userId, user, url);
        else if (path === '/api/records' && method === 'POST') response = await handleAddRecord(request, env, userId, user);
        else if (path === '/api/records' && method === 'PUT') response = await handleUpdateRecord(request, env, user);
        else if (path === '/api/records' && method === 'DELETE') response = await handleDeleteRecord(request, env, user);

        // ========== 管理员接口 ==========
        else if (path.startsWith('/api/admin/') && (!user || user.role !== 'admin')) {
          response = json({ success: false, message: '需要管理员权限' }, 403);
        }
        else if (path === '/api/admin/users' && method === 'GET') response = await handleAdminUsers(env);
        else if (path === '/api/admin/records' && method === 'GET') response = await handleAdminRecords(env, url);
        else if (path === '/api/admin/orders' && method === 'GET') response = await handleAdminOrders(env);
        else if (path === '/api/admin/user/update' && method === 'POST') response = await handleAdminUpdateUser(request, env);
        else if (path === '/api/admin/user/delete' && method === 'POST') response = await handleAdminDeleteUser(request, env);
        else if (path === '/api/admin/stats' && method === 'GET') response = await handleAdminStats(env);

        // ========== VIP 激活（免费开通）==========
        else if (path === '/api/vip/activate' && method === 'POST') response = await handleVipActivate(request, env, userId, user);

        else { response = json({ error: 'Not Found' }, 404); }
      }

      // 统一附加 CORS header 到所有响应
      return addCorsHeaders(response, origin);

    } catch (err) {
      console.error('API Error:', err);
      return addCorsHeaders(json({ error: err.message }, 500), origin);
    }
}

// ============================================================
// 工具函数
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function addCorsHeaders(response, origin) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', origin);
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// ============================================================
// 用户认证
// ============================================================

async function handleLogin(req, env) {
  const { username, password } = await readBody(req);

  const result = await env.DB.prepare(
    'SELECT id, username, realname, platform, role, memberType, memberExpire, createdAt FROM users WHERE username = ? AND password = ?'
  ).bind(username, password).first();

  if (result) {
    return json({ success: true, user: result });
  }
  return json({ success: false, message: '用户名或密码错误' });
}

async function handleRegister(req, env) {
  const { username, password, realname, platform } = await readBody(req);

  // 检查是否已存在
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).bind(username).first();

  if (existing) {
    return json({ success: false, message: '用户名已存在' });
  }

  const userId = 'user_' + Date.now();

  // 前100名注册用户免费送终身永久会员，101名后送1年会员
  const countResult = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM users"
  ).first();
  const totalUsers = countResult ? Number(countResult.cnt) : 0;
  const isFirst100 = totalUsers < 100;

  const expireStr = isFirst100 ? '2099-12-01' : (function() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  })();

  // 确保 platform 列存在（首次运行时添加）
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN platform TEXT DEFAULT ''`).run();
  } catch(e) { /* column already exists */ }

  await env.DB.prepare(`
    INSERT INTO users (id, username, password, realname, platform, role, memberType, memberExpire, createdAt)
    VALUES (?, ?, ?, ?, ?, 'user', 'vip', ?, datetime('now'))
  `).bind(userId, username, password, realname || username, platform || '', expireStr).run();

  const user = await getUserById(env.DB, userId);
  const { password: _, ...safeUser } = user || {};
  return json({ success: true, user: safeUser });
}

// ============================================================
// 用户信息
// ============================================================

function handleUserInfo(env, userId, user) {
  if (!user) return json({ success: false, message: '用户不存在' });
  return json({ success: true, user });
}

async function handleUserUpdate(req, env, userId, user) {
  if (!user) return json({ success: false, message: '用户不存在' });

  const body = await readBody(req);
  const allowedFields = ['realname', 'phone', 'avatar'];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length > 0) {
    values.push(userId);
    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  return json({ success: true });
}

// ============================================================
// 探店记录
// ============================================================

async function handleGetRecords(env, userId, user, url) {
  let sql = `SELECT r.*, u.username FROM records r LEFT JOIN users u ON r.userId = u.id WHERE 1=1`;
  const params = [];

  if (user?.role !== 'admin') {
    sql += ' AND r.userId = ?';
    params.push(userId);
  }

  const storeName = url.searchParams.get('storeName');
  const status = url.searchParams.get('status');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  if (storeName) { sql += ' AND r.storeName LIKE ?'; params.push('%' + storeName + '%'); }
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (startDate) { sql += ' AND r.date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND r.date <= ?'; params.push(endDate); }

  sql += ' ORDER BY r.createdAt DESC';  // 最新记录排最前

  const results = params.length > 0
    ? await env.DB.prepare(sql).bind(...params).all()
    : await env.DB.prepare(sql).all();

  return json({ success: true, records: results.results || [] });
}

async function handleAddRecord(req, env, userId, user) {
  const body = await readBody(req);
  const recId = 'rec_' + Date.now();

  await env.DB.prepare(`
    INSERT INTO records (id, userId, storeName, type, date,
      arriveTime, teamMembers, feeStatus, photoStatus, photosCount, mainPhotos,
      actualAmount, fee, actualFee, shortStatus, shortFee, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    recId, userId, body.storeName || '', body.type || 'explore', body.date || '',
    body.arriveTime || '', body.teamMembers || '',
    body.feeStatus || 'pending_fee', body.photoStatus || 'pending_shoot',
    body.photosCount || 0, body.mainPhotos || 0,
    body.actualAmount || 0, body.fee || 0, body.actualFee || 0,
    body.shortStatus || 'pending_shoot', body.shortFee || 0,
    body.notes || '', body.status || 'active'
  ).run();

  const record = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(recId).first();
  return json({ success: true, record });
}

async function handleUpdateRecord(req, env, user) {
  const body = await readBody(req);
  const { id, ...updates } = body;

  if (!id) return json({ success: false, message: '缺少记录ID' });

  if (user?.role !== 'admin') {
    const existing = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
    if (existing?.userId !== user.id) {
      return json({ success: false, message: '无权操作此记录' });
    }
  }

  const fields = ['storeName', 'type', 'date', 'arriveTime', 'teamMembers', 'feeStatus', 'photoStatus',
                  'photosCount', 'mainPhotos', 'actualAmount', 'fee', 'actualFee',
                  'shortStatus', 'shortFee', 'notes', 'status'];
  const sets = [];
  const values = [];

  for (const f of fields) {
    if (updates[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(updates[f]);
    }
  }

  if (sets.length > 0) {
    values.push(id);
    await env.DB.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const record = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
  return json({ success: true, record });
}

async function handleDeleteRecord(req, env, user) {
  const { id } = new URL(req.url).searchParams;
  const body = await readBody(req);
  const recordId = id || body.id;

  if (!recordId) return json({ success: false, message: '缺少记录ID' });

  if (user?.role !== 'admin') {
    const existing = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(recordId).first();
    if (existing?.userId !== user.id) {
      return json({ success: false, message: '无权删除此记录' });
    }
  }

  await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(recordId).run();
  return json({ success: true });
}

// ============================================================
// VIP 激活（注册即送VIP，此处仅返回当前状态）
// ============================================================

async function handleVipActivate(req, env, userId, user) {
  if (!user) return json({ success: false, message: '用户不存在，请先登录' });

  // 注册时已赠送VIP 1年，这里仅返回状态
  const expireText = user.memberExpire ? ('有效期至 ' + user.memberExpire) : '未知';

  return json({
    success: true,
    message: '您已是VIP会员（' + expireText + '）',
    user,
    activated: false,
  });
}

// ============================================================
// 管理员接口
// ============================================================

async function handleAdminUsers(env) {
  const results = await env.DB.prepare(
    "SELECT id, username, realname, platform, role, memberType, memberExpire, phone, createdAt FROM users ORDER BY createdAt DESC"
  ).all();
  return json({ success: true, users: results.results || [] });
}

async function handleAdminRecords(env, url) {
  let sql = "SELECT r.*, u.username, u.realname FROM records r LEFT JOIN users u ON r.userId = u.id WHERE 1=1";
  const params = [];

  const filterUser = url.searchParams.get('userId');
  const storeName = url.searchParams.get('storeName');

  if (filterUser) { sql += ' AND r.userId = ?'; params.push(filterUser); }
  if (storeName) { sql += ' AND r.storeName LIKE ?'; params.push('%' + storeName + '%'); }

  sql += ' ORDER BY r.createdAt DESC';  // 最新记录排最前

  const results = params.length > 0
    ? await env.DB.prepare(sql).bind(...params).all()
    : await env.DB.prepare(sql).all();

  return json({ success: true, records: results.results || [] });
}

async function handleAdminOrders(env) {
  const results = await env.DB.prepare(
    "SELECT o.*, u.realname FROM orders o LEFT JOIN users u ON o.userId = u.id ORDER BY o.createdAt DESC"
  ).all();
  return json({ success: true, orders: results.results || [] });
}

async function handleAdminUpdateUser(req, env) {
  const body = await readBody(req);
  const { id } = body;

  if (!id) return json({ success: false, message: '缺少用户ID' });

  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!existing) return json({ success: false, message: '用户不存在' });

  const fields = [];
  const values = [];

  // VIP叠加逻辑：+N年（默认+1年）
  if (body.vipAddYears !== undefined) {
    const currentUser = await env.DB.prepare(
      'SELECT memberExpire FROM users WHERE id = ?'
    ).bind(id).first();
    const baseExpire = currentUser?.memberExpire
      ? new Date(currentUser.memberExpire)
      : new Date();
    baseExpire.setFullYear(baseExpire.getFullYear() + (body.vipAddYears || 1));
    const maxDate = new Date('2099-12-01');
    const finalExpire = baseExpire > maxDate ? '2099-12-01' : baseExpire.toISOString().split('T')[0];
    fields.push(`memberType = ?`, `memberExpire = ?`);
    values.push('vip', finalExpire);
  }

  const fieldMap = {
    memberType: 'memberType',
    memberExpire: 'memberExpire',
    role: 'role',
    realname: 'realname',
    platform: 'platform',
    password: 'password',
    phone: 'phone',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (body[key] !== undefined && body[key] !== '') {
      fields.push(`${col} = ?`);
      values.push(body[key]);
    }
  }

  if (body.newUsername !== undefined && body.newUsername !== '') {
    const nameConflict = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ? AND id != ?"
    ).bind(body.newUsername, id).first();
    if (nameConflict) {
      return json({ success: false, message: '用户名已被使用' });
    }
    fields.push('username = ?');
    values.push(body.newUsername);
  }

  if (fields.length > 0) {
    values.push(id);
    await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await getUserById(env.DB, id);
  const { password: _, ...safeUser } = updated || {};
  return json({ success: true, user: safeUser });
}

async function handleAdminDeleteUser(req, env) {
  const { id } = await readBody(req);
  if (!id) return json({ success: false, message: '缺少用户ID' });

  const user = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(id).first();
  if (!user) return json({ success: false, message: '用户不存在' });

  await env.DB.prepare('DELETE FROM records WHERE userId = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM orders WHERE userId = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

  return json({ success: true });
}

async function handleAdminStats(env) {
  const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  const totalRecords = await env.DB.prepare("SELECT COUNT(*) as count FROM records").first();
  const totalOrders = await env.DB.prepare("SELECT COUNT(*) as count FROM orders").first();
  const vipCount = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE memberType != 'normal'").first();

  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const monthRecords = await env.DB.prepare("SELECT COUNT(*) as count FROM records WHERE date >= ?").bind(monthStart).first();

  const feeStats = await env.DB.prepare(
    "SELECT COALESCE(SUM(actualFee), 0) as totalFees, COALESCE(SUM(actualAmount), 0) as totalAmounts FROM records"
  ).first();

  return json({
    success: true,
    stats: {
      users: totalUsers?.count || 0,
      records: totalRecords?.count || 0,
      orders: totalOrders?.count || 0,
      vipCount: vipCount?.count || 0,
      monthRecords: monthRecords?.count || 0,
      totalFees: feeStats?.totalFees || 0,
      totalAmounts: feeStats?.totalAmounts || 0,
    }
  });
}

// ============================================================
// 辅助：获取用户
// ============================================================

async function getUserById(db, userId) {
  if (!userId) return null;
  return db.prepare(
    'SELECT id, username, password, realname, platform, role, memberType, memberExpire, phone, avatar, createdAt FROM users WHERE id = ?'
  ).bind(userId).first();
}
