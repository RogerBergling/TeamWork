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

  // browser-extension/src/content.ts
  var INSTALLED_KEY = "__teamworkLinkContentScriptInstalled";
  function init() {
    let settings = DEFAULT_SETTINGS;
    let settingsReady = false;
    const refreshSettings = async () => {
      try {
        settings = await loadSettings();
        settingsReady = true;
      } catch {
        settings = DEFAULT_SETTINGS;
      }
    };
    void refreshSettings();
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === "sync" || area === "managed") void refreshSettings();
    });
    document.addEventListener(
      "click",
      (event) => {
        if (!settingsReady || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) return;
        const anchor = target.closest("a[href]");
        if (!(anchor instanceof HTMLAnchorElement)) return;
        const saferedirect = anchor.getAttribute("data-saferedirecturl");
        const rawHref = saferedirect || anchor.href;
        const match = matchLink(rawHref, settings);
        if (!match) return;
        event.preventDefault();
        event.stopPropagation();
        void chrome.runtime.sendMessage({
          type: "open-link",
          kind: match.kind,
          target: match.target,
          deepLink: match.deepLink
        }).catch(() => {
          window.location.assign(anchor.href);
        });
      },
      true
    );
  }
  if (!globalThis[INSTALLED_KEY]) {
    ;
    globalThis[INSTALLED_KEY] = true;
    init();
  }
})();
