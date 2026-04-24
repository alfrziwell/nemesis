const { openDatabase } = require("../src/db");
const { createApp } = require("../src/app");

const db = openDatabase();
const app = createApp(db);

module.exports = app;