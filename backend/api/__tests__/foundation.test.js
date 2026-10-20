import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { asyncHandler, errorHandler } from "../utils/asyncHandler.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { createTestClient } from "./helpers.js";

describe("P1.2 — API Foundation (config, requestContext, asyncHandler, errors, auth)", () => {
  let client;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);

    app.get(
      "/api/test/context",
      asyncHandler(async (req, res) => {
        res.json({ requestId: req.requestId, lang: req.lang });
      })
    );

    app.get(
      "/api/test/error-validation",
      asyncHandler(async () => {
        throw new AppError("validation", "Invalid query parameter");
      })
    );

    app.get(
      "/api/test/error-unexpected",
      asyncHandler(async () => {
        throw new Error("Unexpected database failure");
      })
    );

    app.get(
      "/api/test/protected",
      authMiddleware,
      asyncHandler(async (req, res) => {
        res.json({ auth: req.auth });
      })
    );

    app.get(
      "/api/test/teacher-only",
      authMiddleware,
      requireRole("teacher", "admin"),
      asyncHandler(async (_req, res) => {
        res.json({ ok: true });
      })
    );

    app.use(errorHandler);
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  it("exports a frozen config object", () => {
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.featureFlags)).toBe(true);
    expect(typeof config.postgresDsn).toBe("string");
  });

  it("echoes X-Request-Id when provided and generates one otherwise", async () => {
    const customRes = await client.get("/api/test/context", {
      headers: { "X-Request-Id": "req-custom-123" },
    });
    expect(customRes.status).toBe(200);
    expect(customRes.headers.get("x-request-id")).toBe("req-custom-123");
    expect(customRes.body.requestId).toBe("req-custom-123");

    const generatedRes = await client.get("/api/test/context");
    expect(generatedRes.status).toBe(200);
    expect(generatedRes.headers.get("x-request-id")).toBeTruthy();
    expect(generatedRes.body.requestId).toBe(generatedRes.headers.get("x-request-id"));
  });

  it("resolves Accept-Language into en (default) or sw", async () => {
    const defaultLang = await client.get("/api/test/context");
    expect(defaultLang.body.lang).toBe("en");

    const swHeader = await client.get("/api/test/context", {
      headers: { "Accept-Language": "sw-KE,sw;q=0.9" },
    });
    expect(swHeader.body.lang).toBe("sw");

    const swQuery = await client.get("/api/test/context?lang=sw");
    expect(swQuery.body.lang).toBe("sw");
  });

  it("formats AppError and unexpected errors using canonical error codes", async () => {
    const valRes = await client.get("/api/test/error-validation");
    expect(valRes.status).toBe(400);
    expect(valRes.body).toEqual({
      error: {
        code: "validation",
        message: "Invalid query parameter",
      },
    });

    const intRes = await client.get("/api/test/error-unexpected");
    expect(intRes.status).toBe(500);
    expect(intRes.body).toEqual({
      error: {
        code: "internal",
        message: "Internal server error",
      },
    });
  });

  it("enforces authMiddleware with canonical auth.missing / auth.invalid / auth.expired codes", async () => {
    const missing = await client.get("/api/test/protected");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("auth.missing");

    const invalid = await client.get("/api/test/protected", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("auth.invalid");

    const expiredToken = jwt.sign(
      { student_id: "st-1", school_id: "sc-1", role: "student" },
      config.authSecret,
      { expiresIn: -10 }
    );
    const expired = await client.get("/api/test/protected", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("auth.expired");
  });

  it("enforces requireRole with canonical auth.forbidden 403", async () => {
    const studentToken = jwt.sign(
      { student_id: "st-1", school_id: "sc-1", role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );
    const forbidden = await client.get("/api/test/teacher-only", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("auth.forbidden");

    const teacherToken = jwt.sign(
      { teacher_id: "tc-1", school_id: "sc-1", role: "teacher" },
      config.authSecret,
      { expiresIn: "1h" }
    );
    const allowed = await client.get("/api/test/teacher-only", {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ ok: true });
  });
});
