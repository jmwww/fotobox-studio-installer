#!/usr/bin/env python3

import json
import os
import re
from PIL import Image, ImageDraw, ImageFont

ACTIVE_DIR = "/var/www/html/data/studio/active"
EVENT_FILE = os.path.join(ACTIVE_DIR, "active-event.json")
ASSET_DIR = os.path.join(ACTIVE_DIR, "assets")
OUTPUT_DIR = "/var/www/html/data/studio/test-render"

WIDTH = 720
HEIGHT = 480

OUTPUT_FILE = os.path.join(
    OUTPUT_DIR,
    "studio-preview-v2-720x480.jpg"
)


def fail(message):
    print(f"FEHLER: {message}")
    raise SystemExit(1)


def hex_color(value, fallback):
    if not isinstance(value, str):
        return fallback

    if re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return value

    return fallback


def load_font(font_name, size, bold=False):
    """
    Sucht nach der Studio-Schrift.
    Für Fraunces wird bevorzugt eine gefundene
    Fraunces-Datei verwendet.

    Falls sie nicht vorhanden ist:
    DejaVu Sans Bold als sicherer Fallback.
    """

    candidates = []

    wanted = str(font_name or "").lower()

    # Arial ist auf der Raspberry-Pi-Installation nicht vorhanden.
    # Liberation Sans ist die passende lokale Ersatzschrift.
    if wanted in ("arial", "helvetica", "sans-serif"):
        alias_regular = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
        alias_bold = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

        if bold and os.path.isfile(alias_bold):
            candidates.append(alias_bold)
        elif os.path.isfile(alias_regular):
            candidates.append(alias_regular)

    for root in [
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        "/home/fotobox/.local/share/fonts",
    ]:
        if not os.path.isdir(root):
            continue

        for dirpath, _, filenames in os.walk(root):
            for filename in filenames:
                lower = filename.lower()

                if not lower.endswith((".ttf", ".otf")):
                    continue

                if wanted and wanted in lower:
                    candidates.append(
                        os.path.join(dirpath, filename)
                    )

    if bold:
        candidates.sort(
            key=lambda path: (
                "bold" not in os.path.basename(path).lower(),
                "semibold" not in os.path.basename(path).lower(),
            )
        )

    candidates.extend([
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",

        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ])

    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                pass

    return ImageFont.load_default()


