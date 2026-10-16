<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$libraryRoot  = '/var/www/html/data/studio/library';
$manifestFile = $libraryRoot . '/manifest.json';

if (!is_file($manifestFile)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$json = file_get_contents($manifestFile);

if ($json === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest konnte nicht gelesen werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$manifest = json_decode($json, true);

if (!is_array($manifest)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest enthält kein gültiges JSON.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$assets = [];

$collections = [
    'graphics' => 'graphics',
    'images'   => 'images'
];

foreach ($collections as $manifestKey => $type) {
    $directory = $libraryRoot . '/' . $type;

    foreach (($manifest[$manifestKey] ?? []) as $asset) {
        if (!is_array($asset)) {
            continue;
        }

        $file = basename((string)($asset['file'] ?? ''));

        if ($file === '') {
            continue;
        }

        $fullPath = $directory . '/' . $file;

        if (!is_file($fullPath)) {
            continue;
        }

        $assets[] = [
              'id'     => (string)($asset['id'] ?? ''),
              'name'   => (string)($asset['name'] ?? $file),
              'folder' => (string)($asset['folder'] ?? 'Sonstiges'),
              'file'   => $file,
              'mime'   => (string)($asset['mime'] ?? 'application/octet-stream'),
              'bytes'  => (int)($asset['bytes'] ?? filesize($fullPath)),
              'type'   => rtrim($type, 's'),
              'url'    => '/data/studio/library/' . $type . '/' . rawurlencode($file)
          ];
    }
}

echo json_encode([
    'ok'      => true,
    'version' => (int)($manifest['version'] ?? 1),
    'folders' => [
        'graphics' => array_values($manifest['folders']['graphics'] ?? ['Sonstiges']),
        'images'   => array_values($manifest['folders']['images'] ?? ['Sonstiges'])
    ],
    'assets'  => $assets
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
