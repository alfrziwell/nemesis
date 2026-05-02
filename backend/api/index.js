const { openDatabase } = require("../src/db");
const { createApp } = require("../src/app");

// Prefer read-only mode on serverless platforms (VERCEL env present)
const isServerless = !!process.env.VERCEL || process.env.READ_ONLY_DB === '1';
const db = openDatabase({ readOnly: isServerless });

module.exports = (req, res) => app(req, res);