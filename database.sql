-- =========================================================================
-- FILE SQL UNTUK DI-IMPORT KE PHPMYADMIN DI CPANEL
-- =========================================================================

CREATE TABLE IF NOT EXISTS `resep_cards` (
  `id` VARCHAR(64) NOT NULL,
  `dokter` VARCHAR(150) NOT NULL,
  `resep` TEXT NOT NULL,
  `warna` VARCHAR(20) NOT NULL DEFAULT 'yellow',
  `status` ENUM('new', 'pending', 'onprogress', 'done', 'history') NOT NULL DEFAULT 'new',
  `created_at` BIGINT NOT NULL,
  `pending_at` BIGINT DEFAULT NULL,
  `progress_at` BIGINT DEFAULT NULL,
  `completed_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_completed_at` (`completed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
