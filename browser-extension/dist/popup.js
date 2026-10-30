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
  function matchLink(raw, settings2) {
    let url;
    try {
      url = new URL(unwrapRedirectUrl(raw));
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const jitsiHosts = normalizeDomains(settings2.jitsiDomains);
    const publicJitsi = settings2.detectPublicJitsi ? PUBLIC_JITSI_HOSTS : [];
    const isJitsi = hostMatches(host, jitsiHosts) || publicJitsi.length > 0 && hostMatches(host, publicJitsi);
    if (isJitsi && isJitsiMeetingPath(url.pathname)) {
      return {
        kind: "jitsi",
        target: url.toString(),
        deepLink: buildDeepLink("jitsi", url.toString())
      };
    }
    const elementHosts = normalizeDomains(settings2.elementDomains);
    const isElement = hostMatches(host, elementHosts) && isElementPermalink(url);
    const isMatrixTo = settings2.detectMatrixTo && host === "matrix.to" && url.hash.startsWith("#/") && /^[!#@]/.test(url.hash.slice(2));
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
      const managed = await chrome.storage.managed.get(null);
      return managed ?? {};
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
    const managed = await loadManagedSettings();
    return normalizeSettings({ ...stored, ...managed });
  }

  // browser-extension/src/popup.ts
  function element(id) {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing element #${id}`);
    return value;
  }
  var matched = element("matched");
  var unmatched = element("unmatched");
  var pageTitle = element("page-title");
  var pageUrl = element("page-url");
  var matchKind = element("match-kind");
  var matchDescription = element("match-description");
  var openButton = element("open-button");
  var modeLabel = element("mode-label");
  var currentTab = null;
  var settings = null;
  function modeText(mode) {
    if (mode === "auto") return "Automatic opening";
    if (mode === "ask") return "Ask before opening";
    return "Click only";
  }
  async function main() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0] ?? null;
    settings = await loadSettings();
    modeLabel.textContent = modeText(settings.mode);
    const url = currentTab?.url ?? "";
    pageTitle.textContent = currentTab?.title || "Untitled page";
    pageUrl.textContent = url;
    pageUrl.title = url;
    const match = url ? matchLink(url, settings) : null;
    if (!match) {
      unmatched.classList.remove("hidden");
      return;
    }
    matched.classList.remove("hidden");
    matchKind.textContent = match.kind === "jitsi" ? "Jitsi meeting" : "Matrix / Element";
    matchDescription.textContent = new URL(match.target).host;
    openButton.addEventListener("click", () => {
      if (!currentTab?.id) return;
      const tabId = currentTab.id;
      void chrome.tabs.update(tabId, { url: match.deepLink }).catch(() => {
        const fallback = chrome.runtime.getURL("interstitial.html") + `?target=${encodeURIComponent(match.target)}&deep=${encodeURIComponent(match.deepLink)}`;
        return chrome.tabs.update(tabId, { url: fallback });
      }).finally(() => window.close());
    });
  }
  element("settings-button").addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
  void main();
})();
