// Shared event model for Studio, Smartphone and Raspberry Pi.
// This file intentionally contains no browser- or hardware-specific logic.

window.FotoboxEventSchema = (() => {
  const VERSION = "1.0";
  const BUILTIN_GRAPHICS = {
    heart: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAE+UlEQVR42u3dwXUTWRCGUfsdBwCZiHhEIkRAIhAPzkRkIK/Y2cJHR939ur97tzPMjKqr/qoWDDw9AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAS3lWgv+7nM7Xe3/s19ffaqz+AqDQbJpS/QWAptOM6i8ANJ1mVH8BoOk0o/oLAI1XbkT1FwAaL9iI6j+/Yfh9Hv+9vc9z2AvgqA9qL9tI/V0Ami/6OdXfBeCBBLeR+rsANF/086v/vj//UHxNqP7dOgxF14Tq362Hn1v2Xqr+4e8FhuG3jdS/W6ehqJpQ/bv9Ojwq6NpFANg+29ZN/Y9bt6GImlD9u/07FE8Tqn+3j4eiaUL17/azLwEhbMoAsH22rav6d/r6WZE+58ufXz8++mt/v33/uadGvPUr1Qz/tvVf24vHcd/Qf/T37S0MaJvqAphl+3x28G+ZPQje20K2f+8KGIb/8cP/yH/OWvU2/M1+97MACw7t7CEAUwTADGm41LDOHAL/6m77d/veBbDCkLoEmFX+N5Rcczj9DAHv2fILQRcA+A7A6X/Efx9MHQC+fIJt58ArALgAnP9eAxAAzn9IzYNXAHABAALA+Q+p1wAXALgAAAEQstWvy/f/AyAAgGYA+AIQ5pmP9AWw9jnu/McrACAAaleA7Y8AiIaA4UcAREPA8CMAoiFg+BEA0RAw/OyBPxvwxvDe85t3GHwEwAGvgSP96cAgAGx28B0ACABAAAACABAAy9jyD0KE2a09Hy4AcAEAAgAQAIAAWIwvAmGOuXABgAsAEABeAyA1Dy4AcAEAAsBrAKTmwAUALgBAAHgNgFT/uwDABeAKgGLfuwDABSANodjvQ1Gg2+deAcArgHSEYn8PRYJuX3sFAK8A0hKK/TwUDbp9PBQPuv07FBG6fetLQAjbTQC4ArD94xeAEECfPtZuB+pyOl+1GgY/+h2AawD9GA4AIYA+jAeAEED/Rb8D8L0ABt8F4BpAn7kAXAMY/PwF4BpAPwkAQAC4AtBH+QtACKB/vAIA1QBwBaBv4heAEEC/eAUAqgHgCkCfxC8AIYD+8AoAVAPAFYC+iF8AQgD94BUAvAJIffSBAPDw8fwFACAAbAE8dwGgGfC8BQAgAGwFPGcBoDnwfAUAIABsCTxXAaBZ8DwFACAAbA08RwGgefD8BAAgAGwRPDcBoJnwvAQAIABsFTwnAaC58HwEACAAbBk8FwGg2fA8BAAgAGwdPAcBoPlQfwEACABbSN0RAJpRvREAgACwldQZAaA51RcBAAgAW0pdEQCaVT0RAIAAsLXUUQCgedVPAAACAFtM3QQAmlm9BAAgALDV1EkAoLnVRwAAAgBbTl0EAJpdPQQAIACw9dRBAKD5fX4BAAgAbEGfWwBgGAy/AAAEAM2taPsLAKLDYfgFACAAqG1J218AEB0Wwy8AAAFAbWva/gKA6PAYfgEACABqW9T2FwBEh8nwCwBAAFDbqra/ACA6XIZfAAACgNqWtf0FANFhM/wCABAA1Lau7S8AiA6f4RcAgACgtoVtfwFANAQMvwAABAC1K8D2FwBEQ8DwCwBAAFC7Amx/AUA0BAy/AAAEALUrwPYXAERDwPALAEAAULsCbH8BQDQEDL8AAAQAtSvA9hcAREPA8AsAQABQuwJsfwFANAQMvwAAoORyOl9VAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABgMW8sN4KWqcqrOAAAAABJRU5ErkJggg==",
    party: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADcElEQVR42u3dzU3jUBSAURu5AZfBzi2YBVIayAK6oBC6SBZpAIkFbsGduISwQoJEAeTEP+/dc1Yz0ozG9vh9uc+EUBQAAAAAAAAAAAAAAAAAAAAAAAAAwBJKlyBdzetwHPt3+5fa/z3FnUsAAgAIACAAhDG8NUdXQQAAASDiq78pQAAAAQAEABAA8t//X/o9AgAIACAAZKO7b/+1LUAAAAEABAAQAPLb/3sOEFOV+gkMzfPoG7budz4VBxMAIAAEH/9tAwQAEABAAAg3/tsGCAAgAIAAAAJAnP2/5wACAAgAkLPKJTD+/7UNqDd9kt8zcc0WJtVzNgEAAgAIACAA9v9L7aVZNw8BJzLPomkzO5/fRXkwZwLIgJvV9TQBuGlLI7SFbwJwE7uJXTcBcDPjetkC2BLYElj4JgA3Oa6LALjZcT0EwE3vOuAZgOcCFj4mAK+CzhcBEAHniS2ALYGFjwnANOB8EAARcB7YAtgSWPiYAEwDjhcBEAHHiQCIgOPDMwDPBSx8TACmAYsfAQAEID9r2QL4gBMBAAQAEADCjd22AQIACACQiuTfCFT3O1+DBhOA/b/jQgAAAQAEwPjv+BAAQAA44zv5BICA43+96cuvxf/917YBAkDQV33TgAAQfOQXgVh8JJiFf/HPGuVNAGSw/x/7qn7NNCAeaTDuZR6AW4z0S/7bmACY+ZXfQjYBkPCr/5QLdk3HggmAmRecBS0ABF38ImALwArH/yUX5NqPDxOAV33TAAJg8YsAp7wT0MK/6TF5A5AJgAn31yn+eHBREAACjdq2BAJA8EUlAnDl+J/L6JzTucBi+3/nAwAAAAAAAAAAAAAAAAAQjQ9tONEenkZ/22q33bueJMUnAoEAAAIACAAgAIAAAAIACAAgAIAAACnz48FZ3OHxY/Tbr7fvD95+bQIABAAQAEAAAAEABAAQAEAAAAEAAQAEABAAQAAAAQAEABAAQAAAAQAEABAAQAAAAQAEABAAQAAAAQAEABAAQAAAAQAEABAAQACAaVQuwU/ddl+6CpgAAAEABAAQAEAAAAEABAAQAEAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBFPgHNZwUddpJrxgAAAABJRU5ErkJggg==",
    cool: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAF3UlEQVR42u3dQXYTOxAF0G4drwVGMIX9j5wpGZHNwBAC5MQJ7Zaq3r3jf37cUtVTyTHOtgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG+zW4K+Pnz68uOo/9fT44NaEQB0bXABIQDQ8AJBAKDhBYIAQMMLBAGAphcGAgBNLwwEABpfEAgANL4gEABoemEgAND4gkAAaHyrIAiqGZZA81t3EwAK0DQgAND4gsAVAM1vf0wAKCzTgAlA82t++2YCUECYBkwAmh/7KQAUC/bVFUCB4EpgAtD82G8BoBiw7wJAEWD/BYDNRx0sbrfh8Evam4ND80NufQybC7l1Mmwq5NbLsJmQWzfDJkJu/fggEARrHQBOf9RRaABoftRTaABoftRVaABoftRXaABoftSZKwCQFgBOf9RbaABoftRdaABoftTf+11s4f/7/u366n/z8fNXC2Vdl1P6yw9mpe8thalws9a16heJ7Jr/3AIVBH3XtWIICIBJBSoI+q2rAGjW/GcUaGIQdF7XaiEwNP86RTrz53Z/vrN+brXfCvgtwAvF4m7eb8Kxr8UngDPStfsJLNyvLeo09gqg+bHPgQFw71RVFEIgcQoYml/zC4HcEBiK4Op1WldXgMTTX1NZ13u/3tWnAG8CggnA6e+0sq6JU4AJAEwAWaq/8bPq67euAiBibIIu9Rw3AXRJ+dWew7qaAJz+UKyuvQkIwZYLAL/6q/c81rXuFGACABMAIAAaj/+gzoMngK6/3pn9XNbVBAAIAOM/VKt3EwCYAAABAAgA93/IqHsTAJgAAAEACAD3f8io/5gJoOtfhZ39XNa1Nn8e/AX+XJg1dAUABID7P/Tsg6gJoNu9bpXnsa4mAEAAAALAeBf3HNZVAAACQMqnvn7rKgAAAfC62Z8BqJr2q79u61qrH0wAYALIVO20qvJ6rasAsPmayusUAIrVvdrrEwCKNbZIrasAUKzhRWpdBYBiDS9S6yoAFGt4kVpXAaBYw4vUuq5ln/WDK30b0BnfbZdYoNb1uafHh10AhBWsk8m6CoDAgtX41lUABBWuhreuAqBpAEDVAPBbAAgmAEAAAAIAEABnmPGGB6xqVj+YAMAEAAgAIMrFEtzm1o+p+sSfvTABAAIAEACAAPibzwLA3D4wARzsjG+5sb4IgJN5R9l+CQBAAHgfAHrUvwnAPdW6mgBwr7RPAgCnlfUUAN4HgIy6NwHccbx0ap1/+hv/BQAgAEwBTn/KBEDn9wGEgHVbtd5NACdMAdgPE4DTzCJYLwHQ6Rrw1lNHUd9nnaqd/ivVuQlACGh+EwDGW+uSaMmRu+KfDn9v8TrBstZutWuuCWDSVcCpJzgFQJGUFAKav2tdL9toFa8BRzR0wsmWuj4CQAhEB0Hymqw61QqAhQu+SxBYBwEQGQBH3u8rNkDyswsAIXB4I1RphrTnrdr8AqBoU6zYHN2fTwAIgSWbZFbDdHqW1OYXAE2D4MhmqvRaBUDTABACGTS/AIgKAUHQs/GrNP+2bdvFubNG8ScGgc/zmwBMAYETQffGr/RvWUwAJgKNbwIwBZgINH7a6V82ANJCoGIYJJ72Ff8ZuytA0ZN0xTAw4rsCmAKCpgMNX/v0Lx8AQuCcYNDoPZvfFSDs2gB/Kv+loJ3/piDqTwAIAdSdABACqDcBAAgAUwDqTAAIAdSXABACqCsBIARQTwJACKCOBAAgAEwBqJ/wCUAIoG7CrwBCAPUS/h6AEECdBAeAEEB9PBfdDL5MhPSDYdh0NH9uHQybLwTsfy4fBFIE9l0AoBjsdyKL8A/eHNT4JgBFgn0VAIoF++kK4EqAxjcBKCLsmwnANIDGNwEoLuyPCcA0gMYXAIIAje8KoAix7iYA0wAaXwAIAjS+ABAGVkHTCwBBIAg0vgAQBIJA4wsAhIGmFwAkhoGmFwAEBYKGFwAEBYKGFwAEBYKGFwA0DggNDgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwm58yKFMR64m1+gAAAABJRU5ErkJggg==",
  };

  function builtinGraphic(assetId) {
    const src = BUILTIN_GRAPHICS[assetId];
    if (!src) return null;
    const labels = { heart: "Herz", party: "Konfetti", cool: "Cool" };
    return {
      id: "graphic-" + assetId + "-" + Math.random().toString(36).slice(2, 8),
      name: labels[assetId] || "Grafik",
      src,
      x: 6,
      y: 6,
      width: 3.9,
      rotation: 0,
      opacity: 1,
      builtin: true,
      builtinId: assetId,
      legacyCheese: true
    };
  }


  function createId() {
    return "evt-" + new Date().toISOString().replace(/\D/g, "").slice(0, 14)
      + "-" + Math.random().toString(36).slice(2, 7);
  }

  function createPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function createEvent() {
    const event = {
      schemaVersion: VERSION,
      id: createId(),
      pin: createPin(),
      name: "",
      date: "",
      format: "landscape",
      contact: {
        name: "",
        email: "",
        phone: ""
      },
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      design: {
        rendererVersion: VERSION,
        layout: {
          id: "three-photo",
          slots: [
            { id: "slot-1", x: 7, y: 8, width: 52, height: 70 },
            { id: "slot-2", x: 64, y: 8, width: 29, height: 29 },
            { id: "slot-3", x: 64, y: 41, width: 29, height: 29 }
          ]
        },
        background: {
          type: "color",
          value: "#d9edc8"
        },
        frame: {
          type: "thin",
          value: "#ffffff"
        },
        text: {
          content: "",
          fontFamily: "Fraunces",
          fontSize: 31,
          color: "#d0aa4e",
          x: 50,
          y: 89,
          scale: 1,
          rotation: 0,
          align: "center"
        },
        images: [],
        graphics: [],
        slots: {
          "slot-1": null,
          "slot-2": null,
          "slot-3": null
        },
        imageCrops: {},
        printer: {
          enabled: true,
          copies: 1,
          format: "postcard-10x15",
          printerId: "SELPHY"
        },
        cheese: {
          enabled: false,
          assetId: null
        }
      }
    };

    return event;
  }

  function migrateLegacyCheese(event) {
    if (!event || typeof event !== "object") return event;
    if (!event.design || typeof event.design !== "object") event.design = {};
    if (!Array.isArray(event.design.graphics)) event.design.graphics = [];
    if (!event.design.cheese || typeof event.design.cheese !== "object") {
      event.design.cheese = { enabled: false, assetId: null };
      return event;
    }
    const cheese = event.design.cheese;
    if (!cheese.enabled || !cheese.assetId) return event;
    const legacyId = cheese.assetId;
    const alreadyMigrated = event.design.graphics.some(
      graphic => graphic && graphic.legacyCheese === true && graphic.builtinId === legacyId
    );
    if (!alreadyMigrated) {
      const graphic = builtinGraphic(legacyId);
      if (graphic) event.design.graphics.push(graphic);
    }
    event.design.cheese = { enabled: false, assetId: null };
    return event;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Keine gültige Eventdatei.");
    }

    const event = JSON.parse(JSON.stringify(raw));

    if (!event.schemaVersion) event.schemaVersion = VERSION;
    if (!event.id) event.id = createId();
    if (!event.pin) event.pin = createPin();
    if (!event.contact) event.contact = { name: "", email: "", phone: "" };
    if (!event.design) event.design = {};

    // Backward compatibility with early browser-demo versions.
    if (typeof event.design.background === "string") {
      event.design.background = { type: "color", value: event.design.background };
    }
    if (typeof event.design.text === "string") {
      event.design.text = {
        content: event.design.text, fontFamily: "Fraunces", fontSize: 31,
        color: event.design.textColor || "#d0aa4e", x: event.design.textX ?? 50,
        y: event.design.textY ?? 89, scale: event.design.textScale ?? 1,
        rotation: event.design.textRotation ?? 0, align: "center"
      };
    }
    if (!event.design.layout || Array.isArray(event.design.layout)) {
      const count = Number(event.design.layout) || 3;
      const layouts = {
        landscape: {
          1: [{id:"slot-1",x:7,y:8,width:86,height:84}],
          2: [{id:"slot-1",x:7,y:8,width:42,height:84},{id:"slot-2",x:51,y:8,width:42,height:84}],
          3: [{id:"slot-1",x:7,y:8,width:55,height:84},{id:"slot-2",x:66,y:8,width:27,height:39},{id:"slot-3",x:66,y:53,width:27,height:39}],
          4: [{id:"slot-1",x:7,y:8,width:42,height:40},{id:"slot-2",x:51,y:8,width:42,height:40},{id:"slot-3",x:7,y:52,width:42,height:40},{id:"slot-4",x:51,y:52,width:42,height:40}]
        },
        portrait: {
          1: [{id:"slot-1",x:8,y:6,width:84,height:88}],
          2: [{id:"slot-1",x:8,y:6,width:84,height:42},{id:"slot-2",x:8,y:52,width:84,height:42}],
          3: [{id:"slot-1",x:8,y:6,width:84,height:52},{id:"slot-2",x:8,y:62,width:40,height:32},{id:"slot-3",x:52,y:62,width:40,height:32}],
          4: [{id:"slot-1",x:8,y:6,width:40,height:42},{id:"slot-2",x:52,y:6,width:40,height:42},{id:"slot-3",x:8,y:52,width:40,height:42},{id:"slot-4",x:52,y:52,width:40,height:42}]
        }
      };
      const format = event.format === "portrait" ? "portrait" : "landscape";
      event.design.layout = { id:`${format}-${count}`, slots: layouts[format][count] || layouts[format][3] };
    }

    event.design.rendererVersion ??= VERSION;
    event.design.images ??= [];
    event.design.graphics ??= [];
    if (event.design.slots && (event.design.slots[1] !== undefined || event.design.slots[2] !== undefined)) {
      event.design.slots = {
        "slot-1": event.design.slots[1] ?? null,
        "slot-2": event.design.slots[2] ?? null,
        "slot-3": event.design.slots[3] ?? null,
        "slot-4": event.design.slots[4] ?? null
      };
    }

    // Slot-Zuordnungen immer exakt an das aktuell gewählte Layout anpassen.
    // Dadurch entstehen bei 1/2/3-Slot-Layouts keine überzähligen slot-N Einträge.
    const layoutSlotIds = Array.isArray(event.design.layout?.slots)
      ? event.design.layout.slots.map(slot => slot?.id).filter(Boolean)
      : [];
    const existingSlots = event.design.slots || {};
    event.design.slots = {};
    layoutSlotIds.forEach(slotId => {
      event.design.slots[slotId] = existingSlots[slotId] ?? null;
    });
    event.design.imageCrops ??= {};
    event.design.printer ??= {
      enabled: true,
      copies: 1,
      format: "postcard-10x15",
      printerId: "SELPHY"
    };
    event.design.cheese ??= { enabled: false, assetId: null };

    // Alte Cheese-Events zuverlässig in echte Grafik-Elemente migrieren.
    migrateLegacyCheese(event);

    if (!event.design.background) {
      event.design.background = { type: "color", value: "#d9edc8" };
    }

    if (!event.design.text) {
      event.design.text = {
        content: "",
        fontFamily: "Fraunces",
        fontSize: 31,
        color: "#d0aa4e",
        x: 50,
        y: 89,
        scale: 1,
        rotation: 0,
        align: "center"
      };
    }

    // Medienfreigaben des Events.
    // Die eigentlichen Dateien bleiben zentral in der Medienbibliothek.
    event.mediaPermissions ??= {};
    event.mediaPermissions.graphics ??= [];
    event.mediaPermissions.images ??= [];

    return event;
  }

function validate(event) {
    const errors = [];
    if (!event || typeof event !== "object") errors.push("Event fehlt.");
    if (!event?.id) errors.push("Event-ID fehlt.");
    if (!event?.pin || !/^\d{4}$/.test(String(event.pin))) errors.push("PIN muss vierstellig sein.");
    if (!event?.schemaVersion) errors.push("schemaVersion fehlt.");
    if (!event?.design) errors.push("Designdaten fehlen.");
    if (!event?.design?.layout) errors.push("Layoutdaten fehlen.");
    if (!event?.design?.background) errors.push("Hintergrunddaten fehlen.");
    if (!event?.design?.text) errors.push("Textdaten fehlen.");
    return { valid: errors.length === 0, errors };
  }

  function exportPayload(event) {
    const normalized = normalize(event);
    normalized.updatedAt = new Date().toISOString();
    return {
      fileType: "photobooth-event",
      fileVersion: VERSION,
      exportedAt: new Date().toISOString(),
      event: normalized
    };
  }

  return { VERSION, createEvent, normalize, validate, exportPayload, createBuiltinGraphic: builtinGraphic, migrateLegacyCheese };
})();
