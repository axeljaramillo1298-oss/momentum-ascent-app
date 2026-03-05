const wantPostgres = (process.env.DB_CLIENT || "postgres").toLowerCase() !== "sqlite";

let db;
if (wantPostgres && process.env.DATABASE_URL) {
  db = require("./db-postgres");
} else {
  if (wantPostgres) {
    console.warn("[backend] DATABASE_URL not found. Falling back to SQLite.");
  }
  db = require("./db-sqlite");
}

module.exports = db;
