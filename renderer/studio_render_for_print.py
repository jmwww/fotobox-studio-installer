#!/usr/bin/env python3

import json
import os
import sys
import importlib.util
from PIL import Image


RENDERER_PATH = "/home/fotobox/studio_renderer.py"
EVENT_FILE = "/var/www/html/data/studio/active/active-event.json"


def fail(message):
    print(f"FEHLER: {message}", file=sys.stderr)
    sys.exit(1)


if len(sys.argv) != 3:
    fail(
        "Verwendung: "
        "studio_render_for_print.py "
        "<live_photo> <output_file>"
    )


live_photo = os.path.realpath(sys.argv[1])
output_file = os.path.realpath(sys.argv[2])


if not os.path.isfile(EVENT_FILE):
    fail("Kein aktives Studio-Event vorhanden.")


if not os.path.isfile(live_photo):
    fail(
        f"Live-Foto nicht gefunden: {live_photo}"
    )


output_dir = os.path.dirname(output_file)

if not os.path.isdir(output_dir):
    os.makedirs(
        output_dir,
        exist_ok=True
    )


# ------------------------------------------------------------
# Studio-Renderer laden
# ------------------------------------------------------------

spec = importlib.util.spec_from_file_location(
    "studio_renderer",
    RENDERER_PATH
)

if spec is None or spec.loader is None:
    fail(
        "Studio-Renderer konnte nicht geladen werden."
    )


renderer = importlib.util.module_from_spec(
    spec
)

spec.loader.exec_module(renderer)


# ------------------------------------------------------------
# Studio-Event laden
# ------------------------------------------------------------

with open(
    EVENT_FILE,
    "r",
    encoding="utf-8"
) as f:
    event = json.load(f)


# ------------------------------------------------------------
# Druckformat aus Studio-Event bestimmen
# ------------------------------------------------------------

event_format = str(
    event.get("format", "landscape")
).lower()

if event_format == "portrait":
    render_width = 1200
    render_height = 1800
else:
    render_width = 1800
    render_height = 1200

print(
    f"Studio-Druckformat: {render_width} x {render_height}"
)


# ------------------------------------------------------------
# Collage-Einzelbilder erkennen
# ------------------------------------------------------------
#
# Photobooth erzeugt bei einer Collage:
#
#   20260929_123456-0.jpg
#   20260929_123456-1.jpg
#   20260929_123456-2.jpg
#   ...
#
# Das eigentliche Ergebnis heißt:
#
#   20260929_123456.jpg
#
# Wir suchen deshalb ausschließlich nach dem
# bekannten Namensschema des übergebenen Originals.
# ------------------------------------------------------------

live_photos = []

live_directory = os.path.dirname(
    live_photo
)

live_filename = os.path.basename(
    live_photo
)

base_name, extension = os.path.splitext(
    live_filename
)

index = 0

while True:

    candidate = os.path.join(
        live_directory,
        f"{base_name}-{index}{extension}"
    )

    if not os.path.isfile(candidate):
        break

    live_photos.append(
        os.path.realpath(candidate)
    )

    index += 1


# ------------------------------------------------------------
# Anzahl der Bild-Slots aus dem Studio-Layout bestimmen
# ------------------------------------------------------------

layout_slots = []

design = event.get("design", {})

layout = design.get("layout", {})

slots = layout.get("slots", [])

if isinstance(slots, list):
    for slot in slots:
        if isinstance(slot, dict):
            slot_id = slot.get("id")
            if slot_id:
                layout_slots.append(slot_id)

required_slots = len(layout_slots)

print(
    f"Studio-Layout: {required_slots} Bild-Slot(s)"
)

if required_slots == 0:
    fail(
        "Studio-Layout enthält keine Bild-Slots."
    )


# ------------------------------------------------------------
# Collage-Einzelbilder auf benötigte Slots begrenzen
# ------------------------------------------------------------

if live_photos:

    original_count = len(live_photos)

    if len(live_photos) > required_slots:
        live_photos = live_photos[:required_slots]

        print(
            f"Studio: {original_count} Einzelbilder gefunden, "
            f"verwende davon {len(live_photos)} für das Layout."
        )

    else:

        print(
            "Studio: "
            f"{len(live_photos)} "
            "Collage-Einzelbilder erkannt."
        )

    for number, photo in enumerate(
        live_photos,
        start=1
    ):
        slot_id = (
            layout_slots[number - 1]
            if number - 1 < len(layout_slots)
            else "?"
        )

        print(
            f"  Foto {number}: {photo} -> {slot_id}"
        )

    renderer.render_event(
        event,
        width=render_width,
        height=render_height,
        output_file=output_file,
        live_photos=live_photos
    )

else:

    print(
        "Studio: keine Collage-Einzelbilder "
        "gefunden."
    )

    print(
        f"Studio: Einzelbild {live_photo}"
    )

    renderer.render_event(
        event,
        width=render_width,
        height=render_height,
        output_file=output_file,
        live_photo=live_photo
    )


# ------------------------------------------------------------
# Ausgabe prüfen
# ------------------------------------------------------------

if not os.path.isfile(output_file):
    fail(
        "Studio-Renderer hat keine "
        "Ausgabedatei erzeugt."
    )


# ------------------------------------------------------------
# 300 DPI für SELPHY setzen
# ------------------------------------------------------------

image = Image.open(
    output_file
)

image.save(
    output_file,
    "JPEG",
    quality=95,
    subsampling=0,
    dpi=(300, 300)
)

image.close()


print(
    f"Studio-Druckdatei: {output_file}"
)

print(
    "Auflösung: 1800 x 1200"
)

print(
    "DPI: 300 x 300"
)
