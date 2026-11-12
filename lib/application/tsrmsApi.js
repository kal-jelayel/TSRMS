export async function requestTsrms(path, { method = "GET", body, accountId } = {}) {
  const headers = {};
  if (accountId !== undefined) headers["X-TSRMS-Account"] = accountId;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(data?.error ?? "The server could not complete the request.");
    error.status = response.status;
    error.writeRejected = Boolean(data?.error && [400, 401, 409, 415].includes(response.status));
    throw error;
  }
  return response.json();
}
