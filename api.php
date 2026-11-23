<?php
/**
 * =========================================================================
 * KONEKSI API & AUTENTIKASI LOGIN SERVER-SIDE (AMAN DARI PUBLIK)
 * =========================================================================
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

$DB_HOST = 'localhost';
$DB_NAME = '';
$DB_USER = '';
$DB_PASS = '';
$USERS = [];

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

// Fallback akun di sisi server PHP jika config.php di cPanel belum di-update
if (empty($USERS)) {
    $USERS = [
        [
            'username' => 'dokter_umum',
            'password' => base64_decode('RE1VX2Rva3Rlcl91bXVt'),
            'nama' => 'Dokter Umum',
            'role' => 'dokter',
            'roleLabel' => 'Dokter Umum',
            'warnaCard' => 'yellow'
        ],
        [
            'username' => 'dokter_anak',
            'password' => base64_decode('ZG9rdGVyX2FuYWtfRE1V'),
            'nama' => 'Dokter Anak',
            'role' => 'dokter',
            'roleLabel' => 'Dokter Anak',
            'warnaCard' => 'red'
        ],
        [
            'username' => 'apotek',
            'password' => base64_decode('c3RhZmZfYXBvdGVrX0RNVQ=='),
            'nama' => 'Staff Apotek',
            'role' => 'apotek',
            'roleLabel' => 'Staff Obat / Apotek',
            'warnaCard' => 'blue'
        ]
    ];
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Tolak jika seseorang mencoba membuka URL /api.php langsung dari address bar browser
$requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
if (strtolower($requestedWith) !== 'xmlhttprequest') {
    http_response_code(403);
    echo json_encode([
        'ok' => false,
        'error' => '403 Forbidden - Akses langsung tidak diizinkan.'
    ]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$input = null;
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
}

// =========================================================================
// HELPER PENGATURAN NOTIFIKASI PER AKUN (DISIMPAN DI notif_settings.json)
// =========================================================================
function getNotifSettingsFilePath() {
    return __DIR__ . '/notif_settings.json';
}

function readAllNotifSettings() {
    $file = getNotifSettingsFilePath();
    if (!file_exists($file) || !is_readable($file)) {
        return [];
    }
    $raw = @file_get_contents($file);
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function writeAllNotifSettings($all) {
    $file = getNotifSettingsFilePath();
    $json = json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return file_put_contents($file, $json . "\n", LOCK_EX) !== false;
}

function isKnownUsername($USERS, $username) {
    foreach ($USERS as $u) {
        if ($u['username'] === $username) return true;
    }
    return false;
}

// =========================================================================
// POST (action = login): Verifikasi Login di Server (Tanpa membocorkan password ke JS)
// =========================================================================
if ($method === 'POST' && isset($input['action']) && $input['action'] === 'login') {
    $uName = trim($input['username'] ?? '');
    $uPass = trim($input['password'] ?? '');

    foreach ($USERS as $u) {
        if ($u['username'] === $uName && $u['password'] === $uPass) {
            $allNotif = readAllNotifSettings();
            echo json_encode([
                'ok' => true,
                'user' => [
                    'username' => $u['username'],
                    'nama' => $u['nama'],
                    'role' => $u['role'],
                    'roleLabel' => $u['roleLabel'],
                    'warnaCard' => $u['warnaCard']
                ],
                'notifSettings' => $allNotif[$u['username']] ?? null
            ]);
            exit;
        }
    }

    http_response_code(401);
    echo json_encode([
        'ok' => false,
        'error' => 'Username atau password salah!'
    ]);
    exit;
}

// =========================================================================
// POST (action = get_notif_settings / save_notif_settings): Pengaturan Notif Per Akun
// =========================================================================
if ($method === 'POST' && isset($input['action']) && $input['action'] === 'get_notif_settings') {
    $uName = trim($input['username'] ?? '');
    if ($uName === '' || !isKnownUsername($USERS, $uName)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Akun tidak dikenali']);
        exit;
    }
    $allNotif = readAllNotifSettings();
    echo json_encode([
        'ok' => true,
        'settings' => $allNotif[$uName] ?? null
    ]);
    exit;
}

if ($method === 'POST' && isset($input['action']) && $input['action'] === 'save_notif_settings') {
    $uName = trim($input['username'] ?? '');
    $settings = $input['settings'] ?? null;
    if ($uName === '' || !isKnownUsername($USERS, $uName) || !is_array($settings)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Data pengaturan tidak valid']);
        exit;
    }

    $allNotif = readAllNotifSettings();
    $allNotif[$uName] = $settings;
    if (!writeAllNotifSettings($allNotif)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Gagal menulis file notif_settings.json']);
        exit;
    }

    echo json_encode([
        'ok' => true,
        'settings' => $settings
    ]);
    exit;
}

// =========================================================================
// KONEKSI DATABASE MYSQL CPANEL
// =========================================================================
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
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Database belum terhubung'
    ]);
    exit;
}

// =========================================================================
// AUTO-UPDATE STRUKTUR TABEL (Jika kolom baru belum dibuat di phpMyAdmin)
// =========================================================================
function ensureSchema($pdo) {
    $needed = [
        'pasien'          => "VARCHAR(150) NOT NULL DEFAULT ''",
        'foto'            => "MEDIUMTEXT NULL",
        'keterangan_foto' => "TEXT NULL",
        'chat_diskusi'    => "MEDIUMTEXT NULL",
        'sudah_bayar'     => "TINYINT(1) NOT NULL DEFAULT 0",
        'diskusi_at'      => "BIGINT NULL DEFAULT NULL"
    ];
    $existing = [];
    foreach ($pdo->query("SHOW COLUMNS FROM `resep_cards`")->fetchAll() as $col) {
        $existing[$col['Field']] = $col['Type'];
    }
    foreach ($needed as $name => $def) {
        if (!isset($existing[$name])) {
            $pdo->exec("ALTER TABLE `resep_cards` ADD COLUMN `$name` $def");
        }
    }
    if (isset($existing['status']) && strpos($existing['status'], 'diskusi') === false) {
        $pdo->exec("ALTER TABLE `resep_cards` MODIFY COLUMN `status` ENUM('new','pending','diskusi','onprogress','done','history') NOT NULL DEFAULT 'new'");
    }
}

if ($method === 'POST') {
    try {
        ensureSchema($pdo);
    } catch (PDOException $e) {
        // Lanjutkan saja; error detail akan muncul saat upsert
    }
}

// =========================================================================
// GET: Ambil seluruh data Card & History dari Database MySQL
// =========================================================================
if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM `resep_cards` ORDER BY `created_at` DESC");
    $rows = $stmt->fetchAll();

    $cards = array_map(function ($r) {
        $chatRaw = $r['chat_diskusi'] ?? null;
        $chatList = [];
        if ($chatRaw) {
            $decoded = json_decode($chatRaw, true);
            if (is_array($decoded)) {
                $chatList = $decoded;
            }
        }
        return [
            'id' => $r['id'],
            'pasien' => $r['pasien'] ?? '',
            'dokter' => $r['dokter'],
            'resep' => $r['resep'],
            'foto' => $r['foto'] ?? null,
            'keteranganFoto' => $r['keterangan_foto'] ?? '',
            'chatDiskusi' => $chatList,
            'sudahBayar' => !empty($r['sudah_bayar']),
            'warna' => $r['warna'],
            'status' => $r['status'],
            'createdAt' => (int) $r['created_at'],
            'pendingAt' => $r['pending_at'] !== null ? (int) $r['pending_at'] : null,
            'diskusiAt' => isset($r['diskusi_at']) && $r['diskusi_at'] !== null ? (int) $r['diskusi_at'] : null,
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
    if (!$input || !isset($input['action'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Request tidak valid']);
        exit;
    }

    $action = $input['action'];

    if ($action === 'upsert' && isset($input['card'])) {
        $c = $input['card'];
        $chatJson = (isset($c['chatDiskusi']) && is_array($c['chatDiskusi']))
            ? json_encode($c['chatDiskusi'], JSON_UNESCAPED_UNICODE)
            : null;
        $stmt = $pdo->prepare("
            INSERT INTO `resep_cards`
              (`id`, `pasien`, `dokter`, `resep`, `foto`, `keterangan_foto`, `chat_diskusi`, `sudah_bayar`, `warna`, `status`, `created_at`, `pending_at`, `diskusi_at`, `progress_at`, `completed_at`)
            VALUES
              (:id, :pasien, :dokter, :resep, :foto, :keterangan_foto, :chat_diskusi, :sudah_bayar, :warna, :status, :created_at, :pending_at, :diskusi_at, :progress_at, :completed_at)
            ON DUPLICATE KEY UPDATE
              `pasien` = VALUES(`pasien`),
              `dokter` = VALUES(`dokter`),
              `resep` = VALUES(`resep`),
              `foto` = VALUES(`foto`),
              `keterangan_foto` = VALUES(`keterangan_foto`),
              `chat_diskusi` = COALESCE(VALUES(`chat_diskusi`), `chat_diskusi`),
              `sudah_bayar` = VALUES(`sudah_bayar`),
              `warna` = VALUES(`warna`),
              `status` = VALUES(`status`),
              `created_at` = VALUES(`created_at`),
              `pending_at` = VALUES(`pending_at`),
              `diskusi_at` = VALUES(`diskusi_at`),
              `progress_at` = VALUES(`progress_at`),
              `completed_at` = VALUES(`completed_at`)
        ");

        try {
        $stmt->execute([
            ':id' => $c['id'],
            ':pasien' => trim($c['pasien'] ?? ''),
            ':dokter' => $c['dokter'],
            ':resep' => $c['resep'],
            ':foto' => !empty($c['foto']) ? $c['foto'] : null,
            ':keterangan_foto' => isset($c['keteranganFoto']) ? trim($c['keteranganFoto']) : null,
            ':chat_diskusi' => $chatJson,
            ':sudah_bayar' => !empty($c['sudahBayar']) ? 1 : 0,
            ':warna' => $c['warna'] ?? 'yellow',
            ':status' => $c['status'] ?? 'new',
            ':created_at' => $c['createdAt'] ?? (round(microtime(true) * 1000)),
            ':pending_at' => $c['pendingAt'] ?? null,
            ':diskusi_at' => $c['diskusiAt'] ?? null,
            ':progress_at' => $c['progressAt'] ?? null,
            ':completed_at' => $c['completedAt'] ?? null
        ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Gagal simpan: ' . $e->getMessage()]);
            exit;
        }

        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'send_chat' && isset($input['cardId']) && isset($input['message'])) {
        $cardId = trim($input['cardId']);
        $msg = $input['message'];
        $msgText = trim($msg['text'] ?? '');
        if ($cardId === '' || $msgText === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Pesan chat tidak boleh kosong']);
            exit;
        }

        $cleanMsg = [
            'id' => (string) ($msg['id'] ?? ('msg-' . round(microtime(true) * 1000))),
            'sender' => trim($msg['sender'] ?? 'User'),
            'role' => trim($msg['role'] ?? ''),
            'text' => $msgText,
            'time' => (int) ($msg['time'] ?? round(microtime(true) * 1000))
        ];

        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("SELECT `chat_diskusi` FROM `resep_cards` WHERE `id` = :id FOR UPDATE");
            $stmt->execute([':id' => $cardId]);
            $row = $stmt->fetch();
            if (!$row) {
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['ok' => false, 'error' => 'Card tidak ditemukan']);
                exit;
            }

            $list = [];
            if (!empty($row['chat_diskusi'])) {
                $decoded = json_decode($row['chat_diskusi'], true);
                if (is_array($decoded)) {
                    $list = $decoded;
                }
            }

            // Cegah duplikat jika pesan dengan ID sama dikirim ulang
            $exists = false;
            foreach ($list as $item) {
                if (($item['id'] ?? '') === $cleanMsg['id']) {
                    $exists = true;
                    break;
                }
            }
            if (!$exists) {
                $list[] = $cleanMsg;
            }

            $upd = $pdo->prepare("UPDATE `resep_cards` SET `chat_diskusi` = :chat WHERE `id` = :id");
            $upd->execute([
                ':chat' => json_encode($list, JSON_UNESCAPED_UNICODE),
                ':id' => $cardId
            ]);
            $pdo->commit();

            echo json_encode(['ok' => true, 'chatDiskusi' => $list]);
            exit;
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Gagal kirim chat: ' . $e->getMessage()]);
            exit;
        }
    }

    if ($action === 'delete' && isset($input['ids']) && is_array($input['ids'])) {
        $ids = $input['ids'];
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
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
