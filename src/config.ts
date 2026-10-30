/**
 * Public app settings. Anything in EXPO_PUBLIC_ is bundled into the app, so
 * the token here is a speed bump, not a secret. The OpenAI key is never here.
 */
export const speechConfig = {
  baseUrl: process.env.EXPO_PUBLIC_WAKEWISE_API_URL ?? '',
  token: process.env.EXPO_PUBLIC_WAKEWISE_API_TOKEN || undefined,
};
