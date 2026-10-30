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

  // browser-extension/src/background.ts
  var settingsCache = DEFAULT_SETTINGS;
  var settingsReady = false;
  var settingsLoading = null;
  var bypass = /* @__PURE__ */ new Map();
  var recentRedirects = /* @__PURE__ */ new Map();
  async function getSettings(force = false) {
    if (settingsReady && !force) return settingsCache;
    if (!settingsLoading || force) {
      settingsLoading = loadSettings().then((settings) => {
        settingsCache = settings;
        settingsReady = true;
        return settings;
      }).finally(() => {
        settingsLoading = null;
      });
    }
    return settingsLoading;
  }
  function createMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open-link",
        title: "Open link in TeamWork",
        contexts: ["link"]
      });
      chrome.contextMenus.create({
        id: "open-page",
        title: "Open this page in TeamWork",
        contexts: ["page"]
      });
    });
  }
  function notify(message) {
    void chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "TeamWork Link Opener",
      message
    }).catch((error) => console.warn("Could not show notification", error));
  }
  async function showInterstitial(tabId, target, deepLink) {
    const url = chrome.runtime.getURL("interstitial.html") + `?target=${encodeURIComponent(target)}&deep=${encodeURIComponent(deepLink)}`;
    await chrome.tabs.update(tabId, { url });
  }
  async function openMatch(tabId, match) {
    try {
      if (tabId !== void 0) {
        await chrome.tabs.update(tabId, { url: match.deepLink });
      } else {
        await chrome.tabs.create({ url: match.deepLink });
      }
    } catch (error) {
      console.warn("Could not launch TeamWork protocol", error);
      if (tabId !== void 0) {
        try {
          await showInterstitial(tabId, match.target, match.deepLink);
        } catch (interstitialError) {
          console.warn("Could not show fallback page", interstitialError);
          notify("TeamWork could not be launched. Is the desktop application installed?");
        }
        return;
      }
      notify("TeamWork could not be launched. Is the desktop application installed?");
    }
  }
  async function handleNavigation(details) {
    if (details.tabId < 0 || details.frameId !== 0) return;
    if (!/^https?:/i.test(details.url)) return;
    const bypassEntry = bypass.get(details.tabId);
    if (bypassEntry) {
      if (Date.now() < bypassEntry.until && bypassEntry.url === details.url) {
        bypass.delete(details.tabId);
        return;
      }
      bypass.delete(details.tabId);
    }
    const settings = await getSettings();
    if (settings.mode === "click") return;
    const match = matchLink(details.url, settings);
    if (!match) return;
    const recent = recentRedirects.get(details.tabId);
    if (recent && recent.url === details.url && Date.now() - recent.at < 5e3) return;
    recentRedirects.set(details.tabId, { url: details.url, at: Date.now() });
    if (settings.mode === "auto") {
      await openMatch(details.tabId, match);
    } else {
      await showInterstitial(details.tabId, match.target, match.deepLink);
    }
  }
  async function ensureDynamicScript() {
    const settings = await getSettings();
    const permission = await hasAllSitesPermission();
    try {
      await syncAllSitesContentScript(settings.interceptAllSites && permission);
    } catch (error) {
      console.warn("Could not update all-sites content script", error);
    }
  }
  function contextMenuClick(info, tab) {
    const raw = info.menuItemId === "open-link" ? info.linkUrl : info.pageUrl;
    if (!raw) return;
    void getSettings().then(async (settings) => {
      const match = matchLink(raw, settings);
      if (!match) {
        notify(
          "This link is not a configured Jitsi or Element meeting. Add its domain in the extension settings."
        );
        return;
      }
      await openMatch(tab?.id, match);
    });
  }
  chrome.runtime.onInstalled.addListener(() => {
    createMenus();
    void getSettings(true).then(() => ensureDynamicScript());
  });
  chrome.runtime.onStartup.addListener(() => {
    createMenus();
    void ensureDynamicScript();
  });
  chrome.contextMenus.onClicked.addListener(contextMenuClick);
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    void handleNavigation(details).catch(
      (error) => console.warn("Could not process navigation", error)
    );
  });
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== "sync" && area !== "managed") return;
    settingsReady = false;
    void getSettings(true).then(() => ensureDynamicScript());
  });
  chrome.permissions.onAdded.addListener(() => {
    void ensureDynamicScript();
  });
  chrome.permissions.onRemoved.addListener(() => {
    void ensureDynamicScript();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const data = message ?? {};
    if (data.type === "open-link" && typeof data.deepLink === "string" && typeof data.target === "string") {
      const match = {
        kind: data.kind === "matrix" ? "matrix" : "jitsi",
        target: data.target,
        deepLink: data.deepLink
      };
      void openMatch(sender.tab?.id, match).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      return true;
    }
    if (data.type === "continue-browser" && typeof data.target === "string") {
      const tabId = sender.tab?.id;
      if (tabId === void 0) {
        sendResponse({ ok: false });
        return false;
      }
      bypass.set(tabId, { url: data.target, until: Date.now() + 15e3 });
      void chrome.tabs.update(tabId, { url: data.target }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      return true;
    }
    if (data.type === "open-target" && typeof data.target === "string") {
      void getSettings().then(async (settings) => {
        const match = matchLink(data.target, settings);
        if (!match) {
          notify("This link is not a configured Jitsi or Element meeting.");
          sendResponse({ ok: false });
          return;
        }
        await openMatch(sender.tab?.id, match);
        sendResponse({ ok: true });
      });
      return true;
    }
    if (data.type === "get-settings") {
      void getSettings().then((settings) => sendResponse(settings));
      return true;
    }
    return false;
  });
  void getSettings(true).then(() => ensureDynamicScript());
})();
