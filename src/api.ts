const API_BASE_URL =
    import.meta.env.VITE_API_URL || "http://localhost:4000";

const TOKEN_STORAGE_KEY = "callcenter_token";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

type ApiOptions = {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    skipAuth?: boolean;
};

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export async function api<T = unknown>(
    path: string,
    options: ApiOptions = {}
): Promise<T> {

    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };

    if (!options.skipAuth) {

        const token = getToken();

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body
            ? JSON.stringify(options.body)
            : undefined
    });

    let data: any = null;

    try {
        data = await response.json();
    } catch {
        // no JSON body — leave data as null
    }

    if (!response.ok) {

        if (response.status === 401) {
            clearToken();
        }

        throw new ApiError(
            data?.message || "Something went wrong.",
            response.status
        );

    }

    return data as T;

}
