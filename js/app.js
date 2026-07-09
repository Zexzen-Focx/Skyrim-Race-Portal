(function () {
  "use strict";

  const STORAGE_KEY = "zexzens-mod-portal-unlocked";
  const DATA_URL = "data/mods.json";

  const elements = {
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    grid: document.getElementById("mod-grid"),
    detailsModal: document.getElementById("details-modal"),
    detailsTitle: document.getElementById("details-title"),
    detailsGallery: document.getElementById("details-gallery"),
    detailsBody: document.getElementById("details-body"),
    detailsDownloads: document.getElementById("details-downloads"),
    downloadsModal: document.getElementById("downloads-modal"),
    downloadsTitle: document.getElementById("downloads-title"),
    downloadsList: document.getElementById("downloads-list"),
    passcodeModal: document.getElementById("passcode-modal"),
    passcodeModName: document.getElementById("passcode-mod-name"),
    passcodeForm: document.getElementById("passcode-form"),
    passcodeInput: document.getElementById("passcode-input"),
    passcodeError: document.getElementById("passcode-error"),
    searchWrap: document.getElementById("search-wrap"),
    searchInput: document.getElementById("mod-search"),
    searchEmpty: document.getElementById("search-empty"),
  };

  let pendingMod = null;
  let pendingOpenDownloads = false;
  let allMods = [];

  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  function getUnlockedIds() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function unlockMod(id) {
    const ids = getUnlockedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  }

  function isUnlocked(mod) {
    return !ModSecrets.isGated(mod) || getUnlockedIds().includes(mod.id);
  }

  function getModDownloads(mod) {
    if (!isUnlocked(mod)) {
      return [];
    }
    return ModSecrets.getCachedDownloads(mod.id);
  }

  function sortMods(mods) {
    return [...mods].sort((a, b) => {
      const orderA = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }

  function getModImages(mod) {
    if (Array.isArray(mod.images) && mod.images.length > 0) {
      return mod.images.filter(Boolean);
    }
    if (mod.image) {
      return [mod.image];
    }
    return [];
  }

  function getMediaType(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.replace(/^www\./, "");

      if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        return "embed";
      }
      if (host === "vimeo.com" || host === "player.vimeo.com") {
        return "embed";
      }
      if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(parsed.pathname)) {
        return "video";
      }
    } catch {
      return "image";
    }

    return "image";
  }

  function toEmbedUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        const id = parsed.pathname.split("/").filter(Boolean)[0];
        return id ? `https://www.youtube.com/embed/${id}` : url;
      }

      if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        if (parsed.pathname.startsWith("/embed/")) {
          return parsed.href;
        }
        const id = parsed.searchParams.get("v");
        if (id) {
          return `https://www.youtube.com/embed/${id}`;
        }
      }

      if (host === "vimeo.com") {
        const id = parsed.pathname.split("/").filter(Boolean)[0];
        return id ? `https://player.vimeo.com/video/${id}` : url;
      }

      if (host === "player.vimeo.com") {
        return parsed.href;
      }
    } catch {
      return url;
    }

    return url;
  }

  function createGallerySlide(src, { alt, index, total }) {
    const slide = document.createElement("div");
    slide.className = "gallery__slide";
    const mediaType = getMediaType(src);
    slide.dataset.mediaType = mediaType;

    const label = total > 1 ? `${alt} — media ${index + 1}` : alt;

    if (mediaType === "embed") {
      const iframe = document.createElement("iframe");
      iframe.className = "gallery__embed";
      iframe.src = toEmbedUrl(src);
      iframe.title = label;
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      );
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      slide.appendChild(iframe);
      return slide;
    }

    if (mediaType === "video") {
      slide.classList.add("gallery__slide--video");
      const video = document.createElement("video");
      video.className = "gallery__video";
      video.src = src;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("controlsList", "nodownload");
      slide.appendChild(video);
      return slide;
    }

    const img = document.createElement("img");
    img.className = "gallery__image";
    img.src = src;
    img.alt = label;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      slide.innerHTML = "";
      slide.dataset.mediaType = "fallback";
      slide.appendChild(createFallback(alt));
    });
    slide.appendChild(img);
    return slide;
  }

  function pauseInactiveMedia(track, activeIndex) {
    track.querySelectorAll(".gallery__slide").forEach((slide, index) => {
      const video = slide.querySelector("video");
      if (video && index !== activeIndex) {
        video.pause();
      }
    });
  }

  function renderMarkdown(markdown) {
    const raw = marked.parse(markdown || "");
    return DOMPurify.sanitize(raw);
  }

  function openModal(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function closeModal(dialog) {
    dialog.close();
  }

  function createFallback(alt) {
    const fallback = document.createElement("div");
    fallback.className = "gallery__fallback";
    fallback.textContent = "⚔";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", alt ? `${alt} — image unavailable` : "Image unavailable");
    return fallback;
  }

  function initGallery(gallery, images) {
    let index = 0;
    const viewport = gallery.querySelector(".gallery__viewport");
    const track = gallery.querySelector(".gallery__track");
    const dots = gallery.querySelectorAll(".gallery__dot");
    const counter = gallery.querySelector(".gallery__counter");
    const prevBtn = gallery.querySelector(".gallery__nav--prev");
    const nextBtn = gallery.querySelector(".gallery__nav--next");

    function slideWidth() {
      return viewport.clientWidth;
    }

    function syncSlideSizes() {
      const width = slideWidth();
      track.querySelectorAll(".gallery__slide").forEach((slide) => {
        slide.style.flexBasis = `${width}px`;
        slide.style.width = `${width}px`;
      });
    }

    function goTo(nextIndex) {
      index = (nextIndex + images.length) % images.length;
      track.style.transform = `translate3d(-${index * slideWidth()}px, 0, 0)`;
      dots.forEach((dot, i) => {
        dot.classList.toggle("gallery__dot--active", i === index);
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      if (counter) {
        counter.textContent = `${index + 1} / ${images.length}`;
      }
      pauseInactiveMedia(track, index);
    }

    syncSlideSizes();
    goTo(0);

    const resizeObserver = new ResizeObserver(() => {
      syncSlideSizes();
      goTo(index);
    });
    resizeObserver.observe(viewport);

    prevBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      goTo(index - 1);
    });

    nextBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      goTo(index + 1);
    });

    dots.forEach((dot, i) => {
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        goTo(i);
      });
    });
  }

  function createGallery(images, { alt, variant = "card" }) {
    const gallery = document.createElement("div");
    gallery.className = `gallery gallery--${variant}`;

    if (images.length === 0) {
      gallery.appendChild(createFallback(alt));
      return gallery;
    }

    const viewport = document.createElement("div");
    viewport.className = "gallery__viewport";

    const track = document.createElement("div");
    track.className = "gallery__track";

    images.forEach((src, i) => {
      track.appendChild(createGallerySlide(src, { alt, index: i, total: images.length }));
    });

    viewport.appendChild(track);
    gallery.appendChild(viewport);

    if (images.some((src) => getMediaType(src) === "video")) {
      gallery.classList.add("gallery--has-video");
    }

    if (images.length > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "gallery__nav gallery__nav--prev";
      prevBtn.setAttribute("aria-label", "Previous slide");
      prevBtn.innerHTML = "&#8249;";

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "gallery__nav gallery__nav--next";
      nextBtn.setAttribute("aria-label", "Next slide");
      nextBtn.innerHTML = "&#8250;";

      const dots = document.createElement("div");
      dots.className = "gallery__dots";
      dots.setAttribute("role", "tablist");
      dots.setAttribute("aria-label", "Media gallery");

      images.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "gallery__dot" + (i === 0 ? " gallery__dot--active" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", `Slide ${i + 1}`);
        dot.setAttribute("aria-selected", i === 0 ? "true" : "false");
        dots.appendChild(dot);
      });

      const counter = document.createElement("span");
      counter.className = "gallery__counter";
      counter.textContent = `1 / ${images.length}`;

      gallery.append(prevBtn, nextBtn, dots, counter);
      initGallery(gallery, images);
    }

    return gallery;
  }

  function openDownloadLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function showDownloadsModal(mod) {
    elements.downloadsTitle.textContent = mod.name;
    elements.downloadsList.innerHTML = "";

    getModDownloads(mod).forEach((download) => {
      const item = document.createElement("article");
      item.className = "download-item";

      const title = document.createElement("h3");
      title.className = "download-item__title";
      title.textContent = download.name;

      const body = document.createElement("div");
      body.className = "download-item__body";

      body.appendChild(title);

      if (download.description) {
        const desc = document.createElement("p");
        desc.className = "download-item__desc";
        desc.textContent = download.description;
        body.appendChild(desc);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--primary download-item__btn";
      btn.textContent = "Open";
      btn.addEventListener("click", () => openDownloadLink(download.link));

      item.append(body, btn);
      elements.downloadsList.appendChild(item);
    });

    openModal(elements.downloadsModal);
  }

  function requestModAccess(mod) {
    if (!isUnlocked(mod)) {
      pendingMod = mod;
      pendingOpenDownloads = true;
      elements.passcodeModName.textContent = mod.name;
      elements.passcodeInput.value = "";
      elements.passcodeError.classList.add("hidden");
      openModal(elements.passcodeModal);
      elements.passcodeInput.focus();
      return;
    }

    showDownloadsModal(mod);
  }

  function createModAccessButton(mod) {
    const locked = ModSecrets.isGated(mod) && !isUnlocked(mod);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--primary";

    if (locked) {
      btn.textContent = "Unlock Mod";
      btn.classList.add("btn--locked");
    } else {
      btn.textContent = "Downloads";
    }

    btn.addEventListener("click", () => requestModAccess(mod));
    return btn;
  }

  function refreshModCard(modId) {
    const mod = allMods.find((entry) => entry.id === modId);
    const card = elements.grid.querySelector(`[data-mod-id="${modId}"]`);
    if (mod && card) {
      card.replaceWith(createModCard(mod));
    }
  }

  function renderDetailsDownloads(mod) {
    elements.detailsDownloads.innerHTML = "";
    if (!ModSecrets.hasDownloadSource(mod)) {
      elements.detailsDownloads.classList.add("hidden");
      return;
    }

    elements.detailsDownloads.appendChild(createModAccessButton(mod));
    elements.detailsDownloads.classList.remove("hidden");
  }

  function showDetails(mod) {
    elements.detailsTitle.textContent = mod.name;

    const images = getModImages(mod);
    elements.detailsGallery.innerHTML = "";
    if (images.length > 0) {
      elements.detailsGallery.appendChild(createGallery(images, { alt: mod.name, variant: "modal" }));
      elements.detailsGallery.classList.remove("hidden");
    } else {
      elements.detailsGallery.classList.add("hidden");
    }

    elements.detailsBody.innerHTML = renderMarkdown(mod.description);
    renderDetailsDownloads(mod);
    openModal(elements.detailsModal);
  }

  function createModTags(mod) {
    const tags = [];
    if (mod.wip) tags.push({ label: "WIP", className: "mod-tag--wip" });
    if (mod.earlyAccess) tags.push({ label: "Early Access", className: "mod-tag--early-access" });
    if (!tags.length) return null;

    const wrap = document.createElement("div");
    wrap.className = "mod-card__tags";

    tags.forEach(({ label, className }) => {
      const tag = document.createElement("span");
      tag.className = `mod-tag ${className}`;
      tag.textContent = label;
      wrap.appendChild(tag);
    });

    return wrap;
  }

  function createModCard(mod) {
    const card = document.createElement("article");
    card.className = "mod-card";
    card.dataset.modId = mod.id;

    const imageWrap = document.createElement("div");
    imageWrap.className = "mod-card__image-wrap";
    imageWrap.appendChild(createGallery(getModImages(mod), { alt: mod.name, variant: "card" }));

    const tags = createModTags(mod);
    if (tags) imageWrap.appendChild(tags);

    const body = document.createElement("div");
    body.className = "mod-card__body";

    const title = document.createElement("h2");
    title.className = "mod-card__title";
    title.textContent = mod.name;

    const actions = document.createElement("div");
    actions.className = "mod-card__actions";

    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = "More Details";
    detailsBtn.addEventListener("click", () => showDetails(mod));

    actions.appendChild(detailsBtn);
    actions.appendChild(createModAccessButton(mod));

    body.append(title, actions);
    card.append(imageWrap, body);

    return card;
  }

  function validateMod(mod, index) {
    const required = ["id", "name", "description"];
    for (const field of required) {
      if (!mod[field]) {
        throw new Error(`Mod at index ${index} is missing required field: "${field}"`);
      }
    }
    if (!ModSecrets.hasDownloadSource(mod)) {
      throw new Error(`Mod at index ${index} needs "downloads" (array) or "link" (string)`);
    }
    if (getModImages(mod).length === 0) {
      throw new Error(`Mod at index ${index} needs "images" (array) or "image" (string)`);
    }
  }

  function modSearchText(mod) {
    const parts = [mod.name, mod.id, mod.description || ""];
    if (Array.isArray(mod.downloads)) {
      mod.downloads.forEach((download) => {
        if (download?.name) parts.push(download.name);
        if (download?.description) parts.push(download.description);
      });
    }
    if (mod.wip) parts.push("wip");
    if (mod.earlyAccess) parts.push("early access");
    if (!ModSecrets.isGated(mod)) parts.push("public");
    return parts.join(" ").toLowerCase();
  }

  function filterMods(query) {
    const term = query.trim().toLowerCase();
    if (!term) return allMods;
    return allMods.filter((mod) => modSearchText(mod).includes(term));
  }

  function applySearch() {
    const filtered = filterMods(elements.searchInput.value);
    renderMods(filtered);
    elements.searchEmpty.classList.toggle("hidden", filtered.length > 0);
    elements.grid.classList.toggle("hidden", filtered.length === 0);
  }

  function renderMods(mods) {
    elements.grid.innerHTML = "";
    mods.forEach((mod, index) => {
      validateMod(mod, index);
      elements.grid.appendChild(createModCard(mod));
    });
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.classList.remove("hidden");
  }

  async function loadMods() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        throw new Error(`Could not load mod data (${response.status})`);
      }
      const data = await response.json();
      if (!Array.isArray(data.mods)) {
        throw new Error('Invalid mod data: expected a "mods" array');
      }
      allMods = sortMods(data.mods);
      const unlockedIds = getUnlockedIds();
      allMods.forEach((mod) => ModSecrets.prepareModAccess(mod, unlockedIds));
      renderMods(allMods);
      elements.searchWrap.classList.remove("hidden");
    } catch (err) {
      showError(err.message || "Failed to load mods.");
    } finally {
      elements.loading.classList.add("hidden");
    }
  }

  elements.searchInput.addEventListener("input", applySearch);

  elements.passcodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingMod) return;

    const entered = elements.passcodeInput.value.trim();
    const valid = await ModSecrets.verifyPasscode(pendingMod, entered);

    if (valid) {
      ModSecrets.cacheDownloads(pendingMod.id, ModSecrets.decodeDownloads(pendingMod));
      unlockMod(pendingMod.id);
      closeModal(elements.passcodeModal);

      const mod = pendingMod;
      pendingMod = null;

      refreshModCard(mod.id);

      if (pendingOpenDownloads) {
        showDownloadsModal(mod);
      }
      pendingOpenDownloads = false;
    } else {
      elements.passcodeError.classList.remove("hidden");
      elements.passcodeInput.select();
    }
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close");
      const dialog = document.getElementById(id);
      if (dialog) {
        closeModal(dialog);
        if (id === "passcode-modal") {
          pendingMod = null;
          pendingOpenDownloads = false;
        }
      }
    });
  });

  [elements.detailsModal, elements.passcodeModal, elements.downloadsModal].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeModal(dialog);
        if (dialog === elements.passcodeModal) {
          pendingMod = null;
          pendingOpenDownloads = false;
        }
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      pendingMod = null;
      pendingOpenDownloads = false;
    }
  });

  loadMods();
})();
