<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

/* Fotobox Studio -> Raspberry Pi Event API.
 * Storage is isolated at /var/www/html/data/studio/events.
 * Existing camera, printer, USB-sync and photobooth data are untouched.
 */

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Max-Age: 600');
    http_response_code(204);
    exit;
}

const STUDIO_EVENTS_DIR = '/var/www/html/data/studio/events';

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function ensure_dir(): void
{
    if (!is_dir(STUDIO_EVENTS_DIR) && !mkdir(STUDIO_EVENTS_DIR, 0775, true) && !is_dir(STUDIO_EVENTS_DIR)) {
        respond(['ok' => false, 'error' => 'Studio-Eventverzeichnis konnte nicht angelegt werden.'], 500);
    }
}

function valid_id(string $id): bool
{
    return preg_match('/^[A-Za-z0-9_-]+$/', $id) === 1;
}

function event_path(string $id): string
{
    if (!valid_id($id)) {
        respond(['ok' => false, 'error' => 'Ungültige Event-ID.'], 400);
    }
    return STUDIO_EVENTS_DIR . '/' . $id . '.json';
}

function read_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        respond(['ok' => false, 'error' => 'Leerer Request-Body.'], 400);
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        respond(['ok' => false, 'error' => 'Ungültiges JSON.'], 400);
    }
    return $body;
}

function extract_event(array $body): array
{
    return (isset($body['event']) && is_array($body['event'])) ? $body['event'] : $body;
}

function validate_event(array $event): void
{
    $id = (string)($event['id'] ?? '');
    $pin = (string)($event['pin'] ?? '');

    if (!valid_id($id)) {
        respond(['ok' => false, 'error' => 'Ungültige Event-ID.'], 400);
    }
    if (!preg_match('/^\d{4}$/', $pin)) {
        respond(['ok' => false, 'error' => 'PIN muss vierstellig sein.'], 400);
    }
    if (!isset($event['schemaVersion'])) {
        respond(['ok' => false, 'error' => 'schemaVersion fehlt.'], 400);
    }
    if (!isset($event['design']) || !is_array($event['design'])) {
        respond(['ok' => false, 'error' => 'Designdaten fehlen.'], 400);
    }
}

function save_event(array $event): array
{
    ensure_dir();
    validate_event($event);
    $event['updatedAt'] = gmdate('c');

    $json = json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        respond(['ok' => false, 'error' => 'Event konnte nicht als JSON erzeugt werden.'], 500);
    }

    $path = event_path((string)$event['id']);
    $tmp = $path . '.tmp-' . getmypid();

    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        @unlink($tmp);
        respond(['ok' => false, 'error' => 'Eventdatei konnte nicht geschrieben werden.'], 500);
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        respond(['ok' => false, 'error' => 'Eventdatei konnte nicht übernommen werden.'], 500);
    }
    return $event;
}

function read_event(string $id): array
{
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

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = (string)($_GET['action'] ?? '');

if ($method === 'GET' && $action === 'by-pin') {
    $pin = preg_replace('/\D+/', '', (string)($_GET['pin'] ?? ''));
    if (!preg_match('/^\d{4}$/', $pin)) {
        respond(['ok' => false, 'error' => 'PIN muss vierstellig sein.'], 400);
    }

    ensure_dir();
    foreach (glob(STUDIO_EVENTS_DIR . '/*.json') ?: [] as $file) {
        $event = json_decode((string)file_get_contents($file), true);
        if (!is_array($event) || (string)($event['pin'] ?? '') !== $pin) {
            continue;
        }
        if ((string)($event['status'] ?? '') !== 'ready') {
            respond(['ok' => false, 'error' => 'Event ist noch nicht freigegeben.'], 409);
        }
        respond(['ok' => true, 'event' => $event]);
    }
    respond(['ok' => false, 'error' => 'PIN nicht gefunden.'], 404);
}

if ($method === 'GET' && $action === 'get') {
    $id = (string)($_GET['id'] ?? '');
    respond(['ok' => true, 'event' => read_event($id)]);
}

if ($method === 'POST' && $action === 'publish') {
    $event = extract_event(read_body());
    validate_event($event);
    $event['status'] = 'ready';
    $event = save_event($event);
    respond(['ok' => true, 'published' => true, 'event' => $event]);
}

respond(['ok' => false, 'error' => 'Unbekannte Studio-Event-API-Anfrage.'], 400);
