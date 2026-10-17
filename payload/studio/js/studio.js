const API_BASE = "api";

/*
 * Raspberry Pi der Fotobox.
 * Die lokale Studio-API bleibt davon getrennt.
 */
const FOTOBOX_BASE = window.location.origin;
const GUEST_USB_API = `${FOTOBOX_BASE}/api/guest-usb.php`;
const FOTOBOX_EVENTS_API = `${FOTOBOX_BASE}/api/studio-events.php`;
let guestUsbPoll = null;

const appState = {
  currentEvent: null,
  currentStep: 1,
  phoneStep: 2,
  zoom: 0.64,
  selected: "text",
  selectedSlot: 1,
  phonePoll: null,
  lastLiveUpdatedAt: null
};

const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];

function setDbState(text) {
  const el = $("#dbState");
  if (el) el.textContent = text;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `API-Fehler HTTP ${response.status}`);
  }
  return payload;
}

async function apiListEvents() {
  const response = await fetch(
    `${FOTOBOX_BASE}/studio/api/events.php?action=list`,
    {
      cache: "no-store",
      headers: {Accept: "application/json"}
    }
  );

  if (!response.ok) {
    throw new Error(`Fotobox Event API HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "Fotobox Event API Fehler");
  }

  return result.events || [];
}

async function apiGetEvent(id) {
  const response = await fetch(
    `${FOTOBOX_BASE}/studio/api/events.php?action=get&id=${encodeURIComponent(id)}`,
    {
      cache: "no-store",
      headers: {Accept: "application/json"}
    }
  );

  if (!response.ok) {
    throw new Error(`Fotobox Event API HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok || !result.event) {
    throw new Error(result.error || "Event konnte nicht geladen werden");
  }

  return result.event;
}

async function apiSaveEvent(event) {
  const normalized = FotoboxEventSchema.normalize(event);
  const result = await apiRequest(`${API_BASE}/events.php?action=save`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(normalized)
  });
  setDbState("API gespeichert");
  return result.event;
}

async function apiDeleteEvent(id) {
  await apiRequest(`${API_BASE}/events.php?action=delete`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({id})
  });
}

async function fotoboxLiveGet(id) {
  const response = await fetch(
    `${FOTOBOX_BASE}/studio/api/live.php?id=${encodeURIComponent(id)}`,
    {
      cache: "no-store",
      headers: {Accept: "application/json"}
    }
  );

  if (!response.ok) {
    throw new Error(`Fotobox Live API HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok || !result.event) {
    throw new Error(result.error || "Ungültige Fotobox-Live-Antwort");
  }

  return result.event;
}
async function apiLiveGet(id) {
  return apiRequest(`${API_BASE}/live.php?id=${encodeURIComponent(id)}`);
}

async function apiLivePatch(id, patch) {
  const result = await apiRequest(`${API_BASE}/live.php?id=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(patch)
  });
  return result;
}

async function fotoboxEventRequest(options = {}) {
  const action = options.action || "publish";
  const pin = options.pin || "";
  const requestOptions = {...options};

  delete requestOptions.action;
  delete requestOptions.pin;

  const query = new URLSearchParams({
    action: action
  });

  if (pin) {
    query.set("pin", pin);
  }

  const response = await fetch(`${FOTOBOX_EVENTS_API}?${query.toString()}`, {
    ...requestOptions,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(requestOptions.headers || {})
    }
  });

  let payload = null;
  try { payload = await response.json(); } catch {}

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Fotobox-Event-API HTTP ${response.status}`);
  }
  return payload;
}

async function publishEventToFotobox(event) {
  // 0.9.19: Migration explizit vor jeder Validierung/Übertragung ausführen.
  const normalized = FotoboxEventSchema.normalize(event);
  FotoboxEventSchema.migrateLegacyCheese(normalized);
  const check = FotoboxEventSchema.validate(normalized);
  if (!check.valid) throw new Error(check.errors.join("\n"));

  normalized.status = "ready";
  normalized.updatedAt = new Date().toISOString();

  const result = await fotoboxEventRequest({
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({action: "publish", event: normalized})
  });

  const published = FotoboxEventSchema.normalize(result.event);
  FotoboxEventSchema.migrateLegacyCheese(published);

  // Nach erfolgreicher Übertragung das Event direkt als aktives
  // Studio-Event auf der Fotobox setzen.
  await fotoboxEventRequest({
    action: "activate",
    pin: published.pin,
    method: "POST"
  });

  return published;
}

async function deactivateEventOnFotobox() {
  return fotoboxEventRequest({
    action: "deactivate",
    method: "POST"
  });
}

async function fotoboxUsbRequest(options = {}) {
  const response = await fetch(GUEST_USB_API, {
    ...options,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Fotobox-API HTTP ${response.status}`);
  }

  return payload;
}

function setFotoboxState(text, state = "") {
  const el = $("#boxState");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "error");
  if (state) el.classList.add(state);
}

function guestUsbStatus(usb) {
  if (usb.prepared) {
    return `<span class="usb-status ready"><i class="usb-dot"></i>Gast-Stick vorbereitet</span>`;
  }

  return `<span class="usb-status warn"><i class="usb-dot"></i>Noch nicht vorbereitet</span>`;
}

function renderGuestUsb(usbList) {
  const list = $("#guestUsbList");
  if (!list) return;

  if (!usbList.length) {
    list.innerHTML = `<div class="empty-state">
      Keine geeignete USB-Partition an der Fotobox erkannt.
      <br><br>
      Einen neuen USB-Stick einstecken und anschließend wird die Liste automatisch aktualisiert.
    </div>`;
    return;
  }

  list.innerHTML = usbList.map((usb) => {
    const label = usb.label || "USB-Stick";
    const filesystem = usb.filesystem || "unbekannt";
    const mountpoint = usb.mountpoint || "nicht gemountet";
    const prepared = Boolean(usb.prepared);
    const canPrepare = ["exfat", "vfat", "ntfs", "ext4"].includes(filesystem.toLowerCase());

    return `<article class="usb-card ${prepared ? "" : "not-prepared"}" data-usb-device="${escapeHtml(usb.device)}">
      <div class="usb-card-top">
        <div>
          <h3>${escapeHtml(label)}</h3>
          <div class="usb-device">${escapeHtml(usb.device)}</div>
        </div>
        ${guestUsbStatus(usb)}
      </div>

      <div class="usb-meta">
        <div><strong>Dateisystem:</strong> ${escapeHtml(filesystem)}</div>
        <div><strong>Mount:</strong> ${escapeHtml(mountpoint)}</div>
        <div><strong>USB-Gerät:</strong> ${escapeHtml(usb.disk || "–")}</div>
      </div>

      <div class="usb-actions">
        ${prepared
          ? `<button class="secondary" type="button" data-usb-refresh>Aktualisieren</button>`
          : canPrepare
            ? `<button class="primary" type="button" data-usb-prepare="${escapeHtml(usb.device)}">Gast-Stick vorbereiten</button>`
            : `<button class="secondary" type="button" disabled>Dateisystem nicht unterstützt</button>`
        }
      </div>

      <div class="usb-note">
        ${prepared
          ? "Vorbereitete Gast-Sticks werden automatisch für die Fotosynchronisation verwendet."
          : "Persönliche Dateien bleiben erhalten. Es wird nicht formatiert oder gelöscht."
        }
      </div>
    </article>`;
  }).join("");

  $$("[data-usb-prepare]").forEach((button) => {
    button.addEventListener("click", () => prepareGuestUsb(button.dataset.usbPrepare));
  });

  $$("[data-usb-refresh]").forEach((button) => {
    button.addEventListener("click", refreshGuestUsb);
  });
}

async function refreshGuestUsb() {
  try {
    const result = await fotoboxUsbRequest();
    renderGuestUsb(result.usb || []);
    setFotoboxState("Fotobox verbunden", "ok");
  } catch (error) {
    console.error(error);
    setFotoboxState("Fotobox nicht erreichbar", "error");

    const list = $("#guestUsbList");
    if (list) {
      list.innerHTML = `<div class="empty-state">
        Die Fotobox ist momentan nicht erreichbar.
        <br><br>
        <strong>192.168.178.254</strong>
      </div>`;
    }
  }
}

async function prepareGuestUsb(device) {
  if (!device) return;

  const confirmed = confirm(
    `Gast-Stick vorbereiten?\n\n` +
    `${device}\n\n` +
    `Es werden nur die Fotobox-Ordner und der Marker angelegt.\n` +
    `Vorhandene persönliche Dateien werden nicht gelöscht.\n\n` +
    `Es wird NICHT formatiert.`
  );

  if (!confirmed) return;

  const card = document.querySelector(`[data-usb-device="${CSS.escape(device)}"]`);
  card?.classList.add("preparing");

  try {
    setFotoboxState("Gast-Stick wird vorbereitet …");

    const result = await fotoboxUsbRequest({
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        action: "prepare",
        device
      })
    });

    await refreshGuestUsb();

    alert(
      `✓ Gast-Stick erfolgreich vorbereitet.\n\n` +
      `${result.device}\n\n` +
      `Der Stick wird jetzt automatisch von der Fotobox verwendet.`
    );
  } catch (error) {
    console.error(error);
    setFotoboxState("Fotobox verbunden", "ok");
    alert(`Gast-Stick konnte nicht vorbereitet werden.\n\n${error.message}`);
    await refreshGuestUsb();
  } finally {
    card?.classList.remove("preparing");
  }
}

function startGuestUsbPolling() {
  if (guestUsbPoll) clearInterval(guestUsbPoll);
  guestUsbPoll = setInterval(refreshGuestUsb, 5000);
}

let saveTimer = null;
function touchSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!appState.currentEvent) return;
    try {
      appState.currentEvent = await apiSaveEvent(appState.currentEvent);
    } catch (error) {
      console.error(error);
      setDbState("API-Fehler");
    }
  }, 250);
}

let liveDesignTimer = null;
let liveDesignPatch = null;
let liveDesignDirty = false;

function queueLivePatch(patch) {
  if (!appState.currentEvent) return;

  // Designänderungen unterhalb von "design" an die Live-API senden.
  const source = patch || {};
  const topLevelKeys = new Set(["design", "name", "date", "format", "contact", "status"]);
  const hasEventLevelKey = Object.keys(source).some((key) => topLevelKeys.has(key));
  const normalizedPatch = hasEventLevelKey ? source : {design: source};

  liveDesignDirty = true;
  liveDesignPatch = { ...(liveDesignPatch || {}), ...(normalizedPatch || {}) };
  clearTimeout(liveDesignTimer);

  liveDesignTimer = setTimeout(async () => {
    const eventId = appState.currentEvent?.id;
    const pendingPatch = liveDesignPatch;

    liveDesignPatch = null;
    if (!eventId || !pendingPatch) return;

    try {
      const updated = await apiLivePatch(eventId, pendingPatch);
      appState.lastLiveUpdatedAt = updated.updatedAt;

      // Den aktuellen Eventstand veröffentlichen, nachdem der Live-Patch
      // erfolgreich gespeichert wurde.
      const eventToPublish = FotoboxEventSchema.normalize(
        JSON.parse(JSON.stringify(appState.currentEvent))
      );

      const published = await publishEventToFotobox(eventToPublish);
      appState.lastLiveUpdatedAt = published.updatedAt;

      liveDesignDirty = false;
      setDbState("API gespeichert · Fotobox synchronisiert");
    } catch (error) {
      console.error(error);
      liveDesignDirty = false;
      setDbState("API-Fehler");
    }
  }, 180);
}
function queueLiveDesign() {
  const design = appState.currentEvent?.design;
  if (!design) return;
  queueLivePatch({design: JSON.parse(JSON.stringify(design))});
}

function dateDE(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : String(value);
}

function eventText(event) {
  return `${event.name || "Dein Event"} · ${dateDE(event.date)}`;
}

