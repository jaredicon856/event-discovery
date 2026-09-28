/** US Eastern Time. Uses America/New_York so clocks follow EST/EDT. */
export const ACCOUNT_TIMEZONE = "America/New_York";
export const ACCOUNT_TIMEZONE_LABEL = "Eastern Time (US)";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: ACCOUNT_TIMEZONE,
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

export function formatAccountDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", DATE_OPTIONS);
}

export function formatAccountDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", DATE_TIME_OPTIONS);
}
