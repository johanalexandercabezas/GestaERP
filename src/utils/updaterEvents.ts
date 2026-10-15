export const CHECK_UPDATES_EVENT = "gestaerp:check-updates";

export function requestUpdateCheck() {
  window.dispatchEvent(new Event(CHECK_UPDATES_EVENT));
}