function safeFile(value) {
  return String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "event";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setView(name) {
  $("#homeView").classList.toggle("active", name === "home");
  $("#editorView").classList.toggle("active", name === "editor");
}

function setStep(step) {
  appState.currentStep = step;
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $(`#step${step}`).classList.add("active");
  $$("#editorView .step").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.step) === step);
  });
  if (step === 3) {
    renderFinalPreview();
    renderSubmitSummary();
    const published = Boolean(appState.currentEvent?.fotoboxPublishedAt);
    // Ein Event darf mehrfach übertragen werden, z. B. nach Layout- oder Designänderungen.
    $("#approveEvent").disabled = false;
    $("#approveEvent").textContent = published ? "↻ Erneut an Fotobox übertragen" : "✓ Event an Fotobox übertragen";
  }
  window.scrollTo({top: 0, behavior: "smooth"});
}

function bindEventInputs() {
  const event = appState.currentEvent;
  $("#eventName").value = event.name || "";
  $("#eventDate").value = event.date || "";
  $("#contactName").value = event.contact?.name || "";
  $("#contactEmail").value = event.contact?.email || "";
  $("#eventHeading").textContent = event.name || "Neues Event";
  $("#eventId").textContent = event.id;
  $("#eventPin").textContent = event.pin;
  $("#submitPin").textContent = event.pin;
  $("#submitEventId").textContent = event.id;
  $("#canvasTitle").textContent = event.name || "Dein Event";
  $("#metaName").textContent = event.name || "Dein Event";
  $("#metaDate").textContent = dateDE(event.date);

  const qrContainer = document.getElementById("submitQrContainer");
  if (qrContainer) {
    // Hier tragen wir deine feste PC-IP mit Port 8080 ein:
    const localUrl = "http://192.168.0.101:8080/";
    qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(localUrl)}" alt="QR-Code">`;
  }
}

function makeLayout(format, count) {
  const orientation = format === "portrait" ? "portrait" : "landscape";

  const definitions = {
    landscape: {
      1: [{id: "slot-1", x: 7, y: 8, width: 86, height: 84}],
      2: [
        {id: "slot-1", x: 7, y: 8, width: 42, height: 84},
        {id: "slot-2", x: 51, y: 8, width: 42, height: 84}
      ],
      3: [
        {id: "slot-1", x: 7, y: 8, width: 55, height: 84},
        {id: "slot-2", x: 66, y: 8, width: 27, height: 39},
        {id: "slot-3", x: 66, y: 53, width: 27, height: 39}
      ],
      4: [
        {id: "slot-1", x: 7, y: 8, width: 42, height: 40},
        {id: "slot-2", x: 51, y: 8, width: 42, height: 40},
        {id: "slot-3", x: 7, y: 52, width: 42, height: 40},
        {id: "slot-4", x: 51, y: 52, width: 42, height: 40}
      ]
    },

    portrait: {
      1: [{id: "slot-1", x: 8, y: 6, width: 84, height: 88}],
      2: [
        {id: "slot-1", x: 8, y: 6, width: 84, height: 42},
        {id: "slot-2", x: 8, y: 52, width: 84, height: 42}
      ],
      3: [
        {id: "slot-1", x: 8, y: 6, width: 84, height: 52},
        {id: "slot-2", x: 8, y: 62, width: 40, height: 32},
        {id: "slot-3", x: 52, y: 62, width: 40, height: 32}
      ],
      4: [
        {id: "slot-1", x: 8, y: 6, width: 40, height: 42},
        {id: "slot-2", x: 52, y: 6, width: 40, height: 42},
        {id: "slot-3", x: 8, y: 52, width: 40, height: 42},
        {id: "slot-4", x: 52, y: 52, width: 40, height: 42}
      ]
    }
  };

  const slots = definitions[orientation][count] || definitions[orientation][3];

  return {
    id: `${orientation}-${count}`,
    slots: slots.map((slot) => ({...slot}))
  };
}

function layoutCount(design) {
  return design?.layout?.slots?.length || 1;
}

function normalizeSlotMap(slots, count) {
  const normalized = {};
  for (let i = 1; i <= count; i++) {
    normalized[`slot-${i}`] = slots?.[`slot-${i}`] ?? null;
  }
  return normalized;
}

function renderPoster() {
  const event = appState.currentEvent;
  if (!event) return;

  const preview = $("#eventPreview");
  preview.classList.toggle("portrait", event.format === "portrait");
  preview.classList.toggle("landscape", event.format !== "portrait");

  FotoboxRenderer.renderToElement(preview, event, {
    showPlaceholders: true
  });

  renderFinalPreview();
  renderSubmitSummary();
}

function statusLabel(status) {
  return ({draft:"Entwurf", approved:"Freigegeben", ready:"Bereit für die Box"}[status]) || status || "Entwurf";
}

function renderFinalPreview() {
  const event = appState.currentEvent;
  const preview = $("#finalPreview");
  if (!preview || !event) return;
  preview.className = `final-preview ${event.format || "landscape"}`;
  FotoboxRenderer.renderToElement(preview, event);
  $("#previewFormat").textContent = event.format === "portrait" ? "10 × 15 cm · Hochformat" : "15 × 10 cm · Querformat";
  $("#previewInfo").innerHTML = `<div><strong>${escapeHtml(event.name || "Unbenanntes Event")}</strong></div><div>${dateDE(event.date) || "Kein Datum"} · ${event.design?.layout?.slots?.length || 0} Bildplätze · ${event.design?.printer?.copies || 1} ${event.design?.printer?.copies === 1 ? "Exemplar" : "Exemplare"}</div><div>Status: <strong>${escapeHtml(statusLabel(event.status))}</strong></div>`;
}

function renderSubmitSummary() {
  const event = appState.currentEvent;
  const el = $("#submitSummary");
  if (!el || !event) return;
  const d = event.design || {};
  el.innerHTML = `<div class="summary-item"><span>Event</span><strong>${escapeHtml(event.name || "Unbenannt")}</strong></div><div class="summary-item"><span>Datum</span><strong>${escapeHtml(dateDE(event.date) || "–")}</strong></div><div class="summary-item"><span>Format</span><strong>${event.format === "portrait" ? "10 × 15 cm hoch" : "15 × 10 cm quer"}</strong></div><div class="summary-item"><span>Layout</span><strong>${d.layout?.slots?.length || 0} Bildplätze</strong></div><div class="summary-item"><span>Drucker</span><strong>${d.printer?.enabled === false ? "Manuell" : `SELPHY · ${d.printer?.copies || 1}×`}</strong></div><div class="summary-item"><span>Grafiken</span><strong>${d.graphics?.length || 0}</strong></div>`;
}

function applyStageSize() {
  const event = appState.currentEvent;
  const stage = $("#canvasStage");
  stage.classList.toggle("landscape", event.format === "landscape");
  stage.classList.toggle("portrait", event.format === "portrait");
}

function renderStage() {
  const event = appState.currentEvent;
  const design = event.design;
  const stage = $("#canvasStage");
  stage.innerHTML = "";
  stage.className = `canvas-stage ${event.format}`;

  // Shared renderer: same event contract later used by the real Raspberry Pi.
  FotoboxRenderer.renderToElement(stage, event);

  // Editor interaction layer.
  [...stage.querySelectorAll(".shared-render-slot")].forEach((slot, index) => {
    const slotNumber = index + 1;
    slot.classList.add("photo-slot");
    slot.classList.toggle("selected", appState.selected === `slot${slotNumber}`);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "photo-resize-handle";
    slot.appendChild(resizeHandle);

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "photo-rotate-handle";
    slot.appendChild(rotateHandle);

    slot.addEventListener("pointerdown", (event) => {
      const slotId = slot.dataset.slotId;
      const slotDefinition = design.layout?.slots?.find((item) => item.id === slotId);
      if (!slotDefinition) return;

      appState.selected = `slot${slotNumber}`;
      appState.selectedSlot = slotNumber;

      if (event.target.classList.contains("photo-resize-handle")) {
        beginPhotoSlotResize(event, slotDefinition);
        return;
      }

      if (event.target.classList.contains("photo-rotate-handle")) {
        beginPhotoSlotRotate(event, slotDefinition);
        return;
      }

      updateInspector();
      beginPhotoSlotDrag(event, slotDefinition);
    });

    slot.addEventListener("dragover", (event) => event.preventDefault());
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/image-id");
      if (!id) return;
      const slotId = slot.dataset.slotId;
      design.slots[slotId] = id;
      appState.selected = `slot${slotNumber}`;
      appState.selectedSlot = slotNumber;
      renderStage();
      updateInspector();
      touchSave();
    });
  });

  // Editor-Grafiken erhalten Auswahl und direkte Maus-/Touch-Bedienung.
  [...stage.querySelectorAll(".shared-render-graphic")].forEach((graphicEl) => {
    const graphicId = graphicEl.dataset.graphicId;
    const graphic = design.graphics?.find((item) => item.id === graphicId);
    if (!graphic) return;
    graphicEl.classList.add("graphic-object");
    graphicEl.classList.toggle("selected", appState.selected === `graphic:${graphicId}`);

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "rotate-handle";
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    graphicEl.append(rotateHandle, resizeHandle);

    graphicEl.addEventListener("pointerdown", (event) => {
      if (event.target.classList.contains("rotate-handle")) {
        beginGraphicRotate(event, graphic);
        return;
      }
      if (event.target.classList.contains("resize-handle")) {
        beginGraphicResize(event, graphic);
        return;
      }
      appState.selected = `graphic:${graphicId}`;
      updateInspector();
      beginGraphicDrag(event, graphic);
    });
  });

  // Editor text object replaces shared renderer text for handles.
  stage.querySelector(".shared-render-text")?.remove();
  const text = document.createElement("div");
  text.className = "text-object";
  if (appState.selected === "text") text.classList.add("selected");
  text.textContent = design.text.content || eventText(event);
  text.style.left = `${design.text.x}%`;
  text.style.bottom = `${100 - design.text.y}%`;
  text.style.transform = `translateX(-50%) rotate(${design.text.rotation}deg) scale(${design.text.scale})`;
  text.style.color = design.text.color;
  text.style.fontFamily = design.text.fontFamily;
  text.style.fontSize = `${design.text.fontSize}px`;

  const rotateHandle = document.createElement("div");
  rotateHandle.className = "rotate-handle";
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  text.append(rotateHandle, resizeHandle);
  stage.appendChild(text);

  text.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("rotate-handle")) {
      beginRotate(event);
      return;
    }
    if (event.target.classList.contains("resize-handle")) {
      beginResize(event);
      return;
    }
    appState.selected = "text";
    beginDrag(event);
  });

  stage.style.transform = `scale(${appState.zoom})`;
  $("#zoomValue").textContent = `${Math.round(appState.zoom * 100)} %`;
  applyStageSize();
  renderPhonePreview();
}

function renderAll() {
  bindEventInputs();
  renderPoster();
  renderStage();
  renderToolPanel($(".tool-tab.active")?.dataset.tool || "layout");
  updateInspector();
  $$(".format-card").forEach((button) => {
    button.classList.toggle("selected", button.dataset.format === appState.currentEvent.format);
  });
}

