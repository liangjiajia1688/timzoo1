-- ============================================================
-- TimZoo D1 数据库迁移：photoStatus 三态 → 二态
--
-- 变更内容：
--   1. CHECK 约束从 IN('pending_shoot','photo-done')
--      改为 IN('pending_shoot', 'published')
--   2. 已有数据中 photoStatus='photo-demo' 的记录
--      全部更新为 'published'
--
-- 使用方式:
--   npx wrangler d1 execute timzoo-db --remote --file=./migrate_photo2status.sql
-- ============================================================

BEGIN TRANSACTION;

-- 1. 创建新表（二态约束 + 对齐当前实际字段）
CREATE TABLE IF NOT EXISTS records_new (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL,
  storeName    TEXT NOT NULL DEFAULT '',
  address      TEXT DEFAULT '',
  category     TEXT DEFAULT 'explore',
  date         TEXT NOT NULL DEFAULT '',
  arriveTime   TEXT,
  teamMembers  TEXT,
  feeStatus    TEXT DEFAULT 'pending_fee' CHECK(feeStatus IN ('pending_fee', 'settled')),
  photoStatus  TEXT DEFAULT 'pending_shoot' CHECK(photoStatus IN ('pending_shoot', 'published')),
  actualAmount REAL DEFAULT 0,
  fee          REAL DEFAULT 0,
  actualFee    REAL DEFAULT 0,
  notes        TEXT DEFAULT '',
  status       TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. 迁移数据（photo-done → published 映射）
INSERT INTO records_new
  SELECT id, userId, storeName, address, category, date, arriveTime, teamMembers,
         feeStatus,
         CASE WHEN photoStatus = 'photo-done' THEN 'published' ELSE photoStatus END,
         actualAmount, fee, actualFee, notes, status, createdAt, updatedAt
  FROM records;

-- 3. 删除旧表
DROP TABLE records;

-- 4. 重命名新表
ALTER TABLE records_new RENAME TO records;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_records_userId ON records(userId);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);

COMMIT;
