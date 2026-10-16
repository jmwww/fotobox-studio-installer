<?php

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed'
    ]);
    exit;
}

$filename = isset($_POST['file'])
    ? basename($_POST['file'])
    : '';

if ($filename === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Keine Datei angegeben.'
    ]);
    exit;
}

$eventFile = '/var/www/html/data/studio/active/active-event.json';
$renderer = '/home/fotobox/studio_render_for_print.py';

if (!is_file($eventFile) || !is_readable($eventFile)) {
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Kein aktives Studio-Event.'
    ]);
    exit;
}

$eventJson = file_get_contents($eventFile);
$event = json_decode($eventJson, true);

if (!is_array($event)) {
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Studio-Event ist ungültig.'
    ]);
    exit;
}

$original = '/var/www/html/data/tmp/' . $filename;

if (!is_file($original) || !is_readable($original)) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Originalbild nicht gefunden.'
    ]);
    exit;
}

if (!is_file($renderer) || !is_executable($renderer)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Studio-Renderer nicht verfügbar.'
    ]);
    exit;
}

/*
 * --------------------------------------------------------
 * Multi-Foto-Collage abwarten
 * --------------------------------------------------------
 */
$layoutSlots = $event['design']['layout']['slots'] ?? [];
$requiredLivePhotos = is_array($layoutSlots)
    ? count($layoutSlots)
    : 0;

if ($requiredLivePhotos > 1) {

    $tmpDir = '/var/www/html/data/tmp';
    $extension = pathinfo($filename, PATHINFO_EXTENSION);
    $stem = pathinfo($filename, PATHINFO_FILENAME);

    $waitUntil = microtime(true) + 90.0;

    do {
        $found = 0;

        for ($index = 0; $index < $requiredLivePhotos; $index++) {

            $candidate =
                $tmpDir
                . '/'
                . $stem
                . '-'
                . $index
                . '.'
                . $extension;

            clearstatcache(true, $candidate);

            if (
                is_file($candidate) &&
                is_readable($candidate)
            ) {
                $found++;
            } else {
                break;
            }
        }

        if ($found >= $requiredLivePhotos) {
            break;
        }

        usleep(250000);

    } while (microtime(true) < $waitUntil);
}

$previewDir = '/var/www/html/data/studio/preview';

if (!is_dir($previewDir)) {
    mkdir($previewDir, 02775, true);
}

$output = $previewDir . '/' . $filename;

$cmd =
    '/usr/bin/python3 '
    . escapeshellarg($renderer)
    . ' '
    . escapeshellarg($original)
    . ' '
    . escapeshellarg($output);

$outputLines = [];
$returnValue = 0;

exec(
    $cmd . ' 2>&1',
    $outputLines,
    $returnValue
);

if (
    $returnValue !== 0 ||
    !is_file($output) ||
    filesize($output) <= 0
) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Studio-Vorschau konnte nicht erzeugt werden.',
        'return' => $returnValue,
        'output' => $outputLines
    ]);

    exit;
}

@chmod($output, 0664);

/*
 * Studio-Ergebnis zusätzlich als normales Photobooth-Bild bereitstellen.
 */
$imagesDir = '/var/www/html/data/images';
$thumbsDir = '/var/www/html/data/thumbs';

if (!is_dir($imagesDir)) {
    mkdir($imagesDir, 02775, true);
}

if (!is_dir($thumbsDir)) {
    mkdir($thumbsDir, 02775, true);
}

$imageFile = $imagesDir . '/' . $filename;
$thumbFile = $thumbsDir . '/' . $filename;

if (!copy($output, $imageFile)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Studio-Bild konnte nicht nach /data/images kopiert werden.'
    ]);
    exit;
}

if (!copy($output, $thumbFile)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'studio' => false,
        'error' => 'Studio-Bild konnte nicht nach /data/thumbs kopiert werden.'
    ]);
    exit;
}

@chmod($imageFile, 0664);
@chmod($thumbFile, 0664);

echo json_encode([
    'success' => true,
    'studio' => true,
    'file' => $filename,
    'url' => '/data/studio/preview/' . rawurlencode($filename)
]);