async function renderToolPanel(tool) {
  $$(".tool-tab").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  const content = $("#toolContent");
  const design = appState.currentEvent.design;

  if (tool === "layout") {
    content.innerHTML = `<div class="tool-block"><h4>Layouts</h4><div class="tool-list">
      ${[1,2,3,4].map((count) => `<button class="${layoutCount(design) === count ? "active" : ""}" data-layout="${count}">${count} Bild${count > 1 ? "er" : ""}<span style="float:right">▦</span></button>`).join("")}
    </div></div>`;
    $$('[data-layout]').forEach((button) => button.addEventListener("click", () => {
      const count = Number(button.dataset.layout);
      design.layout = makeLayout(appState.currentEvent?.format || "landscape", count);
      design.slots = normalizeSlotMap(design.slots, count);
      renderAll();
      queueLiveDesign();
    }));
    return;
  }

  if (tool === "background") {
    const colors = [
      "#d9edc8","#eddba4","#eec6cd","#cbd9ec","#e4d0b9","#d9c7eb",
      "#000000","#23241f","#555555","#888888","#bbbbbb","#ffffff",
      "#7e354d","#a83250","#d9534f","#ef8a62","#f4b183","#f6c6cf",
      "#d9a7b0","#e8c4a2","#d0aa4e","#f2d675","#fff2a8","#8a9b45",
      "#4f7d43","#a8c686","#4c9b91","#8ecdc5","#cbd9ec","#6387bd",
      "#293f70","#8c6bb1","#d9c7eb","#f2e6d8"
    ];
    const currentBg = design.background?.value || "#d9edc8";
    content.innerHTML = `<div class="tool-block">
      <h4>Hintergründe</h4>
      <div class="thumb-grid background-palette">${colors.map((color) =>
        `<button type="button" class="thumb ${currentBg===color?"active":""}"
          style="background:${color}" title="${color}" aria-label="Hintergrund ${color}"
          data-bg="${color}"></button>`
      ).join("")}</div>
      <div class="custom-color-row">
        <input id="backgroundColorPicker" type="color" value="${currentBg}">
        <span>Eigene Hintergrundfarbe</span>
        <code id="backgroundColorValue">${currentBg}</code>
      </div>
    </div>`;
    $$('[data-bg]').forEach((button) => button.addEventListener("click", () => {
      design.background = {type: "color", value: button.dataset.bg};
      renderAll();
      queueLiveDesign();
    }));
    $("#backgroundColorPicker").addEventListener("input", (event) => {
      const value = event.target.value;
      design.background = {type: "color", value};
      $("#backgroundColorValue").textContent = value;
      renderAll();
      queueLiveDesign();
    });
    return;
  }

  if (tool === "frame") {
    const frames = [
      {id:"thin", label:"Feine Linie", value:"#ffffff"},
      {id:"gold", label:"Gold", value:"#d0aa4e"},
      {id:"dark", label:"Dunkel", value:"#23241f"},
      {id:"none", label:"Kein Rahmen", value:""}
    ];
    content.innerHTML = `<div class="tool-block"><h4>Rahmen</h4><div class="tool-list">${frames.map(f => `<button class="${(design.frame?.type || "thin") === f.id ? "active" : ""}" data-frame-id="${f.id}" data-frame-value="${f.value}">${f.label}</button>`).join("")}</div></div>`;
    $$('[data-frame-id]').forEach((button) => button.addEventListener("click", () => {
      design.frame = {type: button.dataset.frameId, value: button.dataset.frameValue};
      renderStage();
      renderFinalPreview();
      renderSubmitSummary();
      renderToolPanel("frame");
      queueLivePatch({frame: {...design.frame}});
    }));
    return;
  }

  if (tool === "text") {
    content.innerHTML = `<div class="tool-block"><h4>Text</h4>
      <label class="field"><span>Inhalt</span><input id="textInput" value="${escapeHtml(design.text.content)}"></label>
      <label class="field"><span>Schrift</span><select id="fontInput"><option>Fraunces</option><option>Georgia</option><option>Arial</option></select></label>
    </div>`;
    $("#textInput").addEventListener("input", (event) => {
      design.text.content = event.target.value;
      renderStage();
      queueLivePatch({text: {...design.text}});
    });
    $("#fontInput").value = design.text.fontFamily || "Fraunces";
    $("#fontInput").addEventListener("change", (event) => {
      design.text.fontFamily = event.target.value;
      renderStage();
      queueLivePatch({text: {...design.text}});
    });
    return;
  }

  if (tool === "permissions") {
    const event = appState.currentEvent;

    event.mediaPermissions = event.mediaPermissions || {
      graphics: [],
      images: []
    };

    event.mediaPermissions.graphics =
      Array.isArray(event.mediaPermissions.graphics)
        ? event.mediaPermissions.graphics
        : [];

    event.mediaPermissions.images =
      Array.isArray(event.mediaPermissions.images)
        ? event.mediaPermissions.images
        : [];

    let assets = [];

    try {
      const response = await fetch("api/media.php", {
        cache: "no-store",
        headers: {Accept: "application/json"}
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Medien konnten nicht geladen werden.");
      }

      assets = Array.isArray(data.assets) ? data.assets : [];
    } catch (error) {
      console.error("Freigaben: Medienbibliothek konnte nicht geladen werden.", error);

      content.innerHTML = `
        <div class="tool-block">
          <h4>Freigaben</h4>
          <p style="color:#b33">
            Medienbibliothek konnte nicht geladen werden.
          </p>
        </div>
      `;
      return;
    }

    const graphics = assets
      .filter((asset) => asset.type === "graphic")
      .sort((a, b) =>
        String(a.folder || "").localeCompare(String(b.folder || "")) ||
        String(a.name || "").localeCompare(String(b.name || ""))
      );

    const images = assets
      .filter((asset) => asset.type === "image")
      .sort((a, b) =>
        String(a.folder || "").localeCompare(String(b.folder || "")) ||
        String(a.name || "").localeCompare(String(b.name || ""))
      );

    const usedGraphicIds = new Set(
      (design.graphics || [])
        .map((graphic) => graphic.assetId)
        .filter(Boolean)
        .map(String)
    );

    const usedImageIds = new Set(
      (design.images || [])
        .map((image) => image.assetId)
        .filter(Boolean)
        .map(String)
    );

    const renderMediaPermissions = (
      type,
      title,
      list,
      permissionKey,
      usedIds
    ) => {
      if (!list.length) {
        return `
          <section class="tool-block">
            <h4>${title}</h4>
            <p style="color:#777;font-size:13px">
              Keine Medien in der zentralen Bibliothek.
            </p>
          </section>
        `;
      }

      const cards = list.map((asset) => {
        const id = String(asset.id);
        const allowed =
          event.mediaPermissions[permissionKey].map(String).includes(id);

        return `
          <label class="media-permission-item"
                 data-permission-item="${escapeHtml(id)}">
            <div class="media-permission-thumb">
              <img
                src="${escapeHtml(asset.url || "")}"
                alt="${escapeHtml(asset.name || "Medium")}"
              >
            </div>

            <div class="media-permission-details">
              <strong>${escapeHtml(asset.name || "Medium")}</strong>
              <span>${escapeHtml(asset.folder || "Sonstiges")}</span>
            </div>

            <input
              type="checkbox"
              class="media-permission-checkbox"
              data-permission-type="${type}"
              data-permission-id="${escapeHtml(id)}"
              ${allowed ? "checked" : ""}
            >
          </label>
        `;
      }).join("");

      return `
        <section class="tool-block">
          <h4>${title}</h4>
          <p style="color:#777;font-size:13px;margin-top:-4px">
            Diese Medien stehen an der Fotobox nur zur Verfügung,
            wenn sie für dieses Event freigegeben sind.
          </p>
          <div class="media-permission-list">
            ${cards}
          </div>
        </section>
      `;
    };

    content.innerHTML = `
      <div class="tool-block">
        <h4>Event-Freigaben</h4>
        <p style="color:#777;font-size:13px">
          Lege fest, welche Medien aus der zentralen Medienbibliothek
          an der Fotobox für dieses Event verwendet werden dürfen.
        </p>
      </div>

      ${renderMediaPermissions(
        "graphic",
        "Grafiken",
        graphics,
        "graphics",
        usedGraphicIds
      )}

      ${renderMediaPermissions(
        "image",
        "Bilder",
        images,
        "images",
        usedImageIds
      )}
    `;

    $$(".media-permission-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const type = checkbox.dataset.permissionType;
        const id = String(checkbox.dataset.permissionId);
        const key = type === "graphic" ? "graphics" : "images";

        const current = new Set(
          (event.mediaPermissions[key] || []).map(String)
        );

        if (checkbox.checked) {
          current.add(id);
        } else {
          current.delete(id);
        }

        event.mediaPermissions[key] = [...current];

        queueLivePatch({
          mediaPermissions: {
            graphics: [...event.mediaPermissions.graphics],
            images: [...event.mediaPermissions.images]
          }
        });

        touchSave();
      });
    });

    return;
  }

  if (tool === "graphics") {
    const cards = (design.graphics || []).length
      ? design.graphics.map((graphic) => `<div class="graphic-card" data-graphic-id="${graphic.id}">
          <img src="${graphic.src}" alt="">
          <div class="graphic-card-name">${escapeHtml(graphic.name || "Grafik")}</div>
          <button type="button" data-remove-graphic="${graphic.id}">×</button>
        </div>`).join("")
      : "<p style='color:#777;font-size:13px'>Noch keine Grafiken hochgeladen.</p>";

    content.innerHTML = `<div class="tool-block"><h4>Dekoration & Grafiken</h4>
      <div class="upload-zone" id="graphicUploadZone">PNG, JPG oder GIF hineinziehen<br>oder auswählen<br>
        <button class="secondary" id="pickGraphics" style="margin-top:8px">Grafik auswählen</button>
        <input id="graphicFileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>
      </div>
      <div class="graphic-list">${cards}</div>
    </div>`;

    const zone = $("#graphicUploadZone");
    const input = $("#graphicFileInput");
    $("#pickGraphics").addEventListener("click", () => input.click());
    input.addEventListener("change", (event) => handleGraphicFiles([...event.target.files]));
    zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("drag"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag");
      handleGraphicFiles([...event.dataTransfer.files].filter((file) => file.type.startsWith("image/")));
    });

    $$(".graphic-card").forEach((card) => card.addEventListener("click", () => {
      const id = card.dataset.graphicId;
      appState.selected = `graphic:${id}`;
      renderStage();
      updateInspector();
    }));

    $$('[data-remove-graphic]').forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.removeGraphic;
      design.graphics = (design.graphics || []).filter((graphic) => graphic.id !== id);
      if (appState.selected === `graphic:${id}`) appState.selected = "text";
      renderAll();
      touchSave();
      queueLivePatch({graphics: [...design.graphics]});
    }));
    return;
  }

  const cards = design.images.length
    ? design.images.map((image) => `<div class="thumb-photo" draggable="true" data-image-id="${image.id}">
        <img src="${image.src}" alt="">
        <button type="button" data-remove="${image.id}">×</button>
      </div>`).join("")
    : "<p style='color:#777;font-size:13px'>Noch keine Bilder hochgeladen.</p>";

  content.innerHTML = `<div class="upload-zone" id="uploadZone">Bilder hineinziehen<br>oder auswählen<br>
    <button class="secondary" id="pickImages" style="margin-top:8px">Bilder auswählen</button>
    <input id="fileInput" type="file" accept="image/*" multiple hidden>
  </div><div class="thumb-grid">${cards}</div>`;

  const zone = $("#uploadZone");
  const input = $("#fileInput");
  $("#pickImages").addEventListener("click", () => input.click());
  input.addEventListener("change", (event) => handleFiles([...event.target.files]));
  zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag");
    handleFiles([...event.dataTransfer.files].filter((file) => file.type.startsWith("image/")));
  });

  $$(".thumb-photo").forEach((element) => {
    element.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/image-id", element.dataset.imageId));
    element.addEventListener("dblclick", () => {
      design.slots[`slot-${appState.selectedSlot}`] = element.dataset.imageId;
      renderAll();
      touchSave();
    });
  });

  $$('[data-remove]').forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.remove;
    design.images = design.images.filter((image) => image.id !== id);
    Object.keys(design.slots).forEach((slotId) => {
      if (design.slots[slotId] === id) design.slots[slotId] = null;
    });
    renderAll();
    touchSave();
  }));
}

