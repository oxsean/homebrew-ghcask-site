(function () {
  var pageLang = document.body.getAttribute("data-page-lang") || "en";
  var html = document.documentElement;
  var themeButton = document.querySelector("[data-theme-toggle]");
  var toast = document.querySelector("[data-toast]");
  var themeKey = "ghcask-theme";
  var langKey = "ghcask-language";
  var themeOrder = ["auto", "light", "dark"];
  var themeLabels = {
    en: {
      auto: "Auto",
      light: "Light",
      dark: "Dark",
      copied: "Copied to clipboard",
      copyFailed: "Copy the command manually"
    },
    "zh-CN": {
      auto: "自动",
      light: "浅色",
      dark: "深色",
      copied: "已复制到剪贴板",
      copyFailed: "请手动复制命令"
    }
  };

  function labels() {
    return themeLabels[pageLang] || themeLabels.en;
  }

  function applyTheme(theme) {
    if (theme === "auto") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
    if (themeButton) {
      themeButton.textContent = labels()[theme];
    }
  }

  function currentTheme() {
    return localStorage.getItem(themeKey) || "auto";
  }

  function setTheme(theme) {
    localStorage.setItem(themeKey, theme);
    applyTheme(theme);
  }

  function showToast(text) {
    if (!toast) {
      return;
    }
    toast.textContent = text;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 1800);
  }

  applyTheme(currentTheme());

  if (themeButton) {
    themeButton.addEventListener("click", function () {
      var current = currentTheme();
      var next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
      setTheme(next);
    });
  }

  document.querySelectorAll("[data-lang-link]").forEach(function (link) {
    link.addEventListener("click", function () {
      localStorage.setItem(langKey, link.getAttribute("data-lang-link"));
    });
  });

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () {
      var text = button.getAttribute("data-copy") || "";
      navigator.clipboard.writeText(text).then(
        function () {
          showToast(labels().copied);
        },
        function () {
          showToast(labels().copyFailed);
        }
      );
    });
  });
})();
