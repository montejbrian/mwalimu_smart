/**
 * MwalimuSmart — frontend/src/lib/sse.js
 * SSE parser and fetch-based streaming client (Phase 3).
 *
 * Designed to handle chunk boundary splits, multi-line events,
 * heartbeat comments, and error conditions cleanly.
 */

/**
 * Creates a stateful SSE stream parser.
 * Handles chunk boundary splits across arbitrary byte/character boundaries.
 */
export function createSSEParser(onMessage) {
  let buffer = "";

  function parseBlock(block) {
    const trimmed = block.trim();
    if (!trimmed) return;

    let event = "message";
    let id = null;
    const dataLines = [];

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        // Comment or heartbeat line (e.g. ": ping")
        continue;
      }
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      }
    }

    if (dataLines.length === 0 && event === "message") {
      return;
    }

    const rawData = dataLines.join("\n");
    let parsedData = rawData;
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      // Leave as string if not JSON
    }

    onMessage({ event, data: parsedData, id, raw: rawData });
  }

  return {
    feed(chunk) {
      if (!chunk) return;
      buffer += chunk;

      // SSE events are delimited by double newlines (\n\n or \r\n\r\n)
      const parts = buffer.split(/\r?\n\r?\n/);
      // The last element is whatever incomplete text remains
      buffer = parts.pop() || "";

      for (const part of parts) {
        parseBlock(part);
      }
    },

    reset() {
      buffer = "";
    },

    getBuffer() {
      return buffer;
    },
  };
}

/**
 * Fetch-based SSE streaming client for POST/GET endpoints.
 */
export async function streamSSE(
  url,
  { method = "POST", headers = {}, body, signal } = {},
  { onToken, onEvent, onVisualQueued, onVisualReady, onDone, onError } = {}
) {
  const controller = new AbortController();
  const activeSignal = signal || controller.signal;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...headers,
      },
      body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      signal: activeSignal,
    });

    if (!res.ok) {
      let errMsg = `SSE request failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson.error?.message || errMsg;
      } catch {
        // ignore json parse error
      }
      const err = new Error(errMsg);
      onError?.(err);
      throw err;
    }

    if (!res.body) {
      throw new Error("Response body is not readable");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const parser = createSSEParser(({ event, data }) => {
      onEvent?.(event, data);

      if (event === "token" && data?.token !== undefined) {
        onToken?.(data.token, data);
      } else if (event === "visual_queued") {
        onVisualQueued?.(data);
      } else if (event === "visual_ready") {
        onVisualReady?.(data);
      } else if (event === "done") {
        onDone?.(data);
      } else if (event === "error") {
        const err = new Error(data?.message || "Stream error");
        onError?.(err);
      }
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      parser.feed(text);
    }

    return { abort: () => controller.abort() };
  } catch (err) {
    if (err.name === "AbortError") {
      return { aborted: true };
    }
    onError?.(err);
    throw err;
  }
}
