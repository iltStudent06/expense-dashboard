import mongoose from "mongoose";

export function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function buildMonthRange(month: string) {
  if (!isValidMonth(month)) {
    return null;
  }

  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { start, end };
}

export function parseObjectId(idValue: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(idValue)) {
    return { error: `${label} is invalid` } as const;
  }

  return { value: new mongoose.Types.ObjectId(idValue) } as const;
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
