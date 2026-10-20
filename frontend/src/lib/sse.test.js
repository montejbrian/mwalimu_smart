/**
 * MwalimuSmart — frontend/src/lib/sse.test.js
 * Unit tests for SSE parser and chunk boundary split handling (P3.1).
 */

import { describe, it, expect } from "vitest";
import { createSSEParser } from "./sse.js";

describe("P3.1 — SSE Parser (frontend/src/lib/sse.js)", () => {
  it("parses single complete SSE events with JSON data", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    parser.feed('event: token\ndata: {"token":"Habari"}\n\n');

    expect(events.length).toBe(1);
    expect(events[0].event).toBe("token");
    expect(events[0].data).toEqual({ token: "Habari" });
  });

  it("handles chunk boundary splits across data content", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    // Chunk 1 has partial data line
    parser.feed('event: token\ndata: {"tok');
    expect(events.length).toBe(0);

    // Chunk 2 completes the line and event boundary
    parser.feed('en":"mwanafunzi"}\n\n');
    expect(events.length).toBe(1);
    expect(events[0].event).toBe("token");
    expect(events[0].data).toEqual({ token: "mwanafunzi" });
  });

  it("handles chunk boundary splits across double newline delimiter", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    parser.feed('event: token\ndata: {"token":"Kenya"}\n');
    expect(events.length).toBe(0);

    parser.feed("\n");
    expect(events.length).toBe(1);
    expect(events[0].data).toEqual({ token: "Kenya" });
  });

  it("parses multiple events delivered in a single chunk", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    const chunk = [
      'event: token\ndata: {"token":"1"}\n\n',
      'event: token\ndata: {"token":"2"}\n\n',
      'event: done\ndata: {"message_id":"msg-123","full_content":"12"}\n\n',
    ].join("");

    parser.feed(chunk);

    expect(events.length).toBe(3);
    expect(events[0].event).toBe("token");
    expect(events[0].data).toEqual({ token: "1" });
    expect(events[1].event).toBe("token");
    expect(events[1].data).toEqual({ token: "2" });
    expect(events[2].event).toBe("done");
    expect(events[2].data).toEqual({ message_id: "msg-123", full_content: "12" });
  });

  it("ignores heartbeat comments starting with colon (e.g. : ping)", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    parser.feed(": ping\n\n");
    parser.feed(": heartbeat comment\n\n");
    expect(events.length).toBe(0);

    parser.feed('event: token\ndata: {"token":"active"}\n\n');
    expect(events.length).toBe(1);
    expect(events[0].data).toEqual({ token: "active" });
  });

  it("handles multiline data fields properly", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    parser.feed("event: message\ndata: Line 1\ndata: Line 2\n\n");
    expect(events.length).toBe(1);
    expect(events[0].event).toBe("message");
    expect(events[0].data).toBe("Line 1\nLine 2");
  });

  it("handles event: error payloads", () => {
    const events = [];
    const parser = createSSEParser((ev) => events.push(ev));

    parser.feed('event: error\ndata: {"message":"Rate limit exceeded"}\n\n');
    expect(events.length).toBe(1);
    expect(events[0].event).toBe("error");
    expect(events[0].data).toEqual({ message: "Rate limit exceeded" });
  });
});
