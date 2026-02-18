import { fetch, ResponseType } from "@tauri-apps/api/http";

/**
 * Fetch JSON from a URL using Tauri's HTTP client (bypasses CORS).
 */
export async function tauriFetchJson<T>(url: string): Promise<T> {
    const response = await fetch<T>(url, {
        method: "GET",
        responseType: ResponseType.JSON,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${url}`);
    }

    return response.data;
}

/**
 * Fetch text from a URL using Tauri's HTTP client (bypasses CORS).
 */
export async function tauriFetchText(url: string): Promise<string> {
    const response = await fetch<string>(url, {
        method: "GET",
        responseType: ResponseType.Text,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${url}`);
    }

    return response.data;
}
