import { cookies, headers } from "next/headers";
import { localeCookie, resolveAppLocale } from "./locale";

export async function getAppLocale() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  return resolveAppLocale(
    cookieStore.get(localeCookie)?.value,
    requestHeaders.get("accept-language"),
  );
}
