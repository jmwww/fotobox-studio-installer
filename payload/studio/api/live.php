<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$id = (string)($_GET['id'] ?? '');

if ($id === '') {
    respond(['ok' => false, 'error' => 'Event-ID fehlt.'], 400);
}

if ($method === 'GET') {
    $event = read_event($id);
    respond([
        'ok' => true,
        'eventId' => $id,
        'updatedAt' => $event['updatedAt'] ?? null,
        'event' => $event
    ]);
}

if ($method === 'POST') {
    $patch = read_json_body();
    $event = read_event($id);

    if (isset($patch['design']) && is_array($patch['design'])) {
        $event['design'] = array_replace_recursive($event['design'] ?? [], $patch['design']);

        if (array_key_exists('graphics', $patch['design']) && is_array($patch['design']['graphics'])) {
            $event['design']['graphics'] = $patch['design']['graphics'];
        }
    if (
    isset($patch['design']['layout']) &&
    is_array($patch['design']['layout']) &&
    array_key_exists('slots', $patch['design']['layout']) &&
    is_array($patch['design']['layout']['slots'])
) {
    $event['design']['layout']['slots'] = $patch['design']['layout']['slots'];
  }
}
    foreach (['name','date','format','contact','status'] as $key) {
        if (array_key_exists($key, $patch)) {
            $event[$key] = $patch[$key];
        }
    }

    write_event($event);

    // Bei direkter Bearbeitung an der Fotobox das gerade bearbeitete
    // Event sofort als aktives Studio-Event übernehmen.
    if ((string)($event['status'] ?? '') !== 'ready') {
        $event['status'] = 'ready';
        $event = write_event($event);
    }

    $active_dir = '/var/www/html/data/studio/active';
    $active_file = $active_dir . '/active-event.json';
    $temp_file = $active_dir . '/.active-event.tmp-' . getmypid();

    if (!is_dir($active_dir) && !mkdir($active_dir, 0775, true) && !is_dir($active_dir)) {
        respond(['ok' => false, 'error' => 'Active-Verzeichnis konnte nicht angelegt werden.'], 500);
    }

    $json = json_encode(
        $event,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
    );

    if ($json === false) {
        respond(['ok' => false, 'error' => 'Aktives Event konnte nicht als JSON erzeugt werden.'], 500);
    }

    $json .= PHP_EOL;

    if (file_put_contents($temp_file, $json, LOCK_EX) === false) {
        @unlink($temp_file);
        respond(['ok' => false, 'error' => 'Aktives Event konnte nicht geschrieben werden.'], 500);
    }

    if (!rename($temp_file, $active_file)) {
        @unlink($temp_file);
        respond(['ok' => false, 'error' => 'Aktives Event konnte nicht übernommen werden.'], 500);
    }

    @chmod($active_file, 0664);

    respond([
        'ok' => true,
        'updatedAt' => $event['updatedAt'],
        'activated' => true
    ]);
}

respond(['ok' => false, 'error' => 'Unbekannte Live-API-Anfrage.'], 400);
