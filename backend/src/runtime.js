const fs = require("fs");
const path = require("path");
const { DATA_DIR, DB_PATH, SQLITE_READONLY } = require("./config");
const { hasApplicationSchema, listExistingSqliteFiles, openDatabase, resolveRuntimeDbPath } = require("./db");
const { isImportableDatabaseFile } = require("./db-transfer");
const { ensureOwnerMetricsCompatibility, ensureRegionMetricsCompatibility } = require("./seed");
const { createApp } = require("./app");

const runtimeState = {
  app: null,
  db: null,
  runtimeDbPath: null,
};

function findLatestSqliteFile(filePaths) {
  return filePaths
    .map((filePath) => ({
      filePath,
      modifiedAt: fs.statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.filePath;
}

function listTransferFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImportableDatabaseFile(entry.name))
    .map((entry) => path.resolve(directoryPath, entry.name));
}

function validateDatabaseSchema(db, runtimeDbPath) {
  const runtimeDbExisted = fs.existsSync(runtimeDbPath);
  const hasSchema = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'regions'")
    .get();

  if (hasSchema) {
    return;
  }

  const siblingDatabases = listExistingSqliteFiles(DATA_DIR).filter(
    (filePath) => path.resolve(filePath) !== path.resolve(runtimeDbPath)
  );
  const usableSiblingDatabases = siblingDatabases.filter(hasApplicationSchema);
  const exportDir = path.join(DATA_DIR, "exports");
  const exportCandidates = listTransferFiles(exportDir);
  const latestExport = findLatestSqliteFile(exportCandidates);

  const diagnostics = [];
  diagnostics.push(`Audit dashboard schema was not found at ${runtimeDbPath}.`);

  if (!runtimeDbExisted && path.resolve(runtimeDbPath) === path.resolve(DB_PATH)) {
    diagnostics.push(
      `Startup created an empty SQLite file at ${runtimeDbPath} because the configured DB was missing.`
    );
  }

  if (usableSiblingDatabases.length) {
    diagnostics.push(`Found other SQLite files with the expected schema in ${DATA_DIR}:`);
    usableSiblingDatabases.forEach((filePath) => diagnostics.push(`- ${filePath}`));
    diagnostics.push(`Rename the desired file to ${path.basename(DB_PATH)} or set SQLITE_PATH to point to it.`);
  }

  if (latestExport) {
    diagnostics.push(`Database dump files inside ${exportDir} are not loaded automatically.`);
    diagnostics.push(`Import the latest export with: npm.cmd run db:import -- --in \"${latestExport}\"`);
  }

  diagnostics.push(`Run \"npm.cmd run db:reset\" inside backend/ if you want to rebuild the database from seed data.`);

  throw new Error(diagnostics.join("\n"));
}

function initializeRuntime() {
  if (runtimeState.app && runtimeState.db) {
    return runtimeState;
  }

  const runtimeDbPath = resolveRuntimeDbPath();
  const db = openDatabase();

  try {
    validateDatabaseSchema(db, runtimeDbPath);

    if (!SQLITE_READONLY) {
      if (ensureRegionMetricsCompatibility(db)) {
        console.log("Region metrics schema was outdated. Rebuilt owner-scoped aggregates.");
      }

      if (ensureOwnerMetricsCompatibility(db)) {
        console.log("Owner metrics table was missing or outdated. Rebuilt national owner aggregates.");
      }

      db.exec("CREATE INDEX IF NOT EXISTS idx_packages_owner_lookup ON packages(owner_type, owner_name);");
    }

    runtimeState.app = createApp(db);
    runtimeState.db = db;
    runtimeState.runtimeDbPath = runtimeDbPath;

    return runtimeState;
  } catch (error) {
    db.close();
    throw error;
  }
}

function getRuntimeApp() {
  return initializeRuntime().app;
}

function closeRuntime() {
  if (runtimeState.db) {
    runtimeState.db.close();
  }

  runtimeState.app = null;
  runtimeState.db = null;
  runtimeState.runtimeDbPath = null;
}

module.exports = {
  closeRuntime,
  getRuntimeApp,
  initializeRuntime,
};