def cover_image(source, target_width, target_height):
    """
    Entspricht dem Studio-Prinzip:

    width: 100%
    height: 100%
    object-fit: cover
    """

    source = source.convert("RGB")

    sw, sh = source.size

    if sw <= 0 or sh <= 0:
        raise ValueError("Ungültige Bildgröße.")

    scale = max(
        target_width / sw,
        target_height / sh
    )

    nw = max(1, round(sw * scale))
    nh = max(1, round(sh * scale))

    resized = source.resize(
        (nw, nh),
        Image.Resampling.LANCZOS
    )

    left = max(0, (nw - target_width) // 2)
    top = max(0, (nh - target_height) // 2)

    return resized.crop(
        (
            left,
            top,
            left + target_width,
            top + target_height
        )
    )


def rounded_mask(width, height, radius):
    mask = Image.new(
        "L",
        (width, height),
        0
    )

    draw = ImageDraw.Draw(mask)

    draw.rounded_rectangle(
        (0, 0, width - 1, height - 1),
        radius=radius,
        fill=255
    )

    return mask


def parse_asset_map():
    manifest_file = os.path.join(
        ASSET_DIR,
        "manifest.json"
    )

    if not os.path.isfile(manifest_file):
        fail("Asset-Manifest nicht gefunden.")

    with open(
        manifest_file,
        encoding="utf-8"
    ) as f:
        manifest = json.load(f)

    result = {}

    for asset in manifest.get("assets", []):
        asset_id = asset.get("id")
        filename = asset.get("file")

        if asset_id and filename:
            result[asset_id] = os.path.join(
                ASSET_DIR,
                filename
            )

    return result


def draw_slot(canvas, slot, image_path):
    x = (
        float(slot.get("x", 0))
        / 100
        * WIDTH
    )

    y = (
        float(slot.get("y", 0))
        / 100
        * HEIGHT
    )

    w = (
        float(slot.get("width", 0))
        / 100
        * WIDTH
    )

    h = (
        float(slot.get("height", 0))
        / 100
        * HEIGHT
    )

    if w <= 0 or h <= 0:
        return

    target_w = max(1, round(w))
    target_h = max(1, round(h))

    if not os.path.isfile(image_path):
        print(
            f"WARNUNG: Bild nicht gefunden: "
            f"{image_path}"
        )
        return

    image = Image.open(image_path)

    cropped = cover_image(
        image,
        target_w,
        target_h
    )

    # --------------------------------------------------------
    # Bild mit 5 px Studio-Radius
    # --------------------------------------------------------

    # --------------------------------------------------------
    # Slot-Radius proportional zur Ausgabeauflösung
    #
    # Studio-Referenz:
    # 720 px Breite = 5 px Radius
    # --------------------------------------------------------

    REFERENCE_WIDTH = 720

    render_scale = WIDTH / REFERENCE_WIDTH

    slot_radius = max(
        1,
        round(
            5 * render_scale
        )
    )

    mask = rounded_mask(
        target_w,
        target_h,
        slot_radius
    )

    canvas.paste(
        cropped,
        (
            round(x),
            round(y)
        ),
        mask
    )

    # --------------------------------------------------------
    # Studio-Slot-Rahmen
    # --------------------------------------------------------

    overlay = Image.new(
        "RGBA",
        canvas.size,
        (0, 0, 0, 0)
    )

    draw = ImageDraw.Draw(
        overlay
    )

    slot_border_width = max(
        1,
        round(
            1 * render_scale
        )
    )

    draw.rounded_rectangle(
        (
            round(x),
            round(y),
            round(x + w - 1),
            round(y + h - 1)
        ),
        radius=slot_radius,
        outline=(255, 255, 255, 180),
        width=slot_border_width
    )

    canvas.paste(
        overlay,
        (0, 0),
        overlay
    )


def draw_text(canvas, design):
    text = design.get("text", {})

    content = text.get("content")
    if not content:
        return

    font_size = float(text.get("fontSize", 18))
    scale = float(text.get("scale", 1))

    # --------------------------------------------------------
    # Gleiche Referenzlogik wie im gemeinsamen JavaScript-Renderer
    #
    # Landscape: 720 px Referenzbreite
    # Portrait:  480 px Referenzbreite
    # --------------------------------------------------------

    REFERENCE_WIDTH = 480 if WIDTH < HEIGHT else 720
    render_scale = WIDTH / REFERENCE_WIDTH

    effective_size = max(
        1,
        round(font_size * render_scale)
    )

    font_name = str(
        text.get(
            "fontFamily",
            "Fraunces"
        )
    )

    font = load_font(
        font_name,
        effective_size,
        bold=True
    )

    color = hex_color(
        text.get("color"),
        "#000000"
    )

    x_percent = float(
        text.get("x", 50)
    )

    y_percent = float(
        text.get("y", 89)
    )

    rotation = float(
        text.get("rotation", 0)
    )

    align = text.get(
        "align",
        "center"
    )

    # --------------------------------------------------------
    # Der gemeinsame Renderer verwendet einen Textcontainer
    # mit 80 % Breite, dessen Mittelpunkt bei x liegt.
    # --------------------------------------------------------

    container_width = round(WIDTH * 0.80)
    container_left = round(
        (x_percent / 100.0 * WIDTH)
        - container_width / 2
    )

    bbox = font.getbbox(content)

    text_w = max(
        1,
        bbox[2] - bbox[0]
    )

    text_h = max(
        1,
        bbox[3] - bbox[1]
    )

    layer = Image.new(
        "RGBA",
        (
            text_w + 40,
            text_h + 40
        ),
        (0, 0, 0, 0)
    )

    text_draw = ImageDraw.Draw(layer)

    text_draw.text(
        (
            20 - bbox[0],
            20 - bbox[1]
        ),
        content,
        font=font,
        fill=color
    )

    # --------------------------------------------------------
    # Scale wird wie im Browser auf die komplette Textebene
    # angewendet, nicht auf die Fontgröße.
    # --------------------------------------------------------

    if scale != 1:
        scaled_width = max(
            1,
            round(layer.width * scale)
        )

        scaled_height = max(
            1,
            round(layer.height * scale)
        )

        layer = layer.resize(
            (
                scaled_width,
                scaled_height
            ),
            Image.Resampling.LANCZOS
        )

    # --------------------------------------------------------
    # Rotation wie im gemeinsamen Renderer
    # --------------------------------------------------------

    if rotation:
        layer = layer.rotate(
            -rotation,
            expand=True,
            resample=Image.Resampling.BICUBIC
        )

    # --------------------------------------------------------
    # Text innerhalb des 80-%-Containers ausrichten.
    # --------------------------------------------------------

    if align == "center":
        paste_x = round(
            container_left
            + (container_width - layer.width) / 2
        )

    elif align == "right":
        paste_x = round(
            container_left
            + container_width
            - layer.width
        )

    else:
        # align = left
        paste_x = round(
            container_left
        )

    # --------------------------------------------------------
    # Gleiche Y-Logik wie im gemeinsamen Renderer:
    # bottom = 100 - y
    # --------------------------------------------------------

    paste_y = round(
        (y_percent / 100.0 * HEIGHT)
        - layer.height
    )

    # --------------------------------------------------------
    # Text vollständig innerhalb des Studio-Arbeitsrahmens
    # halten. Gleiche Rahmenbegrenzung wie beim Layout:
    #
    # links/rechts  = 5.5556 % / 94.4444 %
    # oben/unten    = 4.1667 % / 95.8333 %
    # --------------------------------------------------------

    frame_left = round(WIDTH * 0.055556)
    frame_top = round(HEIGHT * 0.041667)
    frame_right = round(WIDTH * 0.944444)
    frame_bottom = round(HEIGHT * 0.958333)

    max_paste_x = frame_right - layer.width
    max_paste_y = frame_bottom - layer.height

    paste_x = max(
        frame_left,
        min(paste_x, max_paste_x)
    )

    paste_y = max(
        frame_top,
        min(paste_y, max_paste_y)
    )

    canvas.paste(
        layer,
        (
            paste_x,
            paste_y
        ),
        layer
    )


def draw_frame(canvas, design):
    frame = design.get(
        "frame",
        {}
    )

    frame_type = frame.get(
        "type"
    )

    if not frame_type or frame_type == "none":
        return

    frame_color = hex_color(
        frame.get("value"),
        "#23241f"
    )

    draw = ImageDraw.Draw(
        canvas
    )

    # Studio:
    # 2px solid border
    # --------------------------------------------------------
    # Rahmen proportional zur Ausgabeauflösung
    #
    # Studio-Referenz:
    # 720 px Breite -> 2 px Rahmen / 10 px Radius
    # --------------------------------------------------------

    REFERENCE_WIDTH = 720

    render_scale = WIDTH / REFERENCE_WIDTH

    frame_radius = max(
        1,
        round(
            10 * render_scale
        )
    )

    frame_width = max(
        1,
        round(
            2 * render_scale
        )
    )

    # --------------------------------------------------------
    # Gleichmäßiger drucksicherer Rahmen
    #
    # Referenz:
    # 720 x 480  -> 20 px Rand
    # 1800 x 1200 -> 50 px Rand
    #
    # X und Y werden getrennt berechnet.
    # Dadurch ist der Rahmen auf allen vier Seiten
    # exakt gleich weit vom Außenrand entfernt.
    # --------------------------------------------------------

    REFERENCE_WIDTH = 720
    REFERENCE_HEIGHT = 480

    # Druck-Sicherheitsbereich:
    # 1800x1200 -> 100 px links/rechts, 50 px oben/unten
    REFERENCE_MARGIN_X = 40
    REFERENCE_MARGIN_Y = 20

    margin_x = max(
        1,
        round(
            REFERENCE_MARGIN_X
            * WIDTH
            / REFERENCE_WIDTH
        )
    )

    margin_y = max(
        1,
        round(
            REFERENCE_MARGIN_Y
            * HEIGHT
            / REFERENCE_HEIGHT
        )
    )

    left = margin_x
    top = margin_y
    right = WIDTH - 1 - margin_x
    bottom = HEIGHT - 1 - margin_y

    draw.rounded_rectangle(
        (
            left,
            top,
            right,
            bottom
        ),
        radius=frame_radius,
        outline=frame_color,
        width=frame_width
    )

    print(
        f"Rahmen: "
        f"left={left}, "
        f"top={top}, "
        f"right={right}, "
        f"bottom={bottom}, "
        f"margin_x={margin_x}, "
        f"margin_y={margin_y}"
    )


def draw_graphics(canvas, design, asset_map):
    """
    Rendert die allgemeinen Grafik-Elemente aus design.graphics.

    Die Koordinaten entsprechen der Studio-0.9.14-Vorschau:

        x        = Mittelpunkt in Prozent der Breite
        y        = Mittelpunkt in Prozent der Höhe
        width    = Breite in Prozent der Canvas-Breite
        rotation = Drehung in Grad
        opacity  = Deckkraft 0.0 bis 1.0
    """

    graphics = design.get(
        "graphics",
        []
    )

    if not isinstance(graphics, list):
        return

    for index, graphic in enumerate(
        graphics,
        start=1
    ):

        if not isinstance(graphic, dict):
            continue

        graphic_id = graphic.get(
            "id"
        )

        if not graphic_id:
            print(
                f"WARNUNG: Grafik {index} ohne ID."
            )
            continue

        # ----------------------------------------------------
        # Grafik laden
        #
        # Neue Studio-Grafiken können direkt als
        # data:image/...;base64,... im Event gespeichert sein.
        # Nur wenn keine eingebettete Grafik vorhanden ist,
        # wird auf die normale Event-Asset-Zuordnung
        # zurückgegriffen.
        # ----------------------------------------------------

        image_path = None
        graphic_img = None
        source_name = str(graphic_id)

        graphic_src = graphic.get("src")

        if (
            isinstance(graphic_src, str)
            and graphic_src.startswith("data:image/")
        ):
            try:
                import base64
                from io import BytesIO

                header, encoded = graphic_src.split(",", 1)

                if ";base64" not in header:
                    raise ValueError(
                        "eingebettete Grafik ist nicht Base64-codiert"
                    )

                raw_data = base64.b64decode(
                    encoded
                )

                graphic_img = Image.open(
                    BytesIO(raw_data)
                ).convert("RGBA")

                source_name = "inline:" + graphic_id

                print(
                    f"Grafik {index}: "
                    f"{graphic_id} aus Event-src geladen"
                )

            except Exception as exc:
                print(
                    f"WARNUNG: Eingebettete Grafik "
                    f"{graphic_id} konnte nicht geladen werden: "
                    f"{exc}"
                )
                continue

        else:
            # ------------------------------------------------
            # Neue Medienbibliothek:
            # Ein src wie
            # /data/studio/library/graphics/datei.png
            # ist direkt ein Webpfad unter /var/www/html.
            # ------------------------------------------------

            if (
                isinstance(graphic_src, str)
                and graphic_src.startswith("/data/")
            ):
                image_path = "/var/www/html" + graphic_src

            else:
                # --------------------------------------------
                # Alte / externe Event-Assets
                # --------------------------------------------
                image_path = asset_map.get(
                    graphic_id
                )

            if not image_path:
                print(
                    f"WARNUNG: Grafik-Asset "
                    f"{graphic_id} nicht gefunden."
                )
                continue

            if not os.path.isfile(image_path):
                print(
                    f"WARNUNG: Grafik-Datei nicht gefunden: "
                    f"{image_path}"
                )
                continue

            try:
                graphic_img = Image.open(
                    image_path
                ).convert("RGBA")

                source_name = os.path.basename(
                    image_path
                )

                print(
                    f"Grafik {index}: "
                    f"{graphic_id} -> Datei geladen: "
                    f"{image_path}"
                )

            except Exception as exc:
                print(
                    f"WARNUNG: Grafik konnte nicht geladen werden: "
                    f"{image_path} - {exc}"
                )
                continue

        # ----------------------------------------------------
        # Studio-Werte
        # ----------------------------------------------------

        try:
            x_percent = float(
                graphic.get(
                    "x",
                    50
                )
            )
        except (TypeError, ValueError):
            x_percent = 50.0

        try:
            y_percent = float(
                graphic.get(
                    "y",
                    50
                )
            )
        except (TypeError, ValueError):
            y_percent = 50.0

        try:
            width_percent = float(
                graphic.get(
                    "width",
                    15
                )
            )
        except (TypeError, ValueError):
            width_percent = 15.0

        try:
            rotation = float(
                graphic.get(
                    "rotation",
                    0
                )
            )
        except (TypeError, ValueError):
            rotation = 0.0

        try:
            opacity = float(
                graphic.get(
                    "opacity",
                    1
                )
            )
        except (TypeError, ValueError):
            opacity = 1.0

        opacity = max(
            0.0,
            min(
                1.0,
                opacity
            )
        )

        # ----------------------------------------------------
        # Zielbreite
        #
        # Studio:
        # width = Prozent der Canvas-Breite
        # ----------------------------------------------------

        target_width = max(
            1,
            round(
                WIDTH
                * width_percent
                / 100.0
            )
        )

        original_width, original_height = (
            graphic_img.size
        )

        if original_width <= 0 or original_height <= 0:
            print(
                f"WARNUNG: Ungültige Grafikgröße: "
                f"{image_path}"
            )
            continue

        # Seitenverhältnis erhalten
        target_height = max(
            1,
            round(
                original_height
                * target_width
                / original_width
            )
        )

        graphic_img = graphic_img.resize(
            (
                target_width,
                target_height
            ),
            Image.Resampling.LANCZOS
        )

        # ----------------------------------------------------
        # Deckkraft
        # ----------------------------------------------------

        if opacity < 1.0:
            alpha = graphic_img.getchannel(
                "A"
            )

            alpha = alpha.point(
                lambda value: round(
                    value * opacity
                )
            )

            graphic_img.putalpha(
                alpha
            )

        # ----------------------------------------------------
        # Drehung
        #
        # CSS rotate(+Xdeg) dreht im Uhrzeigersinn.
        # Pillow rotate(+X) dreht gegen den Uhrzeigersinn.
        # Deshalb Vorzeichen umkehren.
        # ----------------------------------------------------

        if rotation:
            graphic_img = graphic_img.rotate(
                -rotation,
                resample=Image.Resampling.BICUBIC,
                expand=True
            )

        # ----------------------------------------------------
        # Mittelpunkt wie im Studio
        #
        # CSS:
        # left: x%
        # top: y%
        # transform: translate(-50%, -50%)
        # ----------------------------------------------------

        center_x = round(
            WIDTH
            * x_percent
            / 100.0
        )

        center_y = round(
            HEIGHT
            * y_percent
            / 100.0
        )

        paste_x = round(
            center_x
            - graphic_img.width / 2
        )

        paste_y = round(
            center_y
            - graphic_img.height / 2
        )

        # ----------------------------------------------------
        # Grafik auf Canvas setzen
        # ----------------------------------------------------

        canvas.paste(
            graphic_img,
            (
                paste_x,
                paste_y
            ),
            graphic_img
        )

        print(
            f"Grafik {index}: "
            f"{graphic_id} -> "
            f"{source_name} "
            f"@ {center_x},{center_y} "
            f"width={target_width}px "
            f"rotation={rotation}° "
            f"opacity={opacity}"
        )


def render_event(
    event,
    width=720,
    height=480,
    output_file=None,
    live_photo=None,
    live_photos=None
):

    """
    Rendert ein Studio-Event in der gewünschten Auflösung.

    width:
        Ausgabe-Breite in Pixel

    height:
        Ausgabe-Höhe in Pixel

    output_file:
        Zieldatei. Wenn nicht angegeben, wird die
        bisherige Studio-Testdatei verwendet.
    """

    global WIDTH
    global HEIGHT
    global OUTPUT_FILE

    if not isinstance(event, dict):
        raise ValueError("Ungültiges Event.")

    if width <= 0 or height <= 0:
        raise ValueError(
            f"Ungültige Ausgabegröße: {width} x {height}"
        )

    WIDTH = int(width)
    HEIGHT = int(height)

    if output_file:
        OUTPUT_FILE = output_file
    else:
        OUTPUT_FILE = os.path.join(
            OUTPUT_DIR,
            f"studio-preview-{WIDTH}x{HEIGHT}.jpg"
        )

    design = event.get(
        "design"
    )

    if not isinstance(
        design,
        dict
    ):
        fail(
            "Keine Designdaten vorhanden."
        )

    os.makedirs(
        os.path.dirname(OUTPUT_FILE),
        exist_ok=True
    )

    print(
        "========================================"
    )
    print(
        " STUDIO RENDERER"
    )
    print(
        "========================================"
    )

    print(
        f"Event:  {event.get('name')}"
    )

    print(
        f"Format: {event.get('format')}"
    )

    print(
        f"Canvas: {WIDTH} x {HEIGHT}"
    )

    print()

    # --------------------------------------------------------
    # Hintergrund
    # --------------------------------------------------------

    background = design.get(
        "background",
        {}
    )

    bg_color = hex_color(
        background.get("value"),
        "#ffffff"
    )

    print(
        f"Hintergrund: {bg_color}"
    )

    canvas = Image.new(
        "RGB",
        (
            WIDTH,
            HEIGHT
        ),
        bg_color
    )

    # --------------------------------------------------------
    # Layout
    # --------------------------------------------------------

    layout = design.get(
        "layout",
        {}
    )

    slots = layout.get(
        "slots",
        []
    )

    slot_map = {
        slot.get("id"): slot
        for slot in slots
        if isinstance(
            slot,
            dict
        )
    }

    # --------------------------------------------------------
    # Bilder
    # --------------------------------------------------------

    asset_map = {}

    slot_assignments = design.get(
        "slots",
        {}
    )

    # --------------------------------------------------------
    # Live-Foto / Studio-Assets
    # --------------------------------------------------------


    # --------------------------------------------------------
    # Live-Fotos / Studio-Assets
    # --------------------------------------------------------

    # Neue Multi-Foto-Schnittstelle:
    #
    # live_photos = [
    #     "/data/tmp/....-0.jpg",
    #     "/data/tmp/....-1.jpg",
    #     "/data/tmp/....-2.jpg",
    # ]
    #
    # Die Fotos werden der Reihe nach den belegten
    # Studio-Slots zugeordnet.
    #
    # live_photo bleibt als Rückwärtskompatibilität
    # für den bisherigen Einzel-Foto-Aufruf erhalten.

    if live_photos is None:
        live_photos = []

    if live_photo and not live_photos:
        live_photos = [live_photo]

    # Nur tatsächlich vorhandene Live-Fotos verwenden
    valid_live_photos = []

    for photo_path in live_photos:
        if photo_path and os.path.isfile(photo_path):
            valid_live_photos.append(photo_path)
        elif photo_path:
            print(
                f"WARNUNG: Live-Foto nicht gefunden: "
                f"{photo_path}"
            )

    live_photo_index = 0

    # --------------------------------------------------------
    # Genau dieselbe Slot-Reihenfolge wie im gemeinsamen
    # Studio-Renderer verwenden.
    #
    # Ein Slot ohne Zuordnung in design.slots ist leer und
    # darf deshalb KEIN Live-Foto verbrauchen.
    # --------------------------------------------------------

    for slot in slots:

        if not isinstance(slot, dict):
            continue

        slot_id = slot.get("id")

        if not slot_id:
            continue

        image_id = slot_assignments.get(
            slot_id
        )

        # ----------------------------------------------------
        # Live-Fotos haben bei einem echten Fotolauf Vorrang.
        #
        # Die Aufnahmen werden der Reihe nach auf die
        # vorhandenen Studio-Slots verteilt:
        #
        #   -0.jpg -> slot-1
        #   -1.jpg -> slot-2
        #   -2.jpg -> slot-3
        #
        # Eine feste image_id im Event darf das nicht blockieren.
        # ----------------------------------------------------

        if live_photo_index < len(valid_live_photos):

            live_path = valid_live_photos[
                live_photo_index
            ]

            print(
                f"Live-Foto "
                f"{live_photo_index + 1} "
                f"{live_path} -> {slot_id}"
            )

            draw_slot(
                canvas,
                slot,
                live_path
            )

            live_photo_index += 1

            continue

        # ----------------------------------------------------
        # Keine Live-Fotos mehr vorhanden:
        # dann bisherige feste Bildzuordnung verwenden.
        # ----------------------------------------------------

        if not image_id:
            print(
                f"Leerer Slot {slot_id} -> übersprungen"
            )
            continue

        # ----------------------------------------------------
        # Kein Live-Foto mehr:
        # normales Studio-Asset verwenden
        # ----------------------------------------------------

        image_path = asset_map.get(
            image_id
        )

        if not image_path:
            print(
                f"WARNUNG: Asset "
                f"{image_id} nicht gefunden."
            )
            continue

        print(
            f"Bild {image_id} -> {slot_id}"
        )

        draw_slot(
            canvas,
            slot,
            image_path
        )

    # --------------------------------------------------------
    # Allgemeine Grafiken
    # --------------------------------------------------------

    draw_graphics(
        canvas,
        design,
        asset_map
    )

    # --------------------------------------------------------
    # Text
    # --------------------------------------------------------

    draw_text(
        canvas,
        design
    )


    # --------------------------------------------------------
    # Rahmen
    # --------------------------------------------------------

    draw_frame(
        canvas,
        design
    )

    # --------------------------------------------------------
    # Ausgabe
    # --------------------------------------------------------

    canvas.save(
        OUTPUT_FILE,
        "JPEG",
        quality=95,
        subsampling=0
    )

    print()

    print(
        "========================================"
    )

    print(
        " RENDER FERTIG"
    )

    print(
        "========================================"
    )

    print(
        f"Datei: {OUTPUT_FILE}"
    )

    print(
        f"Größe: {WIDTH} x {HEIGHT}"
    )

    print(
        "========================================"
    )

    return OUTPUT_FILE


def main():

    if not os.path.isfile(
        EVENT_FILE
    ):
        fail(
            "active-event.json nicht gefunden."
        )

    with open(
        EVENT_FILE,
        encoding="utf-8"
    ) as f:
        event = json.load(f)

    event_format = str(event.get("format", "landscape")).lower()

    if event_format == "portrait":
        render_width = 480
        render_height = 720
    else:
        render_width = 720
        render_height = 480

    render_event(
        event,
        width=render_width,
        height=render_height,
        output_file=os.path.join(
            OUTPUT_DIR,
            f"studio-preview-v2-{render_width}x{render_height}.jpg"
        )
    )


if __name__ == "__main__":
    main()
