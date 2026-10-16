<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$libraryRoot  = '/var/www/html/data/studio/library';
$manifestFile = $libraryRoot . '/manifest.json';
$eventsDir    = '/var/www/html/data/studio/events';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Nur POST ist erlaubt.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$input = json_decode((string)file_get_contents('php://input'), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Ungültiges JSON.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$id = trim((string)($input['id'] ?? ''));

if ($id === '') {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-ID fehlt.'
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

$manifestJson = file_get_contents($manifestFile);
$manifest = json_decode((string)$manifestJson, true);

if (!is_array($manifest)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Medien-Manifest enthält kein gültiges JSON.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$manifest['graphics'] ??= [];
$manifest['images'] ??= [];

$found = null;
$foundType = null;
$foundIndex = null;

foreach (['graphics', 'images'] as $type) {
    foreach ($manifest[$type] as $index => $asset) {
        if (is_array($asset) && (string)($asset['id'] ?? '') === $id) {
            $found = $asset;
            $foundType = $type;
            $foundIndex = $index;
            break 2;
        }
    }
}

if (!is_array($found)) {
    http_response_code(404);
    echo json_encode([
        'ok' => false,
        'error' => 'Medium nicht gefunden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$file = basename((string)($found['file'] ?? ''));

if ($file === '') {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Ungültiger Dateiname im Manifest.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$assetPath = $libraryRoot . '/' . $foundType . '/' . $file;
$assetUrl = '/data/studio/library/' . $foundType . '/' . $file;

/*
 * Sicherheitsprüfung:
 * Ein Medium darf nicht gelöscht werden, solange ein Event darauf verweist.
 */
$usedBy = [];

if (is_dir($eventsDir)) {
    foreach (glob($eventsDir . '/*.json') ?: [] as $eventFile) {
        $eventJson = file_get_contents($eventFile);

        if ($eventJson === false) {
            continue;
        }

        $event = json_decode($eventJson, true);

        if (!is_array($event)) {
            continue;
        }

        $eventId = (string)($event['id'] ?? basename($eventFile, '.json'));
        $eventName = (string)($event['name'] ?? $eventId);

        $serialized = json_encode(
            $event,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        if (
            strpos((string)$serialized, '"' . $id . '"') !== false ||
            strpos((string)$serialized, $file) !== false ||
            strpos((string)$serialized, $assetUrl) !== false
        ) {
            $usedBy[] = [
                'id' => $eventId,
                'name' => $eventName
            ];
        }
    }
}

if ($usedBy) {
    http_response_code(409);
    echo json_encode([
        'ok' => false,
        'error' => 'Das Medium wird noch von mindestens einem Event verwendet.',
        'usedBy' => $usedBy
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

unset($manifest[$foundType][$foundIndex]);
$manifest[$foundType] = array_values($manifest[$foundType]);

$newManifestJson = json_encode(
    $manifest,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
);

if ($newManifestJson === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Manifest konnte nicht erzeugt werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (
    is_file($assetPath) &&
    !unlink($assetPath)
) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Die Mediendatei konnte nicht gelöscht werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (file_put_contents($manifestFile, $newManifestJson . PHP_EOL, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Das Manifest konnte nicht aktualisiert werden.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'deleted' => [
        'id' => $id,
        'name' => (string)($found['name'] ?? $file),
        'type' => $foundType,
        'file' => $file
    ]
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
