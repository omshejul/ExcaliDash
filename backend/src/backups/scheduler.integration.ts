import fs from "fs";
import os from "os";
import path from "path";
import { expect, it } from "vitest";
import { PrismaClient } from "../generated/client";
import { createSqliteBackup } from "./scheduler";

const Database = require("better-sqlite3");

it("backs up committed SQLite WAL data through the real Prisma client", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-backup-test-"));
  const databasePath = path.join(dir, "source.db");
  const source = new Database(databasePath);
  source.pragma("journal_mode = WAL");
  source.exec("CREATE TABLE drawings (content TEXT); INSERT INTO drawings VALUES ('saved drawing')");
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } });
  try {
    const backupPath = await createSqliteBackup({
      prisma,
      databaseUrl: `file:${databasePath}`,
      backupDir: path.join(dir, "backups"),
      retentionDays: 0,
    });
    expect(backupPath).not.toBeNull();
    const backup = new Database(backupPath!, { readonly: true });
    try {
      expect(backup.prepare("SELECT content FROM drawings").get()).toEqual({ content: "saved drawing" });
      expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      backup.close();
    }
    expect(fs.statSync(backupPath!).mode & 0o777).toBe(0o600);
  } finally {
    await prisma.$disconnect();
    source.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