async function handleFiles(files) {
  for (const file of files) {
    const image = await prepareImage(file);
    appState.currentEvent.design.images.push(image);
  }
  const design = appState.currentEvent.design;
  if (design.images.length && !design.slots[`slot-${appState.selectedSlot}`]) {
    design.slots[`slot-${appState.selectedSlot}`] = design.images[design.images.length - 1].id;
  }
  renderAll();
  touchSave();
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          src: canvas.toDataURL("image/jpeg", 0.84)
        });
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function prepareGraphic(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          src: canvas.toDataURL("image/png"),
          x: 50,
          y: 50,
          width: 15,
          rotation: 0,
          opacity: 1
        });
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

  async function handleGraphicFiles(files) {
    const design = appState.currentEvent.design;
    design.graphics ??= [];

    for (const file of files) {
      try {
        // Datei in die zentrale Grafikbibliothek hochladen.
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          "/studio/api/graphics-upload.php",
          {
            method: "POST",
            body: formData
          }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        // Für das aktuelle Event weiterhin eine Data-URL erzeugen.
        const graphic = await prepareGraphic(file);

        // Verweis auf die zentrale Bibliothek speichern.
        graphic.assetId = data.asset.id;
        graphic.assetFile = data.asset.file;
        graphic.assetUrl = data.asset.url;

        design.graphics.push(graphic);
        appState.selected = `graphic:${graphic.id}`;

      } catch (error) {
        console.error("Grafik konnte nicht geladen werden", error);
        alert(error.message || "Grafik konnte nicht hinzugefügt werden.");
      }
    }

    renderAll();
    touchSave();
    queueLivePatch({graphics: [...design.graphics]});
  }

function selectedGraphic() {
  const design = appState.currentEvent?.design;
  if (!design || !appState.selected?.startsWith("graphic:")) return null;
  const id = appState.selected.slice("graphic:".length);
  return (design.graphics || []).find((graphic) => graphic.id === id) || null;
}

function updateInspector() {
  const design = appState.currentEvent.design;
  const inspector = $("#inspector");

  const graphic = selectedGraphic();
  if (graphic) {
    inspector.innerHTML = `<div class="inspector-block"><h4>Grafik</h4>
      <p class="inspector-file">${escapeHtml(graphic.name || "Grafik")}</p>

      <label class="field">
        <span>Breite</span>
        <input id="graphicWidth" type="number" min="3" max="100" step="0.1"
          value="${Number(graphic.width ?? 15).toFixed(1)}">
      </label>

      <label class="field">
        <span>Position X</span>
        <input id="graphicX" type="number" min="0" max="100" step="0.1"
          value="${Number(graphic.x ?? 50).toFixed(1)}">
      </label>

      <label class="field">
        <span>Position Y</span>
        <input id="graphicY" type="number" min="0" max="100" step="0.1"
          value="${Number(graphic.y ?? 50).toFixed(1)}">
      </label>

      <label class="field">
        <span>Drehung</span>
        <input id="graphicRotation" type="number" min="-180" max="180" step="0.1"
          value="${Number(graphic.rotation ?? 0).toFixed(1)}">
      </label>

      <label class="field">
        <span>Deckkraft</span>
        <div class="range-row">
          <input id="graphicOpacity" type="range" min="0.1" max="1" step="0.05"
            value="${graphic.opacity ?? 1}">
          <span class="range-value">${Math.round((graphic.opacity ?? 1) * 100)}%</span>
        </div>
      </label>

      <button type="button" class="secondary full" id="deleteGraphic">
        Grafik löschen
      </button>
    </div>`;

    $("#graphicWidth").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      graphic.width = Math.max(3, Math.min(100, value));
      renderStage();
      queueLivePatch({graphics: [...design.graphics]});
    });

    $("#graphicX").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      graphic.x = Math.max(0, Math.min(100, value));
      renderStage();
      queueLivePatch({graphics: [...design.graphics]});
    });

    $("#graphicY").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      graphic.y = Math.max(0, Math.min(100, value));
      renderStage();
      queueLivePatch({graphics: [...design.graphics]});
    });

    $("#graphicRotation").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      graphic.rotation = Math.max(-180, Math.min(180, value));
      renderStage();
      queueLivePatch({graphics: [...design.graphics]});
    });

    $("#graphicOpacity").addEventListener("input", (event) => {
      graphic.opacity = Number(event.target.value);
      event.target.nextElementSibling.textContent =
        `${Math.round(graphic.opacity * 100)}%`;
      renderStage();
      queueLivePatch({graphics: [...design.graphics]});
    });

    $("#deleteGraphic").addEventListener("click", () => {
      design.graphics = design.graphics.filter((item) => item.id !== graphic.id);
      appState.selected = "text";
      renderAll();
      touchSave();
      queueLivePatch({graphics: [...design.graphics]});
    });
    return;
  }

  if (appState.selected.startsWith("slot")) {
    const slotId = `slot-${appState.selectedSlot}`;
    const imageId = design.slots[slotId];
    const image = design.images.find((item) => item.id === imageId);
    const slotDefinition =
      design.layout?.slots?.find((item) => item.id === slotId);

    if (!slotDefinition) {
      inspector.innerHTML = `
        <div class="inspector-block">
          <h4>Bild ${appState.selectedSlot}</h4>
          <p>Foto-Slot nicht gefunden.</p>
        </div>`;
      return;
    }

    const x = Number(slotDefinition.x ?? 0);
    const y = Number(slotDefinition.y ?? 0);
    const width = Number(slotDefinition.width ?? 10);
    const height = Number(slotDefinition.height ?? 10);
    const rotation = Number(slotDefinition.rotation ?? 0);

    inspector.innerHTML = `
      <div class="inspector-block">
        <h4>Bild ${appState.selectedSlot}</h4>

        <p style="margin:0 0 12px;color:#777;font-size:13px">
          ${image ? escapeHtml(image.name) : "Noch kein Bild – über „Bilder“ auswählen."}
        </p>

        <label class="field">
          <span>Position X</span>
          <input id="slotX" type="number" min="0" max="100"
            step="0.1" value="${x.toFixed(1)}">
        </label>

        <label class="field">
          <span>Position Y</span>
          <input id="slotY" type="number" min="0" max="100"
            step="0.1" value="${y.toFixed(1)}">
        </label>

        <label class="field">
          <span>Breite</span>
          <input id="slotWidth" type="number" min="5" max="100"
            step="0.1" value="${width.toFixed(1)}">
        </label>

        <label class="field">
          <span>Höhe</span>
          <input id="slotHeight" type="number" min="5" max="100"
            step="0.1" value="${height.toFixed(1)}">
        </label>

        <label class="field">
          <span>Drehung</span>
          <input id="slotRotation" type="number" min="-180" max="180"
            step="0.1" value="${rotation.toFixed(1)}">
        </label>

      </div>

      <div class="inspector-block">
        <h4>Auswahl</h4>
        <button class="secondary full" id="selectImageTool">
          Bilder öffnen
        </button>
      </div>`;

    function updateSlotFromInspector() {
      slotDefinition.x = Math.max(
        0,
        Math.min(100, Number($("#slotX").value) || 0)
      );

      slotDefinition.y = Math.max(
        0,
        Math.min(100, Number($("#slotY").value) || 0)
      );

      slotDefinition.width = Math.max(
        5,
        Math.min(100, Number($("#slotWidth").value) || 5)
      );

      slotDefinition.height = Math.max(
        5,
        Math.min(100, Number($("#slotHeight").value) || 5)
      );

      slotDefinition.rotation = Math.max(
        -180,
        Math.min(180, Number($("#slotRotation").value) || 0)
      );

      renderStage();

      queueLivePatch({
        layout: {
          ...appState.currentEvent.design.layout,
          slots: appState.currentEvent.design.layout.slots.map(
            (slot) => ({...slot})
          )
        }
      });
    }

    ["slotX", "slotY", "slotWidth", "slotHeight", "slotRotation"]
      .forEach((id) => {
        $("#" + id).addEventListener("change", updateSlotFromInspector);
      });

    $("#selectImageTool").addEventListener(
      "click",
      () => renderToolPanel("images")
    );

    return;
  }

  inspector.innerHTML = `<div class="inspector-block"><h4>Text</h4>

    <label class="field">
      <span>Inhalt</span>
      <input id="insText" value="${escapeHtml(design.text.content)}">
    </label>

    <label class="field">
      <span>Position X</span>
      <input id="textX" type="number" min="0" max="100" step="0.1"
        value="${Number(design.text.x ?? 50).toFixed(1)}">
    </label>

    <label class="field">
      <span>Position Y</span>
      <input id="textY" type="number" min="0" max="100" step="0.1"
        value="${Number(design.text.y ?? 89).toFixed(1)}">
    </label>

    <label class="field">
      <span>Größe</span>
      <input id="textScale" type="number" min="10" max="300" step="1"
        value="${Math.round(Number(design.text.scale ?? 1) * 100)}">
    </label>

    <label class="field">
      <span>Drehung</span>
      <input id="textRotation" type="number" min="-180" max="180" step="0.1"
        value="${Number(design.text.rotation ?? 0).toFixed(1)}">
    </label>

    <label class="field">
      <span>Farbe</span>
      <div class="color-row">${[
        "#000000","#23241f","#555555","#888888","#bbbbbb","#ffffff",
        "#7e354d","#a83250","#d9534f","#ef8a62","#f4b183",
        "#f6c6cf","#eec6cd","#d9a7b0","#e8c4a2","#d0aa4e",
        "#f2d675","#fff2a8","#8a9b45","#4f7d43","#a8c686",
        "#d9edc8","#4c9b91","#8ecdc5","#cbd9ec","#6387bd",
        "#293f70","#8c6bb1","#d9c7eb","#f2e6d8"
      ].map((color) =>
        `<button type="button" class="color-btn ${design.text.color===color?"active":""}"
          style="background:${color}" title="${color}" aria-label="Textfarbe ${color}"
          data-color="${color}"></button>`
      ).join("")}</div>
      <div class="custom-color-row">
        <input id="textColorPicker" type="color"
          value="${design.text.color || "#d0aa4e"}">
        <span>Eigene Farbe wählen</span>
        <code id="textColorValue">${design.text.color || "#d0aa4e"}</code>
      </div>
    </label>

    <div class="layer-btns">
      <button type="button" id="centerText">Zentrieren</button>
      <button type="button" id="bottomText">Unten</button>
    </div>
  </div>`;

  $("#insText").addEventListener("input", (event) => {
    design.text.content = event.target.value;
    renderStage();
    queueLivePatch({text: {...design.text}});
  });

  $("#textX").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    design.text.x = Math.max(0, Math.min(100, value));
    renderStage();
    queueLivePatch({text: {...design.text}});
  });

  $("#textY").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    design.text.y = Math.max(0, Math.min(100, value));
    renderStage();
    queueLivePatch({text: {...design.text}});
  });

  $("#textScale").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    design.text.scale = Math.max(0.1, Math.min(3, value / 100));
    renderStage();
    queueLivePatch({text: {...design.text}});
  });

  $("#textRotation").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    design.text.rotation = Math.max(-180, Math.min(180, value));
    renderStage();
    queueLivePatch({text: {...design.text}});
  });

  $$('[data-color]').forEach((button) => button.addEventListener("click", () => {
    design.text.color = button.dataset.color;
    renderStage();
    updateInspector();
    queueLivePatch({text: {...design.text}});
  }));
  $("#textColorPicker").addEventListener("input", (event) => {
    design.text.color = event.target.value;
    $("#textColorValue").textContent = event.target.value;
    renderStage();
    updateInspector();
    queueLivePatch({text: {...design.text}});
  });
  $("#centerText").addEventListener("click", () => { design.text.x = 50; renderStage(); updateInspector(); queueLivePatch({text: {...design.text}}); });
  $("#bottomText").addEventListener("click", () => { design.text.y = 89; renderStage(); updateInspector(); queueLivePatch({text: {...design.text}}); });
}

function stagePoint(event) {
  const rect = $("#canvasStage").getBoundingClientRect();
  return {x: event.clientX - rect.left, y: event.clientY - rect.top};
}

