// js/modules/banner-parser.js

/**
 * UNIVERSAL CROSSTAB & BANNER PARSER
 * Zero-hardcoded, fully pattern-driven engine for any Market Research horizontal split dataset.
 */
export async function parseBannerTable(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(line => parseCSVLine(line));

    // Extract Study ID dynamically from the first non-empty cell of the first line
    const firstLine = lines.find(l => l.length > 0 && l[0] !== "");
    const studyId = firstLine && firstLine[0] ? firstLine[0].split(':')[0].trim().replace(/[^a-zA-Z0-9_]/g, '_') : "MR_Study";

    let parentBanners = []; // Maps index -> "LSM 2-5 - TOTAL", etc.
    let columnHeaders = [];  // Maps index -> "South", "Mumbai", etc.
    let columnBases = [];    // Maps index -> 425, 268, etc.
    
    let currentQuestionCode = "GEN_INFO";
    let currentQuestionText = "General Information";
    let currentParent = "TOTAL";
    
    let flatData = [];
    let insideSegmentDefinitions = false;

    for (let i = 0; i < lines.length; i++) {
        const cells = lines[i];
        if (!cells || cells.length === 0) continue;

        const cleanCells = cells.map(c => c.trim());
        const firstActiveCellIdx = cleanCells.findIndex(c => c !== "");
        if (firstActiveCellIdx === -1) continue; // Skip blank lines
        
        const firstActiveValue = cleanCells[firstActiveCellIdx];

        // 1. EXTRACT SEGMENT DEFINITIONS (If metadata block is present at top)
        if (firstActiveValue === "Segment Definitions" || firstActiveValue === "Bases Definitions") {
            insideSegmentDefinitions = true;
            continue;
        }

        if (insideSegmentDefinitions) {
            if (firstActiveValue === "" || firstActiveValue === "Report Settings") {
                insideSegmentDefinitions = false;
            } else {
                const baseCellIdx = cleanCells.findIndex(c => /[Nn]\s*=\s*\d+/i.test(c));
                if (baseCellIdx !== -1) {
                    const segmentName = cleanCells[baseCellIdx - 1] || firstActiveValue;
                    const baseMatch = cleanCells[baseCellIdx].match(/[Nn]\s*=\s*(\d+)/i);
                    if (baseMatch) {
                        segmentBases[segmentName] = parseInt(baseMatch[1]);
                    }
                }
                continue;
            }
        }

        // 2. DETECT SUPER-HEADERS (Parent Banners)
        // Detects rows containing uppercase group labels like "AGE - TOTAL" or "LSM 2-5 - TOTAL"
        const isSuperHeaderRow = cleanCells.some(c => c.includes('TOTAL') && !c.includes('N=') && !c.includes('%'));
        if (isSuperHeaderRow) {
            for (let colIdx = 0; colIdx < cleanCells.length; colIdx++) {
                if (cleanCells[colIdx] !== "") {
                    currentParent = cleanCells[colIdx];
                }
                parentBanners[colIdx] = currentParent;
            }
            continue;
        }

        // 3. DETECT BASE SIZES ROW (The "N=" Row)
        // This is the absolute anchor of any crosstab. We check if multiple columns contain N= numbers.
        const isBasesRow = cleanCells.filter(c => /[Nn]\s*=\s*\d+/i.test(c)).length > 3;
        
        if (isBasesRow) {
            // A. Store the base sizes
            for (let colIdx = 0; colIdx < cleanCells.length; colIdx++) {
                const baseMatch = cleanCells[colIdx].match(/[Nn]\s*=\s*(\d+)/i);
                if (baseMatch) {
                    columnBases[colIdx] = parseInt(baseMatch[1]);
                }
            }

            // B. 🚀 UNIVERSAL HEURISTIC: The row directly above the N= row is ALWAYS the Sub-headers row!
            if (i > 0) {
                const previousRow = lines[i - 1].map(c => c.trim());
                for (let colIdx = 0; colIdx < previousRow.length; colIdx++) {
                    columnHeaders[colIdx] = previousRow[colIdx];
                    parentBanners[colIdx] = parentBanners[colIdx] || "TOTAL";
                }
            }
            continue;
        }

        // 4. DETECT QUESTION BLOCKS (e.g. "Q1: Brands", "CSEX - Gender", "SbjNum")
        const isQuestionBlock = firstActiveValue.includes(':') || firstActiveValue.includes(' - ');
        if (isQuestionBlock && !firstActiveValue.startsWith('http') && !firstActiveValue.startsWith('$$')) {
            const separator = firstActiveValue.includes(':') ? ':' : ' - ';
            const parts = firstActiveValue.split(separator);
            currentQuestionCode = parts[0].trim().replace(/[^a-zA-Z0-9_]/g, '');
            currentQuestionText = parts[1] ? parts[1].trim() : parts[0].trim();
            continue;
        }

        // 5. PARSE DATA ROWS
        const hasValues = cleanCells.some((c, idx) => {
            if (idx === firstActiveCellIdx) return false;
            return c !== "" && (c.includes('%') || !isNaN(parseFloat(c)));
        });

        // Skip metadata lines and titles
        if (firstActiveValue === studyId || firstActiveValue.includes("Required for") || firstActiveValue === "Report Settings") {
            continue;
        }

        if (currentQuestionCode && hasValues && columnHeaders.length > 0 && columnBases.length > 0) {
            // Handle both Tally nested $$ format AND standard clean formats (e.g. "MALE" or "FEMALE")
            const labelParts = firstActiveValue.split('$$');
            const cleanLabel = labelParts[labelParts.length - 1].trim();

            // Loop through each valid segment column
            for (let colIdx = firstActiveCellIdx + 1; colIdx < cleanCells.length; colIdx++) {
                const subSegment = columnHeaders[colIdx];
                const parentSegment = parentBanners[colIdx] || "TOTAL";
                const baseN = columnBases[colIdx] || 0;

                if (!subSegment || baseN === 0) continue;

                const rawVal = cleanCells[colIdx];
                let percentage = 0;
                let calculatedCount = 0;

                if (rawVal.endsWith('%')) {
                    percentage = parseFloat(rawVal.replace('%', '')) / 100;
                    calculatedCount = Math.round(percentage * baseN);
                } else if (!isNaN(parseFloat(rawVal))) {
                    percentage = parseFloat(rawVal);
                    calculatedCount = parseFloat(rawVal); // Means/Medians don't scale by base_n
                } else {
                    continue; // Skip empty cells
                }

                flatData.push({
                    "study_id": studyId,
                    "question_code": currentQuestionCode,
                    "question_text": currentQuestionText,
                    "parent_segment": parentSegment,
                    "sub_segment": subSegment,
                    "base_n": baseN,
                    "metric_label": cleanLabel,
                    "percentage": percentage,
                    "calculated_count": calculatedCount
                });
            }
        }
    }

    console.log(`[Universal Parser] Successfully converted ${flatData.length} records under study ID: ${studyId}.`);
    return flatData;
}

/**
 * Helper: Parse CSV lines, handling commas inside quotes correctly
 */
function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}
