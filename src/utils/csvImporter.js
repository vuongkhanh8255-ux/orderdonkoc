/**
 * High-Performance CSV Parser for TikTok Performance Data
 * Handles 1M+ rows with chunking and progress tracking
 */

/**
 * Parse CSV in chunks to avoid memory issues
 * @param {string} csvText - Raw CSV text
 * @param {number} headerRow - Row index where headers are found
 * @param {object} columnMap - Column indexes { id, gmv, views, orders, airDate }
 * @param {number} chunkSize - Rows per chunk (default: 10000)
 * @returns {Array<Array<object>>} Array of chunks
 */
export function parseCSVInChunks(csvText, headerRow, columnMap, chunkSize = 10000) {
    const rows = csvText.split('\n').map(row => {
        // Handle quoted fields with commas
        const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        return matches.map(m => m.replace(/^"|"$/g, '').trim());
    });

    const chunks = [];
    let currentChunk = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[columnMap.id]) continue;

        const parsed = parseRow(row, columnMap);
        if (parsed) {
            currentChunk.push(parsed);

            if (currentChunk.length >= chunkSize) {
                chunks.push([...currentChunk]);
                currentChunk = [];
            }
        }
    }

    // Push remaining rows
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

/**
 * Parse a single row into database format
 */
function parseRow(row, columnMap) {
    try {
        // Normalize video ID to string, remove quotes
        const videoID = String(row[columnMap.id] || '')
            .replace(/'/g, '')
            .replace(/"/g, '')
            .trim();

        if (!videoID || videoID.length < 10) return null; // Invalid ID

        return {
            video_id: videoID,
            gmv: parseVNNumber(row[columnMap.gmv]),
            views: parseInt(row[columnMap.views]) || 0,
            orders: parseInt(row[columnMap.orders]) || 0,
            air_date: parseAirDate(row[columnMap.airDate]),
            creator_name: row[columnMap.creatorName] || null,
            creator_id: row[columnMap.creatorId] || null
        };
    } catch (err) {
        console.warn('Failed to parse row:', err.message);
        return null;
    }
}

/**
 * Parse Vietnamese number format (104.955.915 -> 104955915)
 */
function parseVNNumber(value) {
    if (!value) return 0;

    let str = String(value).trim();

    // Handle VN format with dots for thousands
    if ((str.match(/\./g) || []).length > 1) {
        str = str.replace(/\./g, '');
    }
    // Handle format like "100.000" (single dot, 3 digits after)
    else if (/\.\d{3}$/.test(str) && !str.includes(',')) {
        str = str.replace(/\./g, '');
    }
    // Handle US format with commas
    else {
        str = str.replace(/,/g, '');
    }

    return parseFloat(str) || 0;
}

/**
 * Parse air date from various formats
 */
function parseAirDate(value) {
    if (!value) return null;

    try {
        const date = new Date(value);
        // Check for invalid dates (like 1970/01/01)
        if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
            return null;
        }
        return date.toISOString();
    } catch {
        return null;
    }
}

/**
 * Batch upsert data to Supabase with progress tracking
 * @param {Array<object>} chunks - Array of data chunks
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @param {function} onProgress - Callback (imported, total)
 * @returns {Promise<{success: boolean, imported: number, errors: number}>}
 */
export async function batchUpsertToDatabase(supabase, chunks, month, year, onProgress) {
    const BATCH_SIZE = 5000;
    let totalImported = 0;
    let totalErrors = 0;

    // Flatten chunks and add month/year
    const allRows = chunks.flat().map(row => ({
        ...row,
        month,
        year
    }));

    const totalRows = allRows.length;

    // Process in batches of 5000
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        const batch = allRows.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
            .from('tiktok_performance')
            .upsert(batch, {
                onConflict: 'video_id,month,year',
                ignoreDuplicates: false // Update if exists
            });

        if (error) {
            console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
            totalErrors += batch.length;
        } else {
            totalImported += batch.length;
        }

        // Report progress
        if (onProgress) {
            onProgress(totalImported + totalErrors, totalRows);
        }
    }

    return {
        success: totalErrors === 0,
        imported: totalImported,
        errors: totalErrors,
        total: totalRows
    };
}
