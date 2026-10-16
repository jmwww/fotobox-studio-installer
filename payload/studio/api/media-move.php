<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$manifestFile = '/var/www/html/data/studio/library/manifest.json';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Nur POST ist erlaubt.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

$id = trim((string)($input['id'] ?? ''));
$folder = trim((string)($input['folder'] ?? ''));

if ($id === '' || $folder === '') {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'ID oder Zielordner fehlt.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_file($manifestFile)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$manifest = json_decode(
    (string)file_get_contents($manifestFile),
    true
);

if (!is_array($manifest)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest ist ungültig.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($manifest['folders']) || !is_array($manifest['folders'])) {
    $manifest['folders'] = [
        'graphics' => ['Sonstiges'],
        'images' => ['Sonstiges']
    ];
}

$found = false;

foreach (['graphics', 'images'] as $type) {
    if (!isset($manifest[$type]) || !is_array($manifest[$type])) {
        continue;
    }

    foreach ($manifest[$type] as &$asset) {
        if (!is_array($asset) || (string)($asset['id'] ?? '') !== $id) {
            continue;
        }

        if (!in_array($folder, $manifest['folders'][$type] ?? [], true)) {
            http_response_code(400);
            echo json_encode([
                'ok' => false,
                'error' => 'Der Zielordner ist für diesen Medientyp nicht vorhanden.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $asset['folder'] = $folder;
        $found = true;
        break 2;
    }
    unset($asset);
}

if (!$found) {
    http_response_code(404);
    echo json_encode([
        'ok' => false,
        'error' => 'Medium nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$json = json_encode(
    $manifest,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

if ($json === false || file_put_contents($manifestFile, $json . PHP_EOL, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest konnte nicht gespeichert werden.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode([
    'ok' => true,
    'id' => $id,
    'folder' => $folder
], JSON_UNESCAPED_UNICODE);
