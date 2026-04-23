const express = require("express");
const cors = require("cors");
const { CORS_ORIGIN } = require("./config");
const { openDatabase } = require("./db");
const { ensureOwnerMetricsCompatibility, ensureRegionMetricsCompatibility } = require("./seed");
const { getBootstrapPayload, getOwnerPackages, getRegionPackages, getProvincePackages } = require("./dashboard-repository");

function resolveCorsOrigin() {
  const rawValue = String(CORS_ORIGIN || "").trim();
  if (!rawValue || rawValue === "*") {
    return { allowAll: true, exactOrigins: [], wildcardOrigins: [] };
  }

  const origins = rawValue
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return {
    allowAll: false,
    exactOrigins: origins.filter((origin) => !origin.includes("*")),
    wildcardOrigins: origins
      .filter((origin) => origin.includes("*"))
      .map((origin) => origin.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")),
  };
}

function isAllowedOrigin(requestOrigin, corsConfig) {
  if (!requestOrigin) {
    return true;
  }

  if (corsConfig.allowAll) {
    return true;
  }

  const normalizedOrigin = requestOrigin.replace(/\/$/, "");
  if (corsConfig.exactOrigins.includes(normalizedOrigin)) {
    return true;
  }

  return corsConfig.wildcardOrigins.some((pattern) => new RegExp(`^${pattern}$`).test(normalizedOrigin));
}

function createApp(db) {
  const app = express();
  const corsConfig = resolveCorsOrigin();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin, corsConfig)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/bootstrap", (_req, res) => {
    res.json(getBootstrapPayload(db));
  });

  app.get("/api/regions/:regionKey/packages", (req, res) => {
    const payload = getRegionPackages(db, req.params.regionKey, req.query);

    if (!payload) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/provinces/:provinceKey/packages", (req, res) => {
    const payload = getProvincePackages(db, req.params.provinceKey, req.query);

    if (!payload) {
      res.status(404).json({ error: "Province not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/owners/packages", (req, res) => {
    const ownerType = (req.query.ownerType || "").trim();
    const ownerName = (req.query.ownerName || "").trim();

    if (!ownerType || !ownerName) {
      res.status(400).json({ error: "ownerType and ownerName are required" });
      return;
    }

    const payload = getOwnerPackages(db, req.query);

    if (!payload) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }

    res.json(payload);
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

let serverlessApp = null;

function assertDashboardSchema(db) {
  const hasRegions = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'regions'")
    .get();

  if (!hasRegions) {
    throw new Error("Audit dashboard schema was not found. Run db:reset or import a database.");
  }
}

function getServerlessApp() {
  if (serverlessApp) {
    return serverlessApp;
  }

  const db = openDatabase();
  assertDashboardSchema(db);

  if (ensureRegionMetricsCompatibility(db)) {
    console.log("Region metrics schema was outdated. Rebuilt owner-scoped aggregates.");
  }

  if (ensureOwnerMetricsCompatibility(db)) {
    console.log("Owner metrics table was missing or outdated. Rebuilt national owner aggregates.");
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_packages_owner_lookup ON packages(owner_type, owner_name);");
  serverlessApp = createApp(db);
  return serverlessApp;
}

function vercelHandler(req, res) {
  try {
    return getServerlessApp()(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(503).json({ error: "Database not ready", detail: error instanceof Error ? error.message : String(error) });
    }
  }
}

module.exports = {
  createApp,
  default: vercelHandler,
};