const FRAME_EDIT_BOUNDS = {
  left: 5.5556,
  top: 4.1667,
  right: 94.4444,
  bottom: 95.8333
};

function getFrameEditBounds() {
  return FRAME_EDIT_BOUNDS;
}

function clampToRange(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function getStageElement(selectorFn) {
  try {
    return selectorFn();
  } catch (error) {
    return null;
  }
}

function beginPhotoSlotResize(event, slotDefinition) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;

  const startWidth = Number(slotDefinition.width ?? 10);
  const startHeight = Number(slotDefinition.height ?? 10);

  function move(pointerEvent) {
    const rect = $("#canvasStage").getBoundingClientRect();

    const dx = (pointerEvent.clientX - startX) / rect.width * 100;
    const dy = (pointerEvent.clientY - startY) / rect.height * 100;

    const bounds = getFrameEditBounds();

    slotDefinition.x = clampToRange(
      Number(slotDefinition.x ?? 0),
      bounds.left,
      bounds.right - 5
    );

    slotDefinition.y = clampToRange(
      Number(slotDefinition.y ?? 0),
      bounds.top,
      bounds.bottom - 5
    );

    const maxWidth = bounds.right - slotDefinition.x;
    const maxHeight = bounds.bottom - slotDefinition.y;

    slotDefinition.width = Math.max(
      5,
      Math.min(maxWidth, startWidth + dx)
    );

    slotDefinition.height = Math.max(
      5,
      Math.min(maxHeight, startHeight + dy)
    );

    renderStage();
  }

  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);

    updateInspector();

    queueLivePatch({
      layout: {
        ...appState.currentEvent.design.layout,
        slots: appState.currentEvent.design.layout.slots.map((slot) => ({...slot}))
      }
    });
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginPhotoSlotRotate(event, slotDefinition) {
  event.preventDefault();
  event.stopPropagation();

  const stage = $("#canvasStage");

  function getAngle(pointerEvent) {
    const rect = stage.getBoundingClientRect();

    const centerX =
      rect.left +
      (Number(slotDefinition.x ?? 0) + Number(slotDefinition.width ?? 10) / 2) / 100 * rect.width;

    const centerY =
      rect.top +
      (Number(slotDefinition.y ?? 0) + Number(slotDefinition.height ?? 10) / 2) / 100 * rect.height;

    const angle = Math.atan2(
      pointerEvent.clientY - centerY,
      pointerEvent.clientX - centerX
    ) * 180 / Math.PI;

    return angle + 90;
  }

  const startRotation = Number(slotDefinition.rotation ?? 0);
  const startAngle = getAngle(event);

  function move(pointerEvent) {
    const currentAngle = getAngle(pointerEvent);
    let rotation = startRotation + (currentAngle - startAngle);

    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;

    slotDefinition.rotation = Math.round(rotation * 10) / 10;

    renderStage();
  }

  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);

    updateInspector();

    queueLivePatch({
      layout: {
        ...appState.currentEvent.design.layout,
        slots: appState.currentEvent.design.layout.slots.map((slot) => ({...slot}))
      }
    });
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginPhotoSlotDrag(event, slotDefinition) {
  event.preventDefault();
  event.stopPropagation();

  const start = stagePoint(event);
  const x0 = Number(slotDefinition.x ?? 0);
  const y0 = Number(slotDefinition.y ?? 0);
  const width = Number(slotDefinition.width ?? 10);
  const height = Number(slotDefinition.height ?? 10);

  function move(pointerEvent) {
    const point = stagePoint(pointerEvent);
    const rect = $("#canvasStage").getBoundingClientRect();

    const dx = (point.x - start.x) / rect.width * 100;
    const dy = (point.y - start.y) / rect.height * 100;

    const bounds = getFrameEditBounds();
    const element = getStageElement(() =>
      [...document.querySelectorAll(".photo-slot")]
        .find((node) => node.dataset.slotId === slotDefinition.id)
    );

    let nextX = x0 + dx;
    let nextY = y0 + dy;

    if (element) {
      const box = element.getBoundingClientRect();
      const centerHalfW = box.width / (2 * rect.width) * 100;
      const centerHalfH = box.height / (2 * rect.height) * 100;

      const centerX = clampToRange(
        nextX + width / 2,
        bounds.left + centerHalfW,
        bounds.right - centerHalfW
      );

      const centerY = clampToRange(
        nextY + height / 2,
        bounds.top + centerHalfH,
        bounds.bottom - centerHalfH
      );

      nextX = centerX - width / 2;
      nextY = centerY - height / 2;
    }

    slotDefinition.x = clampToRange(
      nextX,
      bounds.left,
      bounds.right - width
    );

    slotDefinition.y = clampToRange(
      nextY,
      bounds.top,
      bounds.bottom - height
    );

    renderStage();
  }

  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({
      layout: {
        ...appState.currentEvent.design.layout,
        slots: appState.currentEvent.design.layout.slots.map((slot) => ({...slot}))
      }
    });
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginGraphicDrag(event, graphic) {
  event.preventDefault();
  event.stopPropagation();
  const start = stagePoint(event);
  const x0 = graphic.x ?? 50;
  const y0 = graphic.y ?? 50;

  function move(pointerEvent) {
    const point = stagePoint(pointerEvent);
    const rect = $("#canvasStage").getBoundingClientRect();
    const bounds = getFrameEditBounds();

    let nextX =
      x0 + (point.x - start.x) / rect.width * 100;

    let nextY =
      y0 + (point.y - start.y) / rect.height * 100;

    const element = getStageElement(() =>
      [...document.querySelectorAll(".shared-render-graphic")]
        .find((node) => node.dataset.graphicId === graphic.id)
    );

    if (element) {
      const box = element.getBoundingClientRect();

      const halfW =
        box.width / (2 * rect.width) * 100;

      const halfH =
        box.height / (2 * rect.height) * 100;

      nextX = clampToRange(
        nextX,
        bounds.left + halfW,
        bounds.right - halfW
      );

      nextY = clampToRange(
        nextY,
        bounds.top + halfH,
        bounds.bottom - halfH
      );
    } else {
      nextX = clampToRange(
        nextX,
        bounds.left,
        bounds.right
      );

      nextY = clampToRange(
        nextY,
        bounds.top,
        bounds.bottom
      );
    }

    graphic.x = nextX;
    graphic.y = nextY;

    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({graphics: [...appState.currentEvent.design.graphics]});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginGraphicResize(event, graphic) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = graphic.width ?? 15;
  function move(pointerEvent) {
    const rect = $("#canvasStage").getBoundingClientRect();
    const bounds = getFrameEditBounds();

    const element = getStageElement(() =>
      [...document.querySelectorAll(".shared-render-graphic")]
        .find((node) => node.dataset.graphicId === graphic.id)
    );

    let maxWidth = 60;

    if (element) {
      const baseWidth = Math.max(1, element.offsetWidth);
      const baseHeight = Math.max(1, element.offsetHeight);
      const aspect = baseHeight / baseWidth;

      const availableHalfX = Math.min(
        Number(graphic.x ?? 50) - bounds.left,
        bounds.right - Number(graphic.x ?? 50)
      );

      const availableHalfY = Math.min(
        Number(graphic.y ?? 50) - bounds.top,
        bounds.bottom - Number(graphic.y ?? 50)
      );

      const maxWidthX =
        (availableHalfX * 2 * rect.width) / 100;

      const maxWidthY =
        (availableHalfY * 2 * rect.height) /
        100 /
        Math.max(0.01, aspect);

      maxWidth = Math.min(
        60,
        (Math.min(maxWidthX, maxWidthY) / rect.width) * 100
      );
    }

    graphic.width = Math.max(
      3,
      Math.min(
        maxWidth,
        startWidth +
          (pointerEvent.clientX - startX) / 5
      )
    );

    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({graphics: [...appState.currentEvent.design.graphics]});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginGraphicRotate(event, graphic) {
  event.preventDefault();
  event.stopPropagation();
  const rect = $("#canvasStage").getBoundingClientRect();
  const cx = rect.left + rect.width * (graphic.x ?? 50) / 100;
  const cy = rect.top + rect.height * (graphic.y ?? 50) / 100;
  const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
  const startRotation = graphic.rotation ?? 0;
  function move(pointerEvent) {
    const angle = Math.atan2(pointerEvent.clientY - cy, pointerEvent.clientX - cx) * 180 / Math.PI;
    graphic.rotation = Math.max(-180, Math.min(180, Math.round(startRotation + angle - startAngle)));
    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({graphics: [...appState.currentEvent.design.graphics]});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginDrag(event) {
  event.preventDefault();
  const design = appState.currentEvent.design;
  const start = stagePoint(event);
  const x0 = design.text.x;
  const y0 = design.text.y;

  function move(pointerEvent) {
    const point = stagePoint(pointerEvent);
    const rect = $("#canvasStage").getBoundingClientRect();
    const bounds = getFrameEditBounds();

    let nextX =
      x0 + (point.x - start.x) / rect.width * 100;

    let nextY =
      y0 + (point.y - start.y) / rect.height * 100;

    const element = $(".text-object");

    if (element) {
      const box = element.getBoundingClientRect();

      const halfW =
        box.width / (2 * rect.width) * 100;

      const halfH =
        box.height / (2 * rect.height) * 100;

      nextX = clampToRange(
        nextX,
        bounds.left + halfW,
        bounds.right - halfW
      );

      nextY = clampToRange(
        nextY,
        bounds.top + halfH,
        bounds.bottom - halfH
      );
    } else {
      nextX = clampToRange(
        nextX,
        bounds.left,
        bounds.right
      );

      nextY = clampToRange(
        nextY,
        bounds.top,
        bounds.bottom
      );
    }

    design.text.x = nextX;
    design.text.y = nextY;

    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({text: {...design.text}});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const design = appState.currentEvent.design;
  const startX = event.clientX;
  const startScale = design.text.scale;
  function move(pointerEvent) {
    const rect = $("#canvasStage").getBoundingClientRect();
    const bounds = getFrameEditBounds();
    const element = $(".text-object");

    let maxScale = 2;

    if (element) {
      const baseWidth = Math.max(1, element.offsetWidth);
      const baseHeight = Math.max(1, element.offsetHeight);

      const availableHalfX = Math.min(
        Number(design.text.x ?? 50) - bounds.left,
        bounds.right - Number(design.text.x ?? 50)
      );

      const availableHalfY = Math.min(
        Number(design.text.y ?? 50) - bounds.top,
        bounds.bottom - Number(design.text.y ?? 50)
      );

      const maxScaleX =
        (availableHalfX * 2 * rect.width) /
        (baseWidth * 100);

      const maxScaleY =
        (availableHalfY * 2 * rect.height) /
        (baseHeight * 100);

      maxScale = Math.min(
        2,
        maxScaleX,
        maxScaleY
      );
    }

    const nextScale =
      startScale +
      (pointerEvent.clientX - startX) / 200;

    design.text.scale = Math.max(
      0.1,
      Math.min(maxScale, nextScale)
    );

    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({text: {...design.text}});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginRotate(event) {
  event.preventDefault();
  event.stopPropagation();
  const design = appState.currentEvent.design;
  const rect = $("#canvasStage").getBoundingClientRect();
  const cx = rect.left + rect.width * design.text.x / 100;
  const cy = rect.top + rect.height * (1 - design.text.y / 100);
  const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
  const startRotation = design.text.rotation;
  function move(pointerEvent) {
    const angle = Math.atan2(pointerEvent.clientY - cy, pointerEvent.clientX - cx) * 180 / Math.PI;
    design.text.rotation = Math.max(-180, Math.min(180, Math.round(startRotation + angle - startAngle)));
    renderStage();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    updateInspector();
    queueLivePatch({text: {...design.text}});
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function renderPhonePreview() {
  if (!appState.currentEvent) return;

  const previews = [
    $("#phoneBoxPreview"),
    $("#phoneMobilePreview")
  ].filter(Boolean);

  previews.forEach((preview) => {
    preview.innerHTML = "";
    preview.classList.toggle("portrait", appState.currentEvent.format === "portrait");
    preview.classList.toggle("landscape", appState.currentEvent.format !== "portrait");
    FotoboxRenderer.renderToElement(preview, appState.currentEvent);
  });
}

async function applyPhoneDesign(designPatch, statusText) {
  const event = appState.currentEvent;
  if (!event) return;

  // Änderung sofort lokal übernehmen.
  event.design = {
    ...(event.design || {}),
    ...designPatch
  };

  // Vorschauen sofort mit dem lokalen Eventzustand aktualisieren.
  renderAll();
  renderPhonePreview();
  renderPhone();

  if (statusText) {
    $("#liveStatus").textContent = statusText;
  }

  // Änderung für Studio und Fotobox über den gemeinsamen Live-Sync-Weg vormerken.
  queueLivePatch({design: designPatch});
}

function renderPhone() {
  const event = appState.currentEvent;
  if (!event) return;
  const design = event.design || {};
  const titles = ["Layout", "Hintergrund", "Text", "Schrift", "Stil", "Grafiken", "Drucker"];

  $("#phoneEvent").textContent = event.name || "Dein Event";
  $("#phoneStepLabel").textContent = `${appState.phoneStep} / 7 · ${titles[appState.phoneStep - 1]}`;
  $("#phoneTitle").textContent = `${titles[appState.phoneStep - 1]} wählen`;
  $("#phoneProgress").innerHTML = titles.map((_, index) => `<span class="${index + 1 <= appState.phoneStep ? "active" : ""}"></span>`).join("");

  const content = $("#phoneContent");

  if (appState.phoneStep === 1) {
    content.innerHTML = `<div class="phone-card-grid">${[1,2,3,4].map((count) => `<button class="phone-card ${layoutCount(design)===count ? "active" : ""}" data-phone-layout="${count}"><div class="sample" style="display:grid;place-items:center;background:#eee">Layout ${count}</div><div class="label">${count} Bild${count>1?"er":""}</div></button>`).join("")}</div>`;
    $$('[data-phone-layout]').forEach((button) => button.addEventListener("click", async () => {
      const count = Number(button.dataset.phoneLayout);
      const currentDesign = appState.currentEvent?.design || {};
      const nextLayout = makeLayout(appState.currentEvent?.format || "landscape", count);
      const nextSlots = normalizeSlotMap(currentDesign.slots, count);

      await applyPhoneDesign(
        {layout: nextLayout, slots: nextSlots},
        "Layout übernommen"
      );
    }));
  } else if (appState.phoneStep === 2) {
    const colors = [
      "#d9edc8","#eddba4","#eec6cd","#cbd9ec","#e4d0b9","#d9c7eb",
      "#000000","#23241f","#555555","#888888","#bbbbbb","#ffffff",
      "#7e354d","#a83250","#d9534f","#ef8a62","#f4b183","#f6c6cf",
      "#d9a7b0","#e8c4a2","#d0aa4e","#f2d675","#fff2a8","#8a9b45",
      "#4f7d43","#a8c686","#4c9b91","#8ecdc5","#6387bd","#293f70",
      "#8c6bb1","#f2e6d8"
    ];
    const currentBg = design.background?.value || "#d9edc8";
    content.innerHTML = `<div class="phone-card-grid">${colors.map((color) =>
      `<button class="phone-card ${currentBg===color ? "active" : ""}" data-phone-bg="${color}">
        <div class="sample" style="height:65px;background:${color}"></div>
        <div class="label">${color}</div>
      </button>`
    ).join("")}</div>
    <div class="custom-color-row">
      <input id="phoneBackgroundColor" type="color" value="${currentBg}">
      <span>Eigene Hintergrundfarbe</span>
      <code id="phoneBackgroundColorValue">${currentBg}</code>
    </div>`;
    $$('[data-phone-bg]').forEach((button) => button.addEventListener("click", () =>
      applyPhoneDesign({background:{type:"color",value:button.dataset.phoneBg}}, "Hintergrund übernommen")
    ));
    $("#phoneBackgroundColor").addEventListener("input", (event) => {
      const value = event.target.value;
      $("#phoneBackgroundColorValue").textContent = value;
      applyPhoneDesign({background:{type:"color",value}}, "Hintergrund übernommen");
    });
  } else if (appState.phoneStep === 3) {
    const text = design.text || {};
    const textColor = text.color || "#d0aa4e";
    const textAlign = text.align || "center";
    const rotation = Number(text.rotation || 0);

    content.innerHTML = `
      <textarea class="phone-textarea" id="phoneText" maxlength="80" placeholder="z. B. Lena & Jonas">${escapeHtml(text.content || "")}</textarea>

      <div class="phone-section-label">Textfarbe</div>
      <div class="phone-color-row">
        <input id="phoneTextColor" type="color" value="${textColor}">
        <output id="phoneTextColorOut">${textColor}</output>
      </div>

      <div class="phone-section-label">Ausrichtung</div>
      <div class="phone-font-grid">
        ${[
          ["left", "Links"],
          ["center", "Zentriert"],
          ["right", "Rechts"]
        ].map(([value, label]) =>
          `<button class="phone-check ${textAlign === value ? "active" : ""}" data-phone-align="${value}">${label}</button>`
        ).join("")}
      </div>

      <div class="phone-control">
        <label>Drehung <output id="phoneRotationOut">${rotation}&deg;</output></label>
        <input id="phoneTextRotation" type="range" min="-180" max="180" value="${rotation}">
      </div>`;

    const updateText = (patch) => {
      const nextText = {
        ...(appState.currentEvent.design?.text || {}),
        ...patch
      };

      appState.currentEvent.design = {
        ...(appState.currentEvent.design || {}),
        text: nextText
      };

      renderPhonePreview();
      queueLivePatch({design:{text:{...nextText}}});
    };

    $("#phoneText").addEventListener("input", () => {
      updateText({
        content: $("#phoneText").value
      });
    });

    $("#phoneTextColor").addEventListener("input", () => {
      const value = $("#phoneTextColor").value;
      $("#phoneTextColorOut").value = value;

      updateText({
        color: value
      });
    });

    $$('[data-phone-align]').forEach((button) => button.addEventListener("click", () => {
      $$('[data-phone-align]').forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      updateText({
        align: button.dataset.phoneAlign
      });
    }));

    $("#phoneTextRotation").addEventListener("input", () => {
      const value = Number($("#phoneTextRotation").value);
      $("#phoneRotationOut").value = `${value}&deg;`;

      updateText({
        rotation: value
      });
    });  } else if (appState.phoneStep === 4) {
    const font = design.text?.fontFamily || "Fraunces";
    const size = Number(design.text?.fontSize || 31);
    const x = Number(design.text?.x ?? 50);
    const y = Number(design.text?.y ?? 50);

    content.innerHTML = `
      <div class="phone-section-label">Schriftfamilie</div>
      <div class="phone-font-grid">${["Fraunces","Georgia","Arial"].map((name) => `<button class="phone-check ${font===name?"active":""}" data-phone-font="${name}">${name}</button>`).join("")}</div>

      <div class="phone-control">
        <label>Horizontal <output id="phoneXOut">${x}%</output></label>
        <input id="phoneTextX" type="range" min="5" max="95" value="${x}">
      </div>

      <div class="phone-control">
        <label>Vertikal <output id="phoneYOut">${y}%</output></label>
        <input id="phoneTextY" type="range" min="5" max="95" value="${y}">
      </div>

      <div class="phone-control">
        <label>Schriftgröße <output id="phoneSizeOut">${size}px</output></label>
        <input id="phoneFontSize" type="range" min="18" max="72" value="${size}">
      </div>`;

    $$('[data-phone-font]').forEach((button) => button.addEventListener("click", () => {
      applyPhoneDesign({
        text:{
          ...(design.text || {}),
          fontFamily:button.dataset.phoneFont,
        }
      }, `${button.dataset.phoneFont} übernommen`);
    }));

    $("#phoneTextX").addEventListener("input", () => {
      const value = Number($("#phoneTextX").value);
      $("#phoneXOut").value = `${value}%`;

      const nextText = {
        ...(appState.currentEvent.design?.text || {}),
        x: value,
      };

      appState.currentEvent.design = {
        ...(appState.currentEvent.design || {}),
        text: nextText
      };

      renderPhonePreview();
      queueLivePatch({design:{text:{...nextText}}});
    });

    $("#phoneTextY").addEventListener("input", () => {
      const value = Number($("#phoneTextY").value);
      $("#phoneYOut").value = `${value}%`;

      const nextText = {
        ...(appState.currentEvent.design?.text || {}),
        y: value,
      };

      appState.currentEvent.design = {
        ...(appState.currentEvent.design || {}),
        text: nextText
      };

      renderPhonePreview();
      queueLivePatch({design:{text:{...nextText}}});
    });

    $("#phoneFontSize").addEventListener("input", () => {
      const value = Number($("#phoneFontSize").value);
      $("#phoneSizeOut").value = `${value}px`;

      const nextText = {
        ...(appState.currentEvent.design?.text || {}),
        fontSize: value,
      };

      appState.currentEvent.design = {
        ...(appState.currentEvent.design || {}),
        text: nextText
      };

      renderPhonePreview();
      queueLivePatch({design:{text:{...nextText}}});
    });
  } else if (appState.phoneStep === 5) {
    const frames = [
      {id:"thin",label:"Feine Linie",value:"#ffffff"},
      {id:"gold",label:"Gold",value:"#d0aa4e"},
      {id:"dark",label:"Dunkel",value:"#23241f"},
      {id:"none",label:"Kein Rahmen",value:""}
    ];
    content.innerHTML = `<div class="phone-section-label">Rahmen</div><div class="phone-font-grid">${frames.map(f => `<button class="phone-check ${((design.frame?.type||"thin")===f.id)?"active":""}" data-phone-frame="${f.id}" data-phone-frame-value="${f.value}">${f.label}</button>`).join("")}</div>`;
    $$('[data-phone-frame]').forEach((button) => button.addEventListener("click", () => applyPhoneDesign({frame:{type:button.dataset.phoneFrame,value:button.dataset.phoneFrameValue}}, "Rahmen übernommen")));
    
  } else if (appState.phoneStep === 6) {
    const choices = [
      {id:"none",label:"Keine Grafik",icon:"—"},
      {id:"heart",label:"Herz",icon:"♥"},
      {id:"party",label:"Konfetti",icon:"✦"},
      {id:"cool",label:"Cool",icon:"★"}
    ];

    const current = (design.graphics || []).find(g => g?.builtin && g?.builtinId);

    content.innerHTML = `
      <div class="phone-card-grid">
        ${choices.map(x => `<button class="phone-card ${current?.builtinId===x.id?"active":""}" data-phone-graphic="${x.id}">
          <div class="phone-cheese-sample">${x.icon}</div>
          <div class="label">${x.label}</div>
        </button>`).join("")}
      </div>`;

    $$('[data-phone-graphic]').forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.phoneGraphic;

      // Immer genau eine Built-in-Grafik aktiv halten.
      // Andere, frei hinzugefügte Grafiken bleiben erhalten.
      let graphics = (design.graphics || []).filter(
        g => !(g?.builtin && g?.builtinId)
      );

      if (id !== "none") {
        const graphic = FotoboxEventSchema.createBuiltinGraphic(id);

        if (graphic) {
          graphics.push(graphic);
        }
      }

      await applyPhoneDesign(
        {graphics},
        id === "none"
          ? "Grafik deaktiviert"
          : `${button.textContent.trim()} übernommen`
      );
    }));  } else {
    const printer = design.printer || {};
    content.innerHTML = `<div class="phone-check">🖨 <strong>SELPHY CP1500</strong> · Bereit</div><div class="phone-control"><label>Automatisch drucken <input id="phonePrintEnabled" type="checkbox" ${printer.enabled!==false?"checked":""}></label></div><div class="phone-control"><label>Exemplare <output id="phoneCopiesOut">${printer.copies || 1}</output></label><input id="phoneCopies" type="range" min="1" max="3" value="${printer.copies || 1}"></div>`;
    $("#phonePrintEnabled").addEventListener("change", () => applyPhoneDesign({printer:{...printer,enabled:$("#phonePrintEnabled").checked}}, "Druckeinstellung übernommen"));
    $("#phoneCopies").addEventListener("input", () => {
      const value = Number($("#phoneCopies").value);
      $("#phoneCopiesOut").value = value;
      applyPhoneDesign({printer:{...printer,copies:value}}, "Exemplare übernommen");
    });
  }

  const navigation = document.createElement("div");
  navigation.className = "phone-nav";
  navigation.innerHTML = `<button class="secondary" id="phonePrev" ${appState.phoneStep===1?"disabled":""}>← Zurück</button><button class="primary" id="phoneNext">${appState.phoneStep===7?"Fertig":"Weiter →"}</button>`;
  content.appendChild(navigation);

  $("#phonePrev").addEventListener("click", async () => {
    if (appState.phoneStep > 1) {
      appState.phoneStep -= 1;
      await applyPhoneDesign({setupStep:appState.phoneStep}, null);
    }
  });
  $("#phoneNext").addEventListener("click", async () => {
    if (appState.phoneStep < 7) {
      appState.phoneStep += 1;
      await applyPhoneDesign({setupStep:appState.phoneStep}, null);
    } else {
      try {
        const updated = await apiLivePatch(event.id, {status:"ready",design:{setupStep:7}});
        appState.currentEvent = FotoboxEventSchema.normalize(updated);
        appState.lastLiveUpdatedAt = appState.currentEvent.updatedAt;
        renderAll();
        renderPhone();
        $("#liveStatus").textContent = "Setup am Smartphone abgeschlossen";
      } catch (error) {
        console.error(error);
        $("#liveStatus").textContent = "Setup konnte nicht abgeschlossen werden";
      }
    }
  });

  renderPhonePreview();
}

function startPhonePolling() {
  stopPhonePolling();
  if (!appState.currentEvent) return;

  appState.phonePoll = setInterval(async () => {
    try {
      const id = appState.currentEvent.id;

      const statusResponse = await fetch(
        `${FOTOBOX_BASE}/studio/api/live.php?id=${encodeURIComponent(id)}&status=1`,
        {
          cache: "no-store",
          headers: {Accept: "application/json"}
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Fotobox Live Status HTTP ${statusResponse.status}`);
      }

      const status = await statusResponse.json();

      if (status.updatedAt !== appState.lastLiveUpdatedAt) {
        const incoming = FotoboxEventSchema.normalize(
          await fotoboxLiveGet(id)
        );

        appState.lastLiveUpdatedAt = incoming.updatedAt;
        appState.currentEvent = incoming;

        
        renderAll();
        renderPhone();
        renderPhonePreview();

        $("#liveStatus").textContent =
          `Live synchronisiert · ${new Date(incoming.updatedAt).toLocaleTimeString("de-DE")}`;
      }
    } catch (error) {
      console.error("Studio-Live-Polling:", error);
      $("#liveStatus").textContent = "Verbindung zur Fotobox unterbrochen";
    }
  }, 1000);
}
function stopPhonePolling() {
  if (appState.phonePoll) {
    clearInterval(appState.phonePoll);
    appState.phonePoll = null;
  }
}

function openPhone() {
  if (!appState.currentEvent) return;
  $("#phoneOverlay").classList.remove("hidden");
  renderPhone();
  startPhonePolling();
}

function closePhone() {
  $("#phoneOverlay").classList.add("hidden");
  stopPhonePolling();
}


const mediaState = {
  type: "graphics",
  folder: "__ALL__",
  folders: {
    graphics: [],
    images: []
  },
  assets: [],
  query: ""
};

function mediaAssetType() {
  return mediaState.type === "graphics" ? "graphic" : "image";
}

async function loadMediaLibrary() {
  const grid = $("#mediaLibraryGrid");
  const info = $("#mediaLibraryInfo");

  if (!grid) return;

  grid.innerHTML = `<div class="empty-state">Medienbibliothek wird geladen …</div>`;

  try {
    const response = await fetch("api/media.php", {
      cache: "no-store",
      headers: {Accept: "application/json"}
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    mediaState.assets = Array.isArray(data.assets) ? data.assets : [];
    mediaState.folders = data.folders || {graphics: [], images: []};

    const folders = mediaState.folders[mediaState.type] || [];
    if (mediaState.folder !== "__ALL__" && !folders.includes(mediaState.folder)) {
      mediaState.folder = "__ALL__";
    }

    renderMediaLibrary();
  } catch (error) {
    console.error("Medienbibliothek:", error);
    grid.innerHTML = `
      <div class="empty-state">
        Medienbibliothek konnte nicht geladen werden.<br><br>
        ${escapeHtml(error.message)}
      </div>`;
    if (info) info.textContent = "";
  }
}

function renderMediaLibrary() {
  const grid = $("#mediaLibraryGrid");
  const info = $("#mediaLibraryInfo");
  const folderBar = $("#mediaFolderBar");

  if (!grid) return;

  const assetType = mediaAssetType();
  const folders = mediaState.folders[mediaState.type] || ["Sonstiges"];

  if (folderBar) {
    folderBar.innerHTML = `
      <button
        type="button"
        class="media-folder ${mediaState.folder === "__ALL__" ? "active" : ""}"
        data-media-folder="__ALL__">
        ▦ Alle
      </button>

      ${folders.map((folder) => `
        <button
          type="button"
          class="media-folder ${folder === mediaState.folder ? "active" : ""}"
          data-media-folder="${escapeHtml(folder)}">
          📁 ${escapeHtml(folder)}
        </button>
      `).join("")}

      <button
        type="button"
        class="media-folder media-folder-add"
        data-media-add-folder="1">
        ＋ Neuer Ordner
      </button>
    `;

    $$("[data-media-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        mediaState.folder = button.dataset.mediaFolder || "__ALL__";
        renderMediaLibrary();
      });
    });

    const addFolderButton = $("[data-media-add-folder]");

    if (addFolderButton) {
      addFolderButton.addEventListener("click", async () => {
        const type = mediaState.type;
        const label = type === "graphics" ? "Grafiken" : "Bilder";

        const folderName = window.prompt(
          `Neuen Ordner für ${label} anlegen:`
        );

        if (folderName === null) return;

        const folder = folderName.trim();

        if (!folder) {
          window.alert("Bitte einen Ordnernamen eingeben.");
          return;
        }

        addFolderButton.disabled = true;

        try {
          const response = await fetch("api/media-folder.php", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              type,
              folder
            })
          });

          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }

          mediaState.folders[type] = Array.isArray(data.folders)
            ? data.folders
            : mediaState.folders[type];

          mediaState.folder = data.folder || folder;

          renderMediaLibrary();
        } catch (error) {
          console.error("Ordner konnte nicht angelegt werden:", error);
          window.alert(
            `Der Ordner konnte nicht angelegt werden.\n\n${error.message}`
          );
          addFolderButton.disabled = false;
        }
      });
    }
  }

  const query = mediaState.query.trim().toLowerCase();

  const assets = mediaState.assets.filter((asset) => {
    if (asset.type !== assetType) return false;

    if (
      mediaState.folder !== "__ALL__" &&
      (asset.folder || "Sonstiges") !== mediaState.folder
    ) {
      return false;
    }

    if (!query) return true;

    return String(asset.name || "").toLowerCase().includes(query);
  });

  const totalInFolder = mediaState.assets.filter(
    (asset) =>
      asset.type === assetType &&
      (
        mediaState.folder === "__ALL__" ||
        (asset.folder || "Sonstiges") === mediaState.folder
      )
  ).length;

  if (info) {
    const folderLabel =
      mediaState.folder === "__ALL__"
        ? "Alle"
        : mediaState.folder;

    info.textContent =
      `${assets.length} von ${totalInFolder} Medien · ${folderLabel}`;
  }

  if (!assets.length) {
    grid.innerHTML = `
      <div class="empty-state">
        ${query
          ? "Keine passenden Medien gefunden."
          : mediaState.folder === "__ALL__"
            ? "Noch keine Medien vorhanden."
            : `Der Ordner „${escapeHtml(mediaState.folder)}“ ist leer.`}
      </div>`;
    return;
  }

  grid.innerHTML = assets.map((asset) => `
    <article class="media-card" data-media-id="${escapeHtml(asset.id)}">
      <div class="media-card-preview">
        <img src="${escapeHtml(asset.url)}"
             alt=""
             loading="lazy">
        <button
          type="button"
          class="media-delete"
          data-media-delete="${escapeHtml(asset.id)}"
          title="Medium löschen"
          aria-label="Medium löschen">×</button>
      </div>

      <div class="media-card-body">
        <strong title="${escapeHtml(asset.name || "")}">
          ${escapeHtml(asset.name || "Medium")}
        </strong>
        <span>
          ${Math.max(1, Math.round((Number(asset.bytes) || 0) / 1024))} KB
        </span>

        <select
          class="media-folder-select"
          data-media-move="${escapeHtml(asset.id)}"
          aria-label="Ordner für ${escapeHtml(asset.name || "Medium")}">
          ${(mediaState.folders[mediaState.type] || ["Sonstiges"]).map((folder) => `
            <option value="${escapeHtml(folder)}" ${folder === (asset.folder || "Sonstiges") ? "selected" : ""}>
              ${escapeHtml(folder)}
            </option>
          `).join("")}
        </select>
      </div>
    </article>
  `).join("");

  $$("[data-media-move]").forEach((select) => {
    select.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    select.addEventListener("change", async (event) => {
      event.stopPropagation();

      const id = select.dataset.mediaMove;
      const folder = select.value;

      if (!id || !folder) return;

      select.disabled = true;

      try {
        const response = await fetch("api/media-move.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({id, folder})
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        await loadMediaLibrary();
      } catch (error) {
        console.error("Medium konnte nicht verschoben werden:", error);
        alert(`Medium konnte nicht verschoben werden.\n\n${error.message}`);
        await loadMediaLibrary();
      }
    });
  });

  $$("[data-media-delete]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      const id = button.dataset.mediaDelete;
      const asset = mediaState.assets.find((item) => item.id === id);

      if (!asset) return;

      if (!confirm(
        `„${asset.name || "Dieses Medium"}“ wirklich aus der zentralen Medienbibliothek löschen?`
      )) {
        return;
      }

      await deleteMediaAsset(id);
    });
  });
}

async function moveMediaAsset(id, folder) {
  const response = await fetch("api/media-move.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({id, folder})
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function deleteMediaAsset(id) {
  try {
    const response = await fetch("api/media-delete.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({id})
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      let message = data.error || `HTTP ${response.status}`;

      if (Array.isArray(data.usedBy) && data.usedBy.length) {
        const events = data.usedBy
          .map((event) => event.name || event.id)
          .join(", ");

        message += `\n\nVerwendet von: ${events}`;
      }

      throw new Error(message);
    }

    await loadMediaLibrary();
  } catch (error) {
    console.error("Medien löschen:", error);
    alert(`Medium konnte nicht gelöscht werden.\n\n${error.message}`);
  }
}

async function uploadMediaFiles(files) {
  const validFiles = [...files].filter((file) => file.type.startsWith("image/"));

  if (!validFiles.length) return;

  const button = $("#mediaUploadBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Hochladen …";
  }

  try {
    for (const file of validFiles) {
      const formData = new FormData();

      formData.append("type", mediaState.type);
      formData.append("folder", mediaState.folder);
      formData.append("file", file);

      const response = await fetch("api/media-upload.php", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
    }

    await loadMediaLibrary();
  } catch (error) {
    console.error("Medienupload:", error);
    alert(`Medium konnte nicht hochgeladen werden.\n\n${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "＋ Medien hochladen";
    }

    const input = $("#mediaUploadInput");
    if (input) input.value = "";
  }
}

function initMediaLibrary() {
  const tabs = $$(".media-tab");
  const uploadButton = $("#mediaUploadBtn");
  const uploadInput = $("#mediaUploadInput");
  const search = $("#mediaSearch");

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      mediaState.type =
        button.dataset.mediaType === "images" ? "images" : "graphics";

      const folders = mediaState.folders[mediaState.type] || [];
      if (
        mediaState.folder !== "__ALL__" &&
        !folders.includes(mediaState.folder)
      ) {
        mediaState.folder = "__ALL__";
      }

      tabs.forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      renderMediaLibrary();
    });
  });

  uploadButton?.addEventListener("click", () => {
    uploadInput?.click();
  });

  uploadInput?.addEventListener("change", (event) => {
    uploadMediaFiles(event.target.files || []);
  });

  search?.addEventListener("input", (event) => {
    mediaState.query = event.target.value || "";
    renderMediaLibrary();
  });

  loadMediaLibrary();
}

async function showHome() {
  stopPhonePolling();
  setView("home");
  setDbState("API wird geladen …");
  let events;
  try {
    events = await apiListEvents();
    setDbState("API verbunden");
  } catch (error) {
    console.error(error);
    setDbState("API nicht erreichbar");
    $("#eventList").innerHTML = `<div class="empty-state">Die lokale PHP-API ist nicht erreichbar.<br><br>Bitte <strong>start_studio.bat</strong> starten.</div>`;
    return;
  }

  const list = $("#eventList");
  if (!events.length) {
    list.innerHTML = `<div class="empty-state">Noch keine Events gespeichert.<br><br><button class="primary" id="emptyCreate">Erstes Event anlegen</button></div>`;
    $("#emptyCreate").addEventListener("click", createEvent);
    return;
  }

  list.innerHTML = events.map((event) => `<article class="event-card">
    <div class="event-card-top"><h3>${escapeHtml(event.name || "Unbenanntes Event")}</h3><span class="status">${escapeHtml(event.status || "draft")}</span></div>
    <div class="event-card-meta">${dateDE(event.date) || "ohne Datum"} · ${event.format === "landscape" ? "15 × 10 cm quer" : "10 × 15 cm hoch"}</div>
    <div class="event-card-meta">PIN <strong>${escapeHtml(event.pin)}</strong> · ID <code>${escapeHtml(event.id)}</code></div>
    <div class="event-card-actions">
      <button class="secondary" data-open="${escapeHtml(event.id)}">Bearbeiten</button>
      <button class="secondary" data-export="${escapeHtml(event.id)}">JSON</button>
      <button class="secondary" data-delete="${escapeHtml(event.id)}">Löschen</button>
    </div>
  </article>`).join("");

  $$('[data-open]').forEach((button) => button.addEventListener("click", () => openEvent(button.dataset.open)));
  $$('[data-export]').forEach((button) => button.addEventListener("click", async () => {
    const event = await apiGetEvent(button.dataset.export);
    const payload = FotoboxEventSchema.exportPayload(event);
    downloadJson(payload, `${safeFile(event.name)}.photobooth.json`);
  }));
  $$('[data-delete]').forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Dieses Event wirklich löschen?")) return;
    await apiDeleteEvent(button.dataset.delete);
    await showHome();
  }));

  await refreshGuestUsb();
}

async function createEvent() {
  appState.currentEvent = FotoboxEventSchema.createEvent();
  appState.currentEvent.name = "Hochzeit Lena & Jonas";
  appState.currentEvent.date = "2026-09-12";
  appState.currentEvent.design.text.content = eventText(appState.currentEvent);
  appState.currentEvent = await apiSaveEvent(appState.currentEvent);
  setView("editor");
  setStep(1);
  renderAll();
}

async function openEvent(id) {
  stopPhonePolling();
  const event = await apiGetEvent(id);
  appState.currentEvent = FotoboxEventSchema.normalize(event);
  appState.lastLiveUpdatedAt = appState.currentEvent.updatedAt;
  setView("editor");
  setStep(1);
  renderAll();
  startPhonePolling();
}
async function updateCurrent() {
  const event = appState.currentEvent;
  event.name = $("#eventName").value;
  event.date = $("#eventDate").value;
  event.contact.name = $("#contactName").value;
  event.contact.email = $("#contactEmail").value;
  const oldName = event.name || "Dein Event";
  const currentText = event.design?.text?.content || "";
  const oldAutomaticText = `${oldName} · `;

  // Automatisch erzeugten Eventtext aktualisieren.
  // Einen bewusst vom Benutzer eingegebenen Text niemals überschreiben.
  const wasAutomaticText =
    !currentText ||
    currentText === eventText({...event, name: oldName}) ||
    currentText.startsWith(oldAutomaticText);

  if (wasAutomaticText) {
    event.design.text.content = eventText(event);
  }
  event.updatedAt = new Date().toISOString();
  try {
    appState.currentEvent = await apiSaveEvent(event);
    renderAll();
  } catch (error) {
    setDbState("API-Fehler");
    console.error(error);
  }
}

async function exportCurrent() {
  const payload = FotoboxEventSchema.exportPayload(appState.currentEvent);
  const check = FotoboxEventSchema.validate(payload.event);
  if (!check.valid) {
    alert("Event kann nicht exportiert werden:\n\n" + check.errors.join("\n"));
    return;
  }
  downloadJson(payload, `${safeFile(appState.currentEvent.name)}.photobooth.json`);
}

async function importJson(file) {
  const raw = JSON.parse(await file.text());
  const candidate = raw?.fileType === "photobooth-event" ? raw.event : raw;
  const event = FotoboxEventSchema.normalize(candidate);
  const check = FotoboxEventSchema.validate(event);
  if (!check.valid) throw new Error(check.errors.join("\n"));
  appState.currentEvent = await apiSaveEvent(event);
  await showHome();
}

// UI bindings
initMediaLibrary();
$("#createFirst").addEventListener("click", createEvent);
$("#newEventTop").addEventListener("click", createEvent);
$("#refreshGuestUsb").addEventListener("click", refreshGuestUsb);
$("#toDesign").addEventListener("click", () => setStep(2));
$("#toSubmit").addEventListener("click", async () => {
  try {
    const check = FotoboxEventSchema.validate(appState.currentEvent);
    if (!check.valid) {
      alert("Event ist noch nicht vollständig:\n\n" + check.errors.join("\n"));
      return;
    }
    appState.currentEvent = await apiSaveEvent(appState.currentEvent);
    $("#sendResult").classList.add("hidden");
    setStep(3);
  } catch (error) {
    alert("Vorschau konnte nicht geladen werden: " + error.message);
  }
});
$("#approveEvent").addEventListener("click", async () => {
  const button = $("#approveEvent");
  try {
    const check = FotoboxEventSchema.validate(appState.currentEvent);
    if (!check.valid) {
      alert("Event ist noch nicht vollständig:\n\n" + check.errors.join("\n"));
      return;
    }

    button.disabled = true;
    button.textContent = "Fotobox wird vorbereitet …";
    setFotoboxState("Event wird an die Fotobox übertragen …");

    // Vor dem Speichern und Übertragen zuerst das Event vollständig normalisieren.
    // Dadurch werden alte Cheese-Elemente garantiert in normale Grafiken migriert.
    const normalizedEvent = FotoboxEventSchema.normalize(appState.currentEvent);
    FotoboxEventSchema.migrateLegacyCheese(normalizedEvent);
    appState.currentEvent = normalizedEvent;
    console.info("Studio 0.9.19: Legacy-Cheese-Migration", appState.currentEvent.design.cheese, appState.currentEvent.design.graphics);

    // Exakt den migrierten Stand lokal sichern und anschließend an die Fotobox übertragen.
    appState.currentEvent = await apiSaveEvent(appState.currentEvent);
    const published = await publishEventToFotobox(appState.currentEvent);

    published.fotoboxPublishedAt = new Date().toISOString();
    appState.currentEvent = await apiSaveEvent(published);

    $("#sendResult").textContent = `✓ Event „${appState.currentEvent.name}“ wurde an die Fotobox übertragen und freigegeben. PIN ${appState.currentEvent.pin}.`;
    $("#sendResult").classList.remove("hidden");
    button.textContent = "✓ An Fotobox übertragen";
    setFotoboxState("Fotobox verbunden", "ok");
    renderFinalPreview();
    renderSubmitSummary();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = "✓ Event an Fotobox übertragen";
    setFotoboxState("Fotobox nicht erreichbar", "error");
    alert("Event konnte nicht an die Fotobox übertragen werden.\n\n" + error.message);
  }
});
$("#backToEditor").addEventListener("click", () => setStep(2));
$("#goHome").addEventListener("click", showHome);
$("#exportJson").addEventListener("click", exportCurrent);
$("#copyPin").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(appState.currentEvent.pin); } catch {}
  $("#copyPin").textContent = "Kopiert ✓";
  setTimeout(() => $("#copyPin").textContent = "PIN kopieren", 1200);
});
$("#phoneBtn").addEventListener("click", openPhone);
$("#boxBtn").addEventListener("click", () => { window.open("box.html", "_blank", "noopener"); });
$("#openPhoneFromSubmit").addEventListener("click", openPhone);

$("#deactivateEvent").addEventListener("click", async () => {
  const event = appState.currentEvent;
  if (!event) return;

  const confirmed = confirm(
    `Event „${event.name || event.id}“ wirklich beenden?\n\n` +
    `Die Fotobox wird für dieses Event deaktiviert. ` +
    `Das Event selbst bleibt gespeichert.`
  );

  if (!confirmed) return;

  const button = $("#deactivateEvent");

  try {
    button.disabled = true;
    button.textContent = "Event wird beendet …";
    setFotoboxState("Event wird beendet …");

    await deactivateEventOnFotobox();

    $("#sendResult").textContent =
      `✓ Event „${event.name || event.id}“ wurde beendet. Die Fotobox wartet jetzt auf ein neues Event.`;
    $("#sendResult").classList.remove("hidden");

    button.textContent = "✓ Event beendet";
    setFotoboxState("Kein Event aktiv", "ok");
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = "■ Event beenden";
    setFotoboxState("Event konnte nicht beendet werden", "error");
    alert(
      "Das Event konnte nicht beendet werden.\n\n" +
      error.message
    );
  }
});

$("#closePhone").addEventListener("click", closePhone);
$("#helpBtn").addEventListener("click", () => $("#helpDialog").showModal());
$("#closeHelp").addEventListener("click", () => $("#helpDialog").close());
$("#zoomIn").addEventListener("click", () => { appState.zoom = Math.min(1, appState.zoom + 0.08); renderStage(); });
$("#zoomOut").addEventListener("click", () => { appState.zoom = Math.max(0.45, appState.zoom - 0.08); renderStage(); });
$$('.tool-tab').forEach((button) => button.addEventListener("click", () => renderToolPanel(button.dataset.tool)));
$("#eventName").addEventListener("change", updateCurrent);
$("#eventDate").addEventListener("change", updateCurrent);
$("#contactName").addEventListener("change", updateCurrent);
$("#contactEmail").addEventListener("change", updateCurrent);
$$('.format-card').forEach((button) => button.addEventListener("click", () => {
  appState.currentEvent.format = button.dataset.format;
  renderAll();
  queueLivePatch({format: appState.currentEvent.format});
}));
$$('#editorView .step').forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.step))));
$("#importJsonBtn").addEventListener("click", () => $("#importInput").click());
$("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importJson(file); alert("Event importiert."); }
  catch (error) { alert("Import fehlgeschlagen: " + error.message); }
  finally { event.target.value = ""; }
});

startGuestUsbPolling();

showHome().catch((error) => {
  console.error(error);
  setDbState("API nicht erreichbar");
});
