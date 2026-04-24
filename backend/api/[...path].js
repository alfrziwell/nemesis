const { getRuntimeApp } = require("../src/runtime");

module.exports = (req, res) => {
  try {
    const app = getRuntimeApp();
    return app(req, res);
  } catch (error) {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const corsOrigin = process.env.CORS_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.status(500).json({
      error: "Backend initialization failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
