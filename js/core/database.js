// js/core/database.js
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db;
let conn;

export async function initDatabase() {
    console.log("Initializing Wasm Database...");
    
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    conn = await db.connect();
    console.log("Database Ready. Wasm Engine Online.");
    return conn;
}

export async function runQuery(sql) {
    if (!conn) throw new Error("Database connection not initialized.");
    const result = await conn.query(sql);
    return result.toArray().map(row => row.toJSON());
}

export async function registerFile(file) {
    const tableName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    
    // Convert file to Uint8Array for DuckDB
    const buffer = await file.arrayBuffer();
    await db.registerFileBuffer(file.name, new Uint8Array(buffer));

    // Create table from file
    if (file.name.endsWith('.csv')) {
        await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`);
    } else {
        await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${file.name}')`);
    }
    
    return tableName;
}

/**
 * Fetches a CSV file from a URL and registers it in DuckDB.
 */
export async function registerFromURL(url, tableName) {
    try {
        // 1. Fetch the data via the browser
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        // 2. Convert to ArrayBuffer for Wasm
        const buffer = await response.arrayBuffer();
        
        // 3. Register it in DuckDB's virtual filesystem
        const fileName = `${tableName}.csv`; 
        await db.registerFileBuffer(fileName, new Uint8Array(buffer));

        // 4. Create the table in the Vault
        await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${fileName}')`);
        
        return tableName;
    } catch (err) {
        console.error("URL Ingestion Error:", err);
        throw err;
    }
}

export async function getTableSchema(tableName) {
    if (!conn) return "";
    const result = await conn.query(`PRAGMA table_info('${tableName}')`);
    const rows = result.toArray().map(row => row.toJSON());
    
    // Format: "column_name (type), column_name (type)"
    return rows.map(r => `${r.name} (${r.type})`).join(", ");
}

/**
 * Generates a technical summary of the table for the AI
 */
export async function getTableStats(tableName) {
    const totalRowsRes = await runQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const totalRows = Number(totalRowsRes[0].count);

    const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
    let facts = [];

    for (const col of schema) {
        const isNumeric = ['DOUBLE', 'INTEGER', 'BIGINT', 'FLOAT'].includes(col.type);
        
        if (isNumeric) {
            const stats = await runQuery(`SELECT MIN("${col.name}") as min, MAX("${col.name}") as max, AVG("${col.name}") as avg FROM "${tableName}"`);
            facts.push(`Column "${col.name}" (Numeric): Range [${stats[0].min} to ${stats[0].max}], Average: ${Number(stats[0].avg).toFixed(2)}`);
        } else {
            const stats = await runQuery(`SELECT COUNT(DISTINCT "${col.name}") as unique_count FROM "${tableName}"`);
            facts.push(`Column "${col.name}" (Text): ${Number(stats[0].unique_count)} unique values`);
        }
    }

    return { totalRows, facts: facts.join("\n") };
}

export async function getDeepTableProfile(tableName) {
    const totalRowsRes = await runQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const totalRows = Number(totalRowsRes[0].count);

    const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
    let profile = { totalRows, columns: [] };

    for (const col of schema) {
        const name = col.name;
        const type = col.type;

        // 1. Calculate Null Rate
        const nullRes = await runQuery(`SELECT COUNT(*) as count FROM "${tableName}" WHERE "${name}" IS NULL`);
        const nullCount = Number(nullRes[0].count);
        const sparsity = ((nullCount / totalRows) * 100).toFixed(1);

        let details = "";
        if (['DOUBLE', 'INTEGER', 'BIGINT', 'FLOAT'].includes(type)) {
            const stats = await runQuery(`SELECT MIN("${name}") as min, MAX("${name}") as max, AVG("${name}") as avg FROM "${tableName}"`);
            details = `Range: [${stats[0].min} to ${stats[0].max}], Avg: ${Number(stats[0].avg).toFixed(2)}`;
        } else {
            const freq = await runQuery(`SELECT "${name}" as val, COUNT(*) as count FROM "${tableName}" GROUP BY 1 ORDER BY 2 DESC LIMIT 3`);
            details = `Top Values: ${freq.map(f => `${f.val} (${f.count})`).join(", ")}`;
        }

        profile.columns.push(`- ${name} (${type}): ${sparsity}% empty. ${details}`);
    }

    return profile;
}
