<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$libraryRoot  = '/var/www/html/data/studio/library';
$manifestFile = $libraryRoot . '/manifest.json';
$maxBytes     = 10 * 1024 * 1024;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Nur POST ist erlaubt.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$type = (string)($_POST['type'] ?? '');

if (!in_array($type, ['graphics', 'images'], true)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Ungültiger Medientyp.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$folder = trim((string)($_POST['folder'] ?? 'Sonstiges'));
$folder = preg_replace('/[^a-zA-Z0-9ÄÖÜäöüß _-]+/u', '', $folder);
$folder = trim($folder);

if ($folder === '') {
    $folder = 'Sonstiges';
}

$libraryDir = $libraryRoot . '/' . $type;

if (!is_dir($libraryDir) && !mkdir($libraryDir, 0775, true) && !is_dir($libraryDir)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medienordner konnte nicht angelegt werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Keine Datei empfangen.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$file = $_FILES['file'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Upload fehlgeschlagen. Fehlercode: ' . (int)$file['error']
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($file['size'] ?? 0) <= 0 || $file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Die Datei muss größer als 0 und höchstens 10 MB groß sein.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$tmp = (string)$file['tmp_name'];
$imageInfo = @getimagesize($tmp);

if ($imageInfo === false) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Die Datei ist kein gültiges Bild.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$mimeMap = [
    IMAGETYPE_PNG  => 'image/png',
    IMAGETYPE_JPEG => 'image/jpeg',
    IMAGETYPE_WEBP => 'image/webp'
];

$imageType = $imageInfo[2] ?? 0;

if (!isset($mimeMap[$imageType])) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Erlaubt sind nur PNG, JPG/JPEG und WEBP.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$mime = $mimeMap[$imageType];

$originalName = basename((string)($file['name'] ?? 'Medium'));

$extension = match ($mime) {
    'image/png'  => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
    default      => 'img'
};

$baseName = pathinfo($originalName, PATHINFO_FILENAME);
$baseName = preg_replace('/[^a-zA-Z0-9_-]+/', '-', $baseName);
$baseName = trim($baseName, '-_');

if ($baseName === '') {
    $baseName = $type === 'graphics' ? 'grafik' : 'bild';
}

$id = ($type === 'graphics' ? 'graphic-' : 'image-') . bin2hex(random_bytes(6));
$fileName = $baseName . '-' . substr($id, strrpos($id, '-') + 1) . '.' . $extension;
$target = $libraryDir . '/' . $fileName;

if (!move_uploaded_file($tmp, $target)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medium konnte nicht gespeichert werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$manifest = [
    'version' => 1,
    'graphics' => [],
    'images' => []
];

if (is_file($manifestFile)) {
    $manifestJson = file_get_contents($manifestFile);
    if ($manifestJson !== false) {
        $decoded = json_decode($manifestJson, true);
        if (is_array($decoded)) {
            $manifest = $decoded;
        }
    }
}

$manifest['version'] ??= 1;
$manifest['graphics'] ??= [];
$manifest['images'] ??= [];

$manifest[$type][] = [
    'id' => $id,
    'name' => $originalName,
    'folder' => $folder,
    'file' => $fileName,
    'mime' => $mime,
    'bytes' => filesize($target),
    'type' => $type === 'graphics' ? 'graphic' : 'image'
];

$manifestJson = json_encode(
    $manifest,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
);

if ($manifestJson === false || file_put_contents($manifestFile, $manifestJson . PHP_EOL, LOCK_EX) === false) {
    @unlink($target);
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest konnte nicht aktualisiert werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'asset' => [
        'id' => $id,
        'name' => $originalName,
        'folder' => $folder,
        'file' => $fileName,
        'mime' => $mime,
        'bytes' => filesize($target),
        'type' => $type === 'graphics' ? 'graphic' : 'image',
        'url' => '/data/studio/library/' . $type . '/' . rawurlencode($fileName)
    ]
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
