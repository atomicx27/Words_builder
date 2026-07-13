import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.DATABASE_URL || 'file:dev.db';
console.log(`Connecting to database at: ${dbUrl}`);

export const db = createClient({
  url: dbUrl
});

export async function initDb() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema initialization script
    await db.executeMultiple(schemaSql);
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Helper: Query a single row
export async function get(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows.length > 0 ? result.rows[0] : null;
}

// Helper: Query all rows
export async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

// Helper: Run an insert, update, or delete query
export async function run(sql, args = []) {
  const result = await db.execute({ sql, args });
  return {
    changes: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid ? String(result.lastInsertRowid) : null
  };
}
