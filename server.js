/**
 * 探店管理 - Node.js 后端 (快速启动)
 *
 * 使用方法：
 * 1. npm init -y
 * 2. npm install express cors body-parser
 * 3. node server.js
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5003;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务（前端）
app.use('/src', express.static(__dirname + '/../web-client/src'));

// ============================================================
// 内存数据存储（生产环境请使用数据库）
// ============================================================
const db = {
  users: [
    { id: 'admin', username: 'dinice', password: 'dinice98', realname: '管理员', role: 'admin', memberType: 'vip', memberExpire: '2099-12-31' }
  ],
  records: [],
  orders: []
};

// ============================================================
// API 路由
// ============================================================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---------- 用户相关 ----------

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  if (user) {
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } else {
    res.json({ success: false, message: '用户名或密码错误' });
  }
});

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, realname } = req.body;
  if (db.users.find(u => u.username === username)) {
    return res.json({ success: false, message: '用户名已存在' });
  }
  const newUser = {
    id: 'user_' + Date.now(),
    username,
    password,
    realname: realname || username,
    role: 'user',
    memberType: 'normal',
    memberExpire: null,
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  const { password: _, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

// 获取用户信息
app.get('/api/user/info', (req, res) => {
  const userId = req.headers['x-user-id'];
  const user = db.users.find(u => u.id === userId);
  if (user) {
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } else {
    res.json({ success: false, message: '用户不存在' });
  }
});

// ---------- 探店记录相关 ----------

// 获取记录列表
app.get('/api/records', (req, res) => {
  const userId = req.headers['x-user-id'];
  const records = db.records.filter(r => r.userId === userId);
  res.json({ success: true, records });
});

// 添加记录
app.post('/api/records/add', (req, res) => {
  const userId = req.headers['x-user-id'];
  const record = {
    id: 'rec_' + Date.now(),
    userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  db.records.push(record);
  res.json({ success: true, record });
});

// 更新记录
app.post('/api/records/update', (req, res) => {
  const { id, ...updates } = req.body;
  const idx = db.records.findIndex(r => r.id === id);
  if (idx >= 0) {
    db.records[idx] = { ...db.records[idx], ...updates };
    res.json({ success: true, record: db.records[idx] });
  } else {
    res.json({ success: false, message: '记录不存在' });
  }
});

// 删除记录
app.post('/api/records/delete', (req, res) => {
  const { id } = req.body;
  const idx = db.records.findIndex(r => r.id === id);
  if (idx >= 0) {
    db.records.splice(idx, 1);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: '记录不存在' });
  }
});

// ---------- VIP订单相关 ----------

// 创建订单
app.post('/api/vip/order/create', (req, res) => {
  const userId = req.headers['x-user-id'];
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.json({ success: false, message: '用户不存在' });

  const { planType, amount } = req.body;
  const orderNo = 'VIP' + Date.now();

  const order = {
    id: orderNo,
    userId,
    username: user.username,
    planType,
    amount,
    status: 'pending',
    tradeNo: '',
    createdAt: new Date().toISOString(),
    expireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  };

  db.orders.push(order);
  res.json({ success: true, order });
});

// 查询订单
app.get('/api/vip/order/query/:orderId', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (order) {
    res.json({ success: true, order });
  } else {
    res.json({ success: false, message: '订单不存在' });
  }
});

// 支付宝二维码（需要接入真实支付宝SDK）
app.post('/api/pay/alipay/qr', (req, res) => {
  const { outTradeNo, totalAmount, subject } = req.body;

  // TODO: 接入支付宝当面付 SDK
  // 这里返回模拟数据，沙箱模式
  res.json({
    success: true,
    qrCode: `https://api.qrcode.vip/upload?text=https://qr.alipay.com/${outTradeNo}&size=200`,
    tradeNo: 'ALIPAY_' + Date.now(),
    payUrl: `alipay://platformapi/startapp?appId=20000067&url=https://qr.alipay.com/${outTradeNo}`
  });
});

// 支付宝支付查询
app.post('/api/pay/alipay/query', (req, res) => {
  const { outTradeNo } = req.body;
  const order = db.orders.find(o => o.id === outTradeNo);

  // TODO: 接入支付宝查询接口
  if (order && order.status === 'paid') {
    res.json({ status: 'TRADE_SUCCESS', tradeNo: order.tradeNo });
  } else {
    res.json({ status: 'WAIT_BUYER_PAY' });
  }
});

// 支付宝回调
app.post('/pay/notify', (req, res) => {
  // TODO: 处理支付宝回调，更新订单状态
  console.log('支付宝回调:', req.body);
  res.send('success');
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║     探店管理后端服务已启动                 ║
╠═══════════════════════════════════════════╣
║  API地址: http://106.54.171.62:${PORT}        ║
║  前端页面: http://106.54.171.62:${PORT}/src/  ║
╚═══════════════════════════════════════════╝
  `);
});
