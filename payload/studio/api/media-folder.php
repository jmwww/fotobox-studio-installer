<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Nur POST ist erlaubt.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$libraryRoot  = '/var/www/html/data/studio/library';
$manifestFile = $libraryRoot . '/manifest.json';

$input = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Ungültige Anfrage.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$type = (string)($input['type'] ?? '');
$folder = trim((string)($input['folder'] ?? ''));

if (!in_array($type, ['graphics', 'images'], true)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Ungültiger Medientyp.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($folder === '') {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Ordnername fehlt.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (mb_strlen($folder) > 50) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Der Ordnername darf maximal 50 Zeichen haben.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (preg_match('/[\r\n\t]/u', $folder)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Der Ordnername enthält ungültige Zeichen.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_file($manifestFile)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$json = file_get_contents($manifestFile);
$manifest = json_decode((string)$json, true);

if (!is_array($manifest)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest enthält kein gültiges JSON.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!isset($manifest['folders']) || !is_array($manifest['folders'])) {
    $manifest['folders'] = [
        'graphics' => ['Sonstiges'],
        'images'   => ['Sonstiges']
    ];
}

if (!isset($manifest['folders']['graphics']) || !is_array($manifest['folders']['graphics'])) {
    $manifest['folders']['graphics'] = ['Sonstiges'];
}

if (!isset($manifest['folders']['images']) || !is_array($manifest['folders']['images'])) {
    $manifest['folders']['images'] = ['Sonstiges'];
}

$existing = $manifest['folders'][$type];

foreach ($existing as $existingFolder) {
    if (mb_strtolower(trim((string)$existingFolder)) === mb_strtolower($folder)) {
        echo json_encode([
            'ok' => true,
            'created' => false,
            'folder' => (string)$existingFolder,
            'folders' => array_values($existing)
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

$existing[] = $folder;

$manifest['folders'][$type] = array_values(
    array_unique($existing)
);

$encoded = json_encode(
    $manifest,
    JSON_PRETTY_PRINT |
    JSON_UNESCAPED_UNICODE |
    JSON_UNESCAPED_SLASHES
);

if ($encoded === false || file_put_contents($manifestFile, $encoded . PHP_EOL, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest konnte nicht gespeichert werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'created' => true,
    'folder' => $folder,
    'folders' => $manifest['folders'][$type]
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
