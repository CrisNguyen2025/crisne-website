const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errorJson = await res.json();
      errorDetail = errorJson.error || JSON.stringify(errorJson);
    } catch {
      const text = await res.text().catch(() => "");
      if (text) errorDetail = text;
    }
    throw Object.assign(new Error(errorDetail || `Request failed with status ${res.status}`), {
      status: res.status,
    });
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}
