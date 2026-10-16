<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$libraryDir = '/var/www/html/data/studio/library/graphics';
$manifestFile = '/var/www/html/data/studio/library/manifest.json';

if (!is_dir($libraryDir)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Grafik-Bibliothek nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_file($manifestFile)) {
    echo json_encode([
        'ok' => true,
        'assets' => []
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$json = file_get_contents($manifestFile);

if ($json === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest konnte nicht gelesen werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$manifest = json_decode($json, true);

if (!is_array($manifest)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest enthält kein gültiges JSON.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$assets = [];

foreach (($manifest['graphics'] ?? []) as $asset) {
    if (!is_array($asset)) {
        continue;
    }

    $file = basename((string)($asset['file'] ?? ''));

    if ($file === '') {
        continue;
    }

    $fullPath = $libraryDir . '/' . $file;

    if (!is_file($fullPath)) {
        continue;
    }

    $assets[] = [
        'id' => (string)($asset['id'] ?? ''),
        'name' => (string)($asset['name'] ?? $file),
        'file' => $file,
        'mime' => (string)($asset['mime'] ?? 'application/octet-stream'),
        'bytes' => (int)($asset['bytes'] ?? filesize($fullPath)),
        'type' => 'graphic',
        'url' => '/data/studio/library/graphics/' . rawurlencode($file)
    ];
}

echo json_encode([
    'ok' => true,
    'assets' => $assets
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
