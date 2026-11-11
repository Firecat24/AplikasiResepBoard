<?php
/**
 * =========================================================================
 * KONEKSI API KE DATABASE MYSQL CPANEL
 * Kredensial database diambil dari file config.php (agar aman saat push/pull Git)
 * =========================================================================
 */
$DB_HOST = 'localhost';
$DB_NAME = '';
$DB_USER = '';
$DB_PASS = '';

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );

    // Otomatis buat tabel jika belum ada di database
    $pdo->exec("
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
    ");
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Database belum terhubung: ' . $e->getMessage()
    ]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// =========================================================================
// GET: Ambil seluruh data Card & History dari Database MySQL
// =========================================================================
if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM `resep_cards` ORDER BY `created_at` DESC");
    $rows = $stmt->fetchAll();

    $cards = array_map(function ($r) {
        return [
            'id' => $r['id'],
            'dokter' => $r['dokter'],
            'resep' => $r['resep'],
            'warna' => $r['warna'],
            'status' => $r['status'],
            'createdAt' => (int) $r['created_at'],
            'pendingAt' => $r['pending_at'] !== null ? (int) $r['pending_at'] : null,
            'progressAt' => $r['progress_at'] !== null ? (int) $r['progress_at'] : null,
            'completedAt' => $r['completed_at'] !== null ? (int) $r['completed_at'] : null
        ];
    }, $rows);

    echo json_encode(['ok' => true, 'cards' => $cards]);
    exit;
}

// =========================================================================
// POST: Simpan / Update / Hapus Card di Database MySQL
// =========================================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['action'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Request tidak valid']);
        exit;
    }

    $action = $input['action'];

    if ($action === 'upsert' && isset($input['card'])) {
        $c = $input['card'];
        $stmt = $pdo->prepare("
            INSERT INTO `resep_cards`
              (`id`, `dokter`, `resep`, `warna`, `status`, `created_at`, `pending_at`, `progress_at`, `completed_at`)
            VALUES
              (:id, :dokter, :resep, :warna, :status, :created_at, :pending_at, :progress_at, :completed_at)
            ON DUPLICATE KEY UPDATE
              `dokter` = VALUES(`dokter`),
              `resep` = VALUES(`resep`),
              `warna` = VALUES(`warna`),
              `status` = VALUES(`status`),
              `created_at` = VALUES(`created_at`),
              `pending_at` = VALUES(`pending_at`),
              `progress_at` = VALUES(`progress_at`),
              `completed_at` = VALUES(`completed_at`)
        ");

        $stmt->execute([
            ':id' => $c['id'],
            ':dokter' => $c['dokter'],
            ':resep' => $c['resep'],
            ':warna' => $c['warna'] ?? 'yellow',
            ':status' => $c['status'] ?? 'new',
            ':created_at' => $c['createdAt'] ?? (round(microtime(true) * 1000)),
            ':pending_at' => $c['pendingAt'] ?? null,
            ':progress_at' => $c['progressAt'] ?? null,
            ':completed_at' => $c['completedAt'] ?? null
        ]);

        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'delete' && isset($input['ids']) && is_array($input['ids'])) {
        $ids = $input['ids'];
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            // Pastikan hanya menghapus yang masih di new atau pending
            $stmt = $pdo->prepare("
                DELETE FROM `resep_cards`
                WHERE `id` IN ($placeholders) AND `status` IN ('new', 'pending')
            ");
            $stmt->execute($ids);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    echo json_encode(['ok' => false, 'error' => 'Action tidak dikenali']);
    exit;
}
