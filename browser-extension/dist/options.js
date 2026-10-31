(() => {
  // browser-extension/src/lib/links.ts
  var PUBLIC_JITSI_HOSTS = ["meet.jit.si", "8x8.vc", "*.8x8.vc"];
  var REDIRECT_PARAMS = [
    "url",
    "u",
    "target",
    "redirect",
    "redirect_uri",
    "destination",
    "dest"
  ];
  var JITSI_ASSET_PREFIXES = [
    "/config",
    "/libs",
    "/css",
    "/fonts",
    "/images",
    "/img",
    "/sounds",
    "/lang",
    "/api",
    "/http-bind",
    "/external_api",
    "/iframe_api",
    "/static",
    "/assets",
    "/_"
  ];
  function normalizeDomains(values) {
    const normalized = [];
    for (const raw of values) {
      let value = raw.trim().toLowerCase();
      if (!value) continue;
      value = value.replace(/^[a-z]+:\/\//, "").split("/")[0] ?? "";
      if (!value) continue;
      value = value.split(":")[0] ?? value;
      if (value.startsWith("*.")) {
        value = value.slice(2);
        if (!value.includes(".")) continue;
        normalized.push(`*.${value}`);
        continue;
      }
      if (!value.includes(".") && value !== "localhost") continue;
      normalized.push(value);
    }
    return [...new Set(normalized)];
  }
  function hostMatches(hostname, patterns) {
    const host = hostname.toLowerCase();
    return patterns.some((pattern) => {
      const normalized = pattern.toLowerCase().trim();
      if (!normalized) return false;
      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(1);
        return host.endsWith(suffix) && host.length > suffix.length;
      }
      return host === normalized;
    });
  }
  function unwrapRedirectUrl(raw) {
    let current = raw.trim();
    for (let depth = 0; depth < 3; depth += 1) {
      let url;
      try {
        url = new URL(current);
      } catch {
        break;
      }
      let next = null;
      for (const parameter of REDIRECT_PARAMS) {
        const value = url.searchParams.get(parameter);
        if (!value) continue;
        try {
          const candidate = new URL(value);
          if (candidate.protocol === "http:" || candidate.protocol === "https:") {
            next = candidate.toString();
            break;
          }
        } catch {
        }
      }
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }
  function isJitsiMeetingPath(pathname) {
    const path = pathname.replace(/\/+$/, "");
    if (path === "" || path === "/") return false;
    return !JITSI_ASSET_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`)
    );
  }
  function isElementPermalink(url) {
    return /^#\/(?:room|user)\//.test(url.hash);
  }
  function matchLink(raw, settings) {
    let url;
    try {
      url = new URL(unwrapRedirectUrl(raw));
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const jitsiHosts = normalizeDomains(settings.jitsiDomains);
    const publicJitsi = settings.detectPublicJitsi ? PUBLIC_JITSI_HOSTS : [];
    const isJitsi = hostMatches(host, jitsiHosts) || publicJitsi.length > 0 && hostMatches(host, publicJitsi);
    if (isJitsi && isJitsiMeetingPath(url.pathname)) {
      return {
        kind: "jitsi",
        target: url.toString(),
        deepLink: buildDeepLink("jitsi", url.toString())
      };
    }
    const elementHosts = normalizeDomains(settings.elementDomains);
    const isElement = hostMatches(host, elementHosts) && isElementPermalink(url);
    const isMatrixTo = settings.detectMatrixTo && host === "matrix.to" && url.hash.startsWith("#/") && /^[!#@]/.test(url.hash.slice(2));
    if (isElement || isMatrixTo) {
      return {
        kind: "matrix",
        target: url.toString(),
        deepLink: buildDeepLink("matrix", url.toString())
      };
    }
    return null;
  }
  function buildDeepLink(kind, target) {
    const action = kind === "jitsi" ? "join" : "matrix";
    return `teamwork://${action}?url=${encodeURIComponent(target)}`;
  }

  // browser-extension/src/lib/settings.ts
  var DEFAULT_SETTINGS = {
    jitsiDomains: [],
    elementDomains: [],
    mode: "auto",
    detectPublicJitsi: true,
    detectMatrixTo: true,
    interceptAllSites: false
  };
  var MODES = ["auto", "ask", "click"];
  function normalizeSettings(input) {
    const value = input ?? {};
    return {
      jitsiDomains: normalizeDomains(Array.isArray(value.jitsiDomains) ? value.jitsiDomains : []),
      elementDomains: normalizeDomains(
        Array.isArray(value.elementDomains) ? value.elementDomains : []
      ),
      mode: MODES.includes(value.mode) ? value.mode : DEFAULT_SETTINGS.mode,
      detectPublicJitsi: typeof value.detectPublicJitsi === "boolean" ? value.detectPublicJitsi : DEFAULT_SETTINGS.detectPublicJitsi,
      detectMatrixTo: typeof value.detectMatrixTo === "boolean" ? value.detectMatrixTo : DEFAULT_SETTINGS.detectMatrixTo,
      interceptAllSites: typeof value.interceptAllSites === "boolean" ? value.interceptAllSites : DEFAULT_SETTINGS.interceptAllSites
    };
  }
  async function loadManagedSettings() {
    try {
      const managed2 = await chrome.storage.managed.get(null);
      return managed2 ?? {};
    } catch {
      return {};
    }
  }
  async function loadSettings() {
    let stored = {};
    try {
      const result = await chrome.storage.sync.get("settings");
      stored = result.settings ?? {};
    } catch {
      stored = {};
    }
    const managed2 = await loadManagedSettings();
    return normalizeSettings({ ...stored, ...managed2 });
  }
  async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings: normalizeSettings(settings) });
  }
  function allSitesOrigins() {
    return ["https://*/*", "http://*/*"];
  }
  async function hasAllSitesPermission() {
    try {
      return await chrome.permissions.contains({ origins: allSitesOrigins() });
    } catch {
      return false;
    }
  }
  async function syncAllSitesContentScript(enabled) {
    const id = "teamwork-all-sites";
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    } catch {
    }
    if (!enabled) return;
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: allSitesOrigins(),
        js: ["content.js"],
        runAt: "document_start",
        allFrames: true
      }
    ]);
  }

  // browser-extension/src/options.ts
  function element(id) {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing element #${id}`);
    return value;
  }
  var form = element("settings-form");
  var jitsiDomains = element("jitsi-domains");
  var elementDomains = element("element-domains");
  var detectPublicJitsi = element("detect-public-jitsi");
  var detectMatrixTo = element("detect-matrix-to");
  var mode = element("mode");
  var modeHelp = element("mode-help");
  var interceptAllSites = element("intercept-all-sites");
  var permissionNote = element("permission-note");
  var testUrl = element("test-url");
  var testResult = element("test-result");
  var status = element("status");
  var managedBanner = element("managed-banner");
  var managed = {};
  function lines(value) {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  function collectSettings() {
    return normalizeSettings({
      jitsiDomains: lines(jitsiDomains.value),
      elementDomains: lines(elementDomains.value),
      detectPublicJitsi: detectPublicJitsi.checked,
      detectMatrixTo: detectMatrixTo.checked,
      mode: mode.value,
      interceptAllSites: interceptAllSites.checked
    });
  }
  function updateModeHelp() {
    const text = mode.value === "auto" ? "Matching links open TeamWork immediately. The browser may ask once for protocol permission." : mode.value === "ask" ? "Matching links show an intermediate page with \u201COpen in TeamWork\u201D and \u201CContinue in browser\u201D." : "Matching links are only converted when clicked inside a supported mail site, through the context menu, or from the popup.";
    modeHelp.textContent = text;
  }
  function setStatus(message, kind = "success") {
    status.textContent = message;
    status.className = `status is-${kind}`;
    if (kind === "success") {
      window.setTimeout(() => {
        if (status.textContent === message) {
          status.textContent = "";
          status.className = "status";
        }
      }, 3500);
    }
  }
  function applyManagedState() {
    const keys = new Set(Object.keys(managed));
    if (keys.size === 0) return;
    managedBanner.classList.remove("hidden");
    const map = [
      ["jitsiDomains", jitsiDomains],
      ["elementDomains", elementDomains],
      ["detectPublicJitsi", detectPublicJitsi],
      ["detectMatrixTo", detectMatrixTo],
      ["mode", mode],
      ["interceptAllSites", interceptAllSites]
    ];
    for (const [key, control] of map) {
      if (keys.has(key)) {
        control.setAttribute("disabled", "true");
      }
    }
  }
  async function updatePermissionNote() {
    const granted = await hasAllSitesPermission();
    if (interceptAllSites.checked && !granted) {
      permissionNote.textContent = "Permission to read all websites has not been granted. Save or re-enable the option to request it.";
    } else if (managed.interceptAllSites === true && !granted) {
      permissionNote.textContent = "Your organization enabled all-site interception, but the browser permission is not granted. Click Save to request it.";
    } else if (granted) {
      permissionNote.textContent = "All-site access is granted.";
    } else {
      permissionNote.textContent = "";
    }
  }
  async function apply(settings) {
    jitsiDomains.value = settings.jitsiDomains.join("\n");
    elementDomains.value = settings.elementDomains.join("\n");
    detectPublicJitsi.checked = settings.detectPublicJitsi;
    detectMatrixTo.checked = settings.detectMatrixTo;
    mode.value = settings.mode;
    const permission = await hasAllSitesPermission();
    interceptAllSites.checked = settings.interceptAllSites && permission;
    updateModeHelp();
    applyManagedState();
    await updatePermissionNote();
  }
  async function requestAllSites() {
    try {
      const granted = await hasAllSitesPermission();
      if (granted) return true;
      return await chrome.permissions.request({ origins: allSitesOrigins() });
    } catch {
      return false;
    }
  }
  async function disableAllSites() {
    await syncAllSitesContentScript(false);
    try {
      await chrome.permissions.remove({ origins: allSitesOrigins() });
    } catch {
    }
  }
  async function save() {
    const next = collectSettings();
    const wantsAllSites = interceptAllSites.checked || managed.interceptAllSites === true;
    if (wantsAllSites) {
      const granted = await requestAllSites();
      if (!granted) {
        if (managed.interceptAllSites === true) {
          setStatus(
            "The browser did not grant all-site access. The managed setting cannot take effect without it.",
            "error"
          );
          return;
        }
        interceptAllSites.checked = false;
        next.interceptAllSites = false;
        setStatus("All-site access was not granted; local-only interception is still active.", "error");
      } else {
        next.interceptAllSites = true;
      }
    } else {
      next.interceptAllSites = false;
      await disableAllSites();
    }
    try {
      await saveSettings(next);
      await syncAllSitesContentScript(next.interceptAllSites);
      setStatus("Settings saved.");
      await updatePermissionNote();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings.", "error");
    }
  }
  function testCurrentLink() {
    const value = testUrl.value.trim();
    if (!value) {
      testResult.textContent = "Paste a link first.";
      return;
    }
    if (/^teamwork:/i.test(value)) {
      testResult.textContent = "This is already a TeamWork deep link. Paste a normal HTTPS link.";
      return;
    }
    const match = matchLink(value, collectSettings());
    if (!match) {
      testResult.textContent = "Not recognized. Check the hostname and make sure it is listed as a trusted Jitsi or Element domain.";
      return;
    }
    testResult.textContent = [
      `Type: ${match.kind === "jitsi" ? "Jitsi meeting" : "Matrix / Element link"}`,
      `Target: ${match.target}`,
      `TeamWork link: ${match.deepLink}`
    ].join("\n");
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  mode.addEventListener("change", updateModeHelp);
  testUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      testCurrentLink();
    }
  });
  element("test-button").addEventListener("click", testCurrentLink);
  element("reset-button").addEventListener("click", () => {
    if (!window.confirm("Reset local extension settings to defaults? Managed settings are preserved.")) {
      return;
    }
    void disableAllSites().then(() => chrome.storage.sync.remove("settings")).finally(() => window.location.reload());
  });
  interceptAllSites.addEventListener("change", () => {
    if (!interceptAllSites.checked) {
      void disableAllSites().then(updatePermissionNote);
      return;
    }
    if (managed.interceptAllSites === true) return;
    void requestAllSites().then((granted) => {
      if (!granted) interceptAllSites.checked = false;
      else setStatus("Permission granted. Click Save settings to enable all-site interception.");
      void updatePermissionNote();
    });
  });
  void Promise.all([loadSettings(), loadManagedSettings()]).then(async ([settings, managedSettings]) => {
    managed = managedSettings;
    await apply(settings);
  }).catch((error) => {
    setStatus(error instanceof Error ? error.message : "Could not load settings.", "error");
    void apply(DEFAULT_SETTINGS);
  });
})();
