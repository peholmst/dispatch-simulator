const apiHeaders = { "Content-Type": "application/json" };

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
