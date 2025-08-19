export const uid = (len = 8) => Math.random().toString(36).slice(2, 2 + len);
