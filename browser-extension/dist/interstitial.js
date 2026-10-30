(() => {
  // browser-extension/src/interstitial.ts
  function element(id) {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing element #${id}`);
    return value;
  }
  var params = new URLSearchParams(window.location.search);
  var target = params.get("target") ?? "";
  var deepLink = params.get("deep") ?? "";
  var host = element("host");
  var targetElement = element("target");
  var error = element("error");
  var openButton = element("open-button");
  var continueButton = element("continue-button");
  function showError(message) {
    error.textContent = message;
    error.classList.remove("hidden");
    openButton.disabled = true;
    continueButton.disabled = true;
  }
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported link");
    }
    host.textContent = parsed.host;
    targetElement.textContent = target;
    targetElement.title = target;
  } catch {
    showError("This link is invalid or unsupported.");
  }
  if (!deepLink || !/^teamwork:/i.test(deepLink)) {
    showError("This is not a valid TeamWork link.");
  }
  openButton.addEventListener("click", () => {
    void chrome.tabs.getCurrent().then((tab) => {
      if (tab?.id !== void 0) {
        return chrome.tabs.update(tab.id, { url: deepLink });
      }
      window.location.href = deepLink;
      return void 0;
    }).catch(() => {
      window.location.href = deepLink;
    });
  });
  continueButton.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "continue-browser", target }).then((response) => {
      if (!response?.ok) window.location.href = target;
    }).catch(() => {
      window.location.href = target;
    });
  });
})();
