/**
 * Lightweight HTTP test helper for Express apps using native fetch.
 */

import { createServer } from "http";

export async function createTestClient(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, path, { headers = {}, body } = {}) {
    const reqHeaders = { ...headers };
    let payload;
    if (body !== undefined) {
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: payload,
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    return {
      status: res.status,
      headers: res.headers,
      body: data,
    };
  }

  return {
    get: (path, opts) => request("GET", path, opts),
    post: (path, opts) => request("POST", path, opts),
    patch: (path, opts) => request("PATCH", path, opts),
    delete: (path, opts) => request("DELETE", path, opts),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
