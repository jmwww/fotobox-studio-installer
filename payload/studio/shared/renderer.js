// Shared visual renderer.
// Studio and later Raspberry/Smartphone clients should use the same data contract.

window.FotoboxRenderer = (() => {
  function applyBackground(element, background) {
    if (!element) return;
    const bg = background || { type: "color", value: "#d9edc8" };
    if (bg.type === "color") {
      element.style.background = bg.value || "#d9edc8";
    } else if (bg.type === "image" && bg.src) {
      element.style.background = `center / contain no-repeat url("${bg.src}")`;
    }
  }

  function renderToElement(element, event, options = {}) {
    if (!element || !event) return;
    element.innerHTML = "";
    const d = event.design || {};
    const showPlaceholders = options.showPlaceholders === true;
    applyBackground(element, d.background);

    const slots = d.layout?.slots || [];
    slots.forEach(slot => {
      const box = document.createElement("div");
      box.className = "shared-render-slot";
      box.dataset.slotId = slot.id;
      box.style.left = `${slot.x}%`;
      box.style.top = `${slot.y}%`;
      box.style.width = `${slot.width}%`;
      box.style.height = `${slot.height}%`;
      box.style.transform = `rotate(${Number(slot.rotation ?? 0)}deg)`;

      const imageId = d.slots?.[slot.id];
      const image = (d.images || []).find(item => item.id === imageId);
      if (image?.src) {
        const img = document.createElement("img");
        img.src = image.src;
        img.alt = image.name || "";
        const crop = d.imageCrops?.[slot.id] || { scale: 1, x: 0, y: 0 };
        img.style.transform =
          `translate(calc(-50% + ${crop.x || 0}%), calc(-50% + ${crop.y || 0}%)) scale(${crop.scale || 1})`;
        box.appendChild(img);
      } else if (showPlaceholders) {
        const placeholder = document.createElement("div");
        placeholder.className = "shared-render-placeholder";
        placeholder.textContent = "FOTO";
        box.appendChild(placeholder);
      }

      element.appendChild(box);
    });

    // Allgemeine Grafik-Elemente. Die Bilddaten liegen direkt im Event
    // als data:image/... URL und kÃ¶nnen spÃ¤ter vom Raspberry Pi als
    // echte Asset-Dateien extrahiert werden.
    (d.graphics || []).forEach((graphic) => {
      if (!graphic?.src) return;
      const graphicEl = document.createElement("div");
      graphicEl.className = "shared-render-graphic";
      graphicEl.dataset.graphicId = graphic.id || "";
      graphicEl.style.position = "absolute";
      graphicEl.style.left = `${graphic.x ?? 50}%`;
      graphicEl.style.top = `${graphic.y ?? 50}%`;
      graphicEl.style.width = `${graphic.width ?? 15}%`;
      graphicEl.style.opacity = `${graphic.opacity ?? 1}`;
      graphicEl.style.transform = `translate(-50%, -50%) rotate(${graphic.rotation || 0}deg)`;
      const graphicImg = document.createElement("img");
      graphicImg.src = graphic.src;
      graphicImg.alt = graphic.name || "";
      graphicImg.draggable = false;
      graphicImg.style.display = "block";
      graphicImg.style.width = "100%";
      graphicImg.style.height = "auto";
      graphicImg.style.pointerEvents = "none";
      graphicEl.appendChild(graphicImg);
      element.appendChild(graphicEl);
    });

    const text = d.text || {};
    const textEl = document.createElement("div");
    textEl.className = "shared-render-text";
    textEl.textContent = text.content || `${event.name || "Dein Event"} Â· ${formatDate(event.date)}`;
    textEl.style.position = "absolute";
    textEl.style.left = `${text.x ?? 50}%`;
    textEl.style.width = "80%";
    textEl.style.bottom = `${100 - (text.y ?? 89)}%`;
    textEl.style.transform =
      `translateX(-50%) rotate(${text.rotation || 0}deg) scale(${text.scale || 1})`;
    textEl.style.color = text.color || "#d0aa4e";
    textEl.style.fontFamily = text.fontFamily || "Fraunces";
    const baseWidth = event.format === "portrait" ? 480 : 720;
    const renderWidth = element.clientWidth || baseWidth;
    const renderScale = renderWidth / baseWidth;
    textEl.style.fontSize = `${(text.fontSize || 31) * renderScale}px`;
    textEl.style.textAlign = text.align || "center";
    element.appendChild(textEl);

    const frame = d.frame;
    if (frame?.type && frame.type !== "none") {
      const value = frame.value || "#ffffff";
      element.style.border = frame.type === "double" ? `4px double ${value}` : `2px solid ${value}`;
    } else {
      element.style.border = "0";
    }

  }

  function formatDate(value) {
    if (!value) return "";
    const [y, m, d] = String(value).split("-");
    if (!y || !m || !d) return String(value);
    return `${d}.${m}.${y}`;
  }

  return { renderToElement, applyBackground, formatDate };
})();

