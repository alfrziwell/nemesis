const { PORT } = require("./config");
const { closeRuntime, initializeRuntime } = require("./runtime");

const { app, runtimeDbPath } = initializeRuntime();
const server = app.listen(PORT, () => {
  console.log(`Dashboard backend listening on http://127.0.0.1:${PORT}`);
  console.log(`SQLite database: ${runtimeDbPath}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    closeRuntime();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
