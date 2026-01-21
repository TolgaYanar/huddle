const VERBOSE_LOGS =
  String(process.env.VERBOSE_LOGS || "").trim() === "1" ||
  String(process.env.VERBOSE_LOGS || "")
    .trim()
    .toLowerCase() === "true";

function vLog(...args) {
  if (!VERBOSE_LOGS) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

module.exports = {
  VERBOSE_LOGS,
  vLog,
};
