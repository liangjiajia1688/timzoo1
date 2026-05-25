-- ============================================================
-- TimZoo 探店管理 - D1 数据库初始化脚本
-- 使用方式: npx wrangler d1 execute timzoo-db --local --file=./schema.sql
--          npx wrangler d1 execute timzoo-db --remote --file=./schema.sql
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  realname     TEXT DEFAULT '',
  role         TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  memberType   TEXT DEFAULT 'normal' CHECK(memberType IN ('normal', 'vip')),
  memberExpire TEXT,
  phone        TEXT,
  avatar       TEXT,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 探店记录表
CREATE TABLE IF NOT EXISTS records (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL,
  storeName    TEXT NOT NULL DEFAULT '',
  address      TEXT DEFAULT '',
  category     TEXT DEFAULT 'explore',
  date         TEXT NOT NULL DEFAULT '',
  arriveTime   TEXT,
  teamMembers  TEXT,
  feeStatus    TEXT DEFAULT 'pending_fee' CHECK(feeStatus IN ('pending_fee', 'settled')),
  photoStatus  TEXT DEFAULT 'pending_shoot' CHECK(photoStatus IN ('pending_shoot', 'photo-done')),
  actualAmount REAL DEFAULT 0,
  fee          REAL DEFAULT 0,
  actualFee    REAL DEFAULT 0,
  notes        TEXT DEFAULT '',
  status       TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- VIP 订单表
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL,
  username    TEXT NOT NULL DEFAULT '',
  planType    TEXT NOT NULL CHECK(planType IN ('month', 'year', 'forever')),
  amount      REAL NOT NULL DEFAULT 0,
  status      TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired', 'cancelled')),
  tradeNo     TEXT DEFAULT '',
  payUrl      TEXT DEFAULT '',
  expireAt    TEXT,
  paidAt      TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_records_userId ON records(userId);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_users_memberType ON users(memberType);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- 初始数据：插入默认管理员账号
-- 账号: dinice / 密码: dinice98
-- ============================================================
INSERT OR IGNORE INTO users (id, username, password, realname, role, memberType)
VALUES ('user_admin_001', 'dinice', 'dinice98', '管理员', 'admin', 'vip');
