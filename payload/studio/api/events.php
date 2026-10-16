<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = $_GET['action'] ?? '';

ensure_events_dir();

if ($method === 'GET' && $action === 'list') {
    $events = [];
    foreach (glob(events_dir() . '/*.json') ?: [] as $file) {
        $data = json_decode((string)file_get_contents($file), true);
        if (is_array($data)) $events[] = $data;
    }
    usort($events, static fn(array $a, array $b) => strcmp((string)($b['updatedAt'] ?? ''), (string)($a['updatedAt'] ?? '')));
    respond(['ok' => true, 'events' => $events]);
}

if ($method === 'GET' && $action === 'get') {
    $id = (string)($_GET['id'] ?? '');
    respond(['ok' => true, 'event' => read_event($id)]);
}

// Resolve an event by its four-digit PIN. The PIN is the human-friendly
// pairing key used by both the smartphone and the physical box.
if ($method === 'GET' && $action === 'by-pin') {
    $pin = preg_replace('/\D+/', '', (string)($_GET['pin'] ?? ''));
    if (!preg_match('/^\d{4}$/', $pin)) {
        respond(['ok' => false, 'error' => 'PIN muss vierstellig sein.'], 400);
    }
    foreach (glob(events_dir() . '/*.json') ?: [] as $file) {
        $data = json_decode((string)file_get_contents($file), true);
        if (is_array($data) && (string)($data['pin'] ?? '') === $pin) {
            respond(['ok' => true, 'event' => $data]);
        }
    }
    respond(['ok' => false, 'error' => 'PIN nicht gefunden.'], 404);
}

if ($method === 'POST' && $action === 'save') {
    $event = read_json_body();
    if (empty($event['id'])) respond(['ok' => false, 'error' => 'Event-ID fehlt.'], 400);
    write_event($event);
    respond(['ok' => true, 'event' => read_event((string)$event['id'])]);
}

if ($method === 'POST' && $action === 'delete') {
    $data = read_json_body();
    $id = (string)($data['id'] ?? '');
    $path = event_path($id);
    if (is_file($path) && !unlink($path)) respond(['ok' => false, 'error' => 'Event konnte nicht gelöscht werden.'], 500);
    respond(['ok' => true]);
}

respond(['ok' => false, 'error' => 'Unbekannte API-Anfrage.'], 400);
