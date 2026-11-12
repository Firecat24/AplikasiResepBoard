-- =========================================================================
-- STRUKTUR DATABASE RESEPBOARD DENGAN FASE DISKUSI & NAMA PASIEN
-- =========================================================================

-- 1. OPSI RESET / BUAT TABEL BARU (Data ujicoba akan di-reset):
DROP TABLE IF EXISTS `resep_cards`;

CREATE TABLE `resep_cards` (
  `id` VARCHAR(64) NOT NULL,
  `pasien` VARCHAR(150) NOT NULL DEFAULT '',
  `dokter` VARCHAR(150) NOT NULL DEFAULT '',
  `resep` TEXT NOT NULL,
  `foto` MEDIUMTEXT NULL,
  `keterangan_foto` TEXT NULL,
  `warna` VARCHAR(20) NOT NULL DEFAULT 'yellow',
  `status` ENUM('new', 'pending', 'diskusi', 'onprogress', 'done', 'history') NOT NULL DEFAULT 'new',
  `created_at` BIGINT NOT NULL,
  `pending_at` BIGINT NULL DEFAULT NULL,
  `diskusi_at` BIGINT NULL DEFAULT NULL,
  `progress_at` BIGINT NULL DEFAULT NULL,
  `completed_at` BIGINT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- 2. ALTERNATIVE: JIKA INGIN MEMPERBARUI TABEL LAMA TANPA HAPUS DATA
-- =========================================================================
-- ALTER TABLE `resep_cards`
--   ADD COLUMN `pasien` VARCHAR(150) NOT NULL DEFAULT '' AFTER `id`,
--   ADD COLUMN `foto` MEDIUMTEXT NULL AFTER `resep`,
--   ADD COLUMN `keterangan_foto` TEXT NULL AFTER `foto`,
--   ADD COLUMN `diskusi_at` BIGINT NULL DEFAULT NULL AFTER `pending_at`,
--   MODIFY COLUMN `status` ENUM('new', 'pending', 'diskusi', 'onprogress', 'done', 'history') NOT NULL DEFAULT 'new';
