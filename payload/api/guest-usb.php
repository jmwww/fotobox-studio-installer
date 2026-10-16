<?php
declare(strict_types=1);

// ============================================================
// CORS – Zugriff des lokalen Windows-Studios erlauben
// ============================================================

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (
    preg_match(
        '#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#',
        $origin
    )
) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');

    http_response_code(204);
    exit;
}



header('Content-Type: application/json; charset=utf-8');

function respond(array $data, int $status = 200): never
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
    );

    exit;
}

function usb_partitions(): array
{
    $output = [];

    exec(
        "/usr/bin/lsblk -J -o NAME,TYPE,FSTYPE,LABEL,UUID,MOUNTPOINT,TRAN 2>/dev/null",
        $lines,
        $rc
    );

    if ($rc !== 0) {
        return [];
    }

    $data = json_decode(
        implode("\n", $lines),
        true
    );

    if (!is_array($data) || !isset($data['blockdevices'])) {
        return [];
    }

    foreach ($data['blockdevices'] as $disk) {

        if (($disk['type'] ?? '') !== 'disk') {
            continue;
        }

        $name = (string)($disk['name'] ?? '');

        if ($name === '') {
            continue;
        }

        $bus = trim((string)shell_exec(
            "/usr/bin/udevadm info --query=property --name="
            . escapeshellarg("/dev/" . $name)
            . " 2>/dev/null | "
            . "/usr/bin/awk -F= '\$1==\"ID_BUS\"{print \$2; exit}'"
        ));

        if ($bus !== 'usb') {
            continue;
        }

        if (!isset($disk['children']) || !is_array($disk['children'])) {
            continue;
        }

        foreach ($disk['children'] as $part) {

            if (($part['type'] ?? '') !== 'part') {
                continue;
            }

            $partName = (string)($part['name'] ?? '');

            if ($partName === '') {
                continue;
            }

            $device = '/dev/' . $partName;

            $label = (string)($part['label'] ?? '');
            $fstype = (string)($part['fstype'] ?? '');
            $uuid = (string)($part['uuid'] ?? '');
            $mountpoint = (string)($part['mountpoint'] ?? '');

            if ($label === 'PHOTOBOOTH') {
                continue;
            }

            $prepared = false;

            if ($mountpoint !== '') {
                $prepared = is_file(
                    $mountpoint . '/.FOTOBOX_GUEST'
                );
            }

            $output[] = [
                'device' => $device,
                'disk' => '/dev/' . $name,
                'bus' => $bus,
                'filesystem' => $fstype,
                'label' => $label,
                'uuid' => $uuid,
                'mountpoint' => $mountpoint,
                'prepared' => $prepared
            ];
        }
    }

    return $output;
}

$method = strtoupper(
    $_SERVER['REQUEST_METHOD'] ?? 'GET'
);

# ============================================================
# GET
# ============================================================

if ($method === 'GET') {

    respond([
        'ok' => true,
        'usb' => usb_partitions()
    ]);
}

# ============================================================
# POST
# ============================================================

if ($method === 'POST') {

    $raw = file_get_contents('php://input');

    $body = json_decode(
        $raw ?: '{}',
        true
    );

    if (!is_array($body)) {
        respond([
            'ok' => false,
            'error' => 'Ungültige JSON-Anfrage.'
        ], 400);
    }

    $action = (string)($body['action'] ?? '');

    if ($action !== 'prepare') {
        respond([
            'ok' => false,
            'error' => 'Unbekannte Aktion.'
        ], 400);
    }

    $device = (string)($body['device'] ?? '');

    if (!preg_match(
        '#^/dev/sd[a-z][0-9]+$#',
        $device
    )) {
        respond([
            'ok' => false,
            'error' => 'Ungültiges USB-Gerät.'
        ], 400);
    }

    # --------------------------------------------------------
    # USB erneut direkt prüfen
    # --------------------------------------------------------

    $parent = trim((string)shell_exec(
        "/usr/bin/lsblk -no PKNAME "
        . escapeshellarg($device)
        . " 2>/dev/null"
    ));

    if ($parent === '') {
        respond([
            'ok' => false,
            'error' => 'USB-Gerät konnte nicht ermittelt werden.'
        ], 400);
    }

    $bus = trim((string)shell_exec(
        "/usr/bin/udevadm info --query=property --name="
        . escapeshellarg("/dev/" . $parent)
        . " 2>/dev/null | "
        . "/usr/bin/awk -F= '\$1==\"ID_BUS\"{print \$2; exit}'"
    ));

    if ($bus !== 'usb') {
        respond([
            'ok' => false,
            'error' => 'Sicherheitsabbruch: Gerät ist kein USB-Gerät.'
        ], 403);
    }

    # --------------------------------------------------------
    # PHOTOBOOTH niemals verändern
    # --------------------------------------------------------

    $label = trim((string)shell_exec(
        "/usr/bin/blkid -s LABEL -o value "
        . escapeshellarg($device)
        . " 2>/dev/null"
    ));

    if ($label === 'PHOTOBOOTH') {
        respond([
            'ok' => false,
            'error' => 'PHOTOBOOTH-Sticks werden hier nicht verändert.'
        ], 403);
    }

    # --------------------------------------------------------
    # Sicheren Root-Helfer ausführen
    # --------------------------------------------------------

    $cmd =
        "/usr/bin/sudo "
        . "/usr/local/bin/prepare_guest_usb_api.sh "
        . escapeshellarg($device);

    exec(
        $cmd . " 2>&1",
        $output,
        $returnCode
    );

    if ($returnCode !== 0) {
        respond([
            'ok' => false,
            'device' => $device,
            'output' => $output,
            'returnCode' => $returnCode
        ], 500);
    }

    # --------------------------------------------------------
    # Danach normalen Gast-USB-Dienst starten
    # --------------------------------------------------------

    $serviceName =
        'usb-guest@'
        . basename($device)
        . '.service';

    exec(
        "/usr/bin/sudo /bin/systemctl start "
        . escapeshellarg($serviceName)
        . " 2>&1",
        $serviceOutput,
        $serviceReturnCode
    );

    if ($serviceReturnCode !== 0) {
        respond([
            'ok' => false,
            'device' => $device,
            'prepared' => true,
            'service' => $serviceName,
            'serviceOutput' => $serviceOutput,
            'error' => 'Stick wurde vorbereitet, aber der Gast-Service konnte nicht gestartet werden.'
        ], 500);
    }

    respond([
        'ok' => true,
        'device' => $device,
        'prepared' => true,
        'service' => $serviceName,
        'output' => $output
    ]);
}

respond([
    'ok' => false,
    'error' => 'Methode nicht unterstützt.'
], 405);
