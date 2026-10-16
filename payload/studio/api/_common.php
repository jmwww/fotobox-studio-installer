<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

/*
 * Persistent Studio storage.
 *
 * Windows demo: start_studio.bat sets FOTOBOX_STUDIO_DATA to a shared
 * directory under %LOCALAPPDATA%, so all extracted Studio versions use the
 * same events. Raspberry Pi can set the same variable to its own data path.
 */
function data_root(): string {
    $configured = getenv('FOTOBOX_STUDIO_DATA');
    if ($configured !== false && trim($configured) !== '') {
        return rtrim(str_replace('\\', '/', $configured), '/');
    }

    $localAppData = getenv('LOCALAPPDATA');
    if ($localAppData !== false && trim($localAppData) !== '') {
        return rtrim(str_replace('\\', '/', $localAppData), '/') . '/FotoboxStudio/data';
    }

    return '/var/www/html/data/studio';
}

function events_dir(): string {
    return data_root() . '/events';
}

function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function ensure_events_dir(): void {
    $dir = events_dir();
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        respond(['ok' => false, 'error' => 'Event-Verzeichnis konnte nicht angelegt werden.'], 500);
    }
}

function event_path(string $id): string {
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) {
        respond(['ok' => false, 'error' => 'Ungültige Event-ID.'], 400);
    }
    return events_dir() . '/' . $id . '.json';
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        respond(['ok' => false, 'error' => 'Leerer Request-Body.'], 400);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(['ok' => false, 'error' => 'Ungültiges JSON.'], 400);
    }
    return $data;
}

function write_event(array $event): void {
    ensure_events_dir();
    $id = (string)($event['id'] ?? '');
    $path = event_path($id);

    $event['updatedAt'] = gmdate('c');

    $json = json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($path, $json, LOCK_EX) === false) {
        respond(['ok' => false, 'error' => 'Event konnte nicht gespeichert werden.'], 500);
    }
}

function read_event(string $id): array {
    $path = event_path($id);
    if (!is_file($path)) {
        respond(['ok' => false, 'error' => 'Event nicht gefunden.'], 404);
    }

    $event = json_decode((string)file_get_contents($path), true);
    if (!is_array($event)) {
        respond(['ok' => false, 'error' => 'Eventdatei ist ungültig.'], 500);
    }
    return $event;
}
