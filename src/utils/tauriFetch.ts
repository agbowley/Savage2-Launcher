import { Body, fetch, ResponseType } from "@tauri-apps/api/http";

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

/**
 * POST JSON and return parsed JSON response using Tauri's HTTP client.
 */
export async function tauriFetchPost<T>(
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
): Promise<T> {
    const response = await fetch<T>(url, {
        method: "POST",
        responseType: ResponseType.JSON,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: Body.json(body),
    });

    if (!response.ok) {
        const errorData = response.data as Record<string, unknown> | undefined;
        const err = new Error(`HTTP ${response.status}`) as Error & { status: number; data: unknown };
        err.status = response.status;
        err.data = errorData;
        throw err;
    }

    return response.data;
}

/**
 * POST JSON and return plain text response using Tauri's HTTP client.
 */
export async function tauriFetchPostText(
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
): Promise<string> {
    const response = await fetch<string>(url, {
        method: "POST",
        responseType: ResponseType.Text,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: Body.json(body),
    });

    if (!response.ok) {
        // Try to parse error body as JSON for structured errors
        let errorData: unknown;
        try {
            errorData = JSON.parse(response.data);
        } catch {
            errorData = response.data;
        }
        const err = new Error(`HTTP ${response.status}`) as Error & { status: number; data: unknown };
        err.status = response.status;
        err.data = errorData;
        throw err;
    }

    return response.data;
}

/**
 * GET JSON with Bearer auth header using Tauri's HTTP client.
 */
export async function tauriFetchAuthJson<T>(url: string, token: string): Promise<T> {
    const response = await fetch<T>(url, {
        method: "GET",
        responseType: ResponseType.JSON,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`) as Error & { status: number; data: unknown };
        err.status = response.status;
        err.data = response.data;
        throw err;
    }

    return response.data;
}
