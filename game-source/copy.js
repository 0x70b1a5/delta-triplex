"use strict";
// Catalogs contain plain text. Escape only at HTML insertion boundaries.
const TriCopy = (() => {
  function create(messages, locale = "en") {
    const plurals = new Intl.PluralRules(locale);
    function t(key, values = {}) {
      let message = messages[key];
      if (message === undefined) throw new Error(`Missing copy key: ${key}`);
      if (typeof message === "object") {
        if (!Number.isFinite(values.count)) throw new Error(`Copy key ${key} requires count`);
        message = message[plurals.select(values.count)] ?? message.other;
      }
      return message.replace(/\{(\w+)\}/g, (_, name) => {
        if (!Object.hasOwn(values, name)) throw new Error(`Copy key ${key} requires ${name}`);
        return String(values[name]);
      });
    }
    function html(key, values) {
      return t(key, values).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[char]).replace(/\n/g, "<br>");
    }
    return { t, html, locale, has: key => Object.hasOwn(messages, key) };
  }
  if (typeof module !== "undefined" && module.exports) return { create };
  const { messages, locale } = JSON.parse(document.getElementById("copy-catalog").textContent);
  return create(messages, locale);
})();
if (typeof module !== "undefined" && module.exports) module.exports = TriCopy;
