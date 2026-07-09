(function () {
  "use strict";

  const XOR_KEY = new TextEncoder().encode("zexzen-portal-v1");
  const HASH_PEPPER = "zexzen-portal-v1";
  const decodedDownloads = new Map();

  function reveal(value) {
    if (value == null || value === "") {
      return value;
    }
    if (typeof value !== "string" || !value.startsWith("enc:")) {
      return value;
    }

    try {
      const binary = atob(value.slice(4));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const decoded = bytes.map((byte, index) => byte ^ XOR_KEY[index % XOR_KEY.length]);
      return new TextDecoder().decode(decoded);
    } catch {
      return "";
    }
  }

  function encode(value) {
    if (value == null || value === "") {
      return value;
    }
    if (typeof value !== "string" || value.startsWith("enc:")) {
      return value;
    }

    const bytes = new TextEncoder().encode(value);
    const encoded = bytes.map((byte, index) => byte ^ XOR_KEY[index % XOR_KEY.length]);
    const binary = String.fromCharCode(...encoded);
    return `enc:${btoa(binary)}`;
  }

  async function hashPasscode(input) {
    const data = new TextEncoder().encode(`${HASH_PEPPER}:${input}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function isGated(mod) {
    return Boolean(mod?.passcodeHash || mod?.passcode);
  }

  function decodeDownloads(mod) {
    const downloads = [];

    if (Array.isArray(mod.downloads)) {
      mod.downloads.forEach((entry) => {
        if (entry?.name && entry?.link) {
          downloads.push({
            name: entry.name,
            description: entry.description || "",
            link: reveal(entry.link),
          });
        }
      });
    }

    if (!downloads.length && mod.link) {
      downloads.push({
        name: "Get Mod",
        description: "",
        link: reveal(mod.link),
      });
    }

    return downloads.filter((entry) => entry.link);
  }

  function cacheDownloads(modId, downloads) {
    decodedDownloads.set(modId, downloads);
  }

  function getCachedDownloads(modId) {
    return decodedDownloads.get(modId) || [];
  }

  function clearCachedDownloads(modId) {
    decodedDownloads.delete(modId);
  }

  function hasDownloadSource(mod) {
    if (Array.isArray(mod.downloads) && mod.downloads.some((entry) => entry?.name && entry?.link)) {
      return true;
    }
    return Boolean(mod.link);
  }

  function getDownloadCount(mod) {
    if (Array.isArray(mod.downloads)) {
      return mod.downloads.filter((entry) => entry?.name && entry?.link).length;
    }
    return mod.link ? 1 : 0;
  }

  async function verifyPasscode(mod, input) {
    if (mod.passcodeHash) {
      const entered = await hashPasscode(input);
      return entered === mod.passcodeHash;
    }

    if (mod.passcode) {
      return input === mod.passcode;
    }

    return true;
  }

  function prepareModAccess(mod, unlockedIds) {
    if (!isGated(mod)) {
      cacheDownloads(mod.id, decodeDownloads(mod));
      return;
    }

    if (unlockedIds.includes(mod.id)) {
      cacheDownloads(mod.id, decodeDownloads(mod));
    }
  }

  window.ModSecrets = {
    reveal,
    encode,
    hashPasscode,
    isGated,
    decodeDownloads,
    cacheDownloads,
    getCachedDownloads,
    clearCachedDownloads,
    hasDownloadSource,
    getDownloadCount,
    verifyPasscode,
    prepareModAccess,
  };
})();
