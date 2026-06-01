CREATE TABLE IF NOT EXISTS `KioskStatuses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kiosk_id` VARCHAR(100) NOT NULL UNIQUE,
  `label` VARCHAR(255),
  `status` VARCHAR(50) NOT NULL DEFAULT 'ONLINE' COMMENT 'e.g., ONLINE, DEGRADED, MAINTENANCE, OFFLINE',
  `app_version` VARCHAR(100),
  `ip_address` VARCHAR(45),
  `user_agent` VARCHAR(512),
  `last_seen_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_kiosk_status_last_seen` (`last_seen_at`),
  INDEX `idx_kiosk_status_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
