<?php
/**
 * =========================================================================
 * PEMUAT SCRIPT.JS TERPROTEKSI (MENCEGAH AKSES LANGSUNG DARI URL BROWSER)
 * =========================================================================
 */
$secDest = strtolower($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');
$secMode = strtolower($_SERVER['HTTP_SEC_FETCH_MODE'] ?? '');
$referer = $_SERVER['HTTP_REFERER'] ?? '';

// Tolak dengan 403 Forbidden jika dibuka langsung sebagai tab/dokumen di browser
if ($secDest === 'document' || $secMode === 'navigate' || empty($referer)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo '403 Forbidden - Access to this file is denied.';
    exit;
}

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
readfile(__DIR__ . '/script.js');
