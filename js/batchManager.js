/**
 * Batch Manager - FW Tools
 * Handles batch marking for SMS and Email
 */

const BatchManager = {
    /**
     * Mark SMS batch
     * @param {number} limit - Number of rows to mark
     * @param {Array} filteredIndices - Indices of visible rows (after filter)
     */
    markSmsBatch(limit, filteredIndices = null) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const headers = DataManager.getHeaders();

        if (data.length === 0) {
            return { success: false, message: 'Không có dữ liệu để xử lý.' };
        }

        // Find column names
        const sourceCol = DataManager.findColumn(config.SOURCE_COL);
        const contentCol = DataManager.findColumn(config.CONTENT_COL);
        const batchCol = DataManager.findColumn(config.BATCH_COL);

        // Ensure columns exist
        if (!contentCol) DataManager.ensureColumn(headers[ConfigManager.colToIndex(config.CONTENT_COL)] || 'SMS_Content');
        if (!batchCol) DataManager.ensureColumn(headers[ConfigManager.colToIndex(config.BATCH_COL)] || 'SMS_Batch');

        const actualContentCol = DataManager.findColumn(config.CONTENT_COL) || 'SMS_Content';
        const actualBatchCol = DataManager.findColumn(config.BATCH_COL) || 'SMS_Batch';

        // Get next batch number
        const newBatch = DataManager.getNextSmsBatch();
        const template = config.TEMPLATE_TEXT || '';
        const overwrite = config.OVERWRITE_BATCH;

        // Determine which rows to process
        const indicesToProcess = filteredIndices || data.map((_, i) => i);

        // Save undo state
        DataManager.saveUndoState();

        let picked = 0;
        const updates = [];

        for (const idx of indicesToProcess) {
            if (picked >= limit) break;

            const row = data[idx];
            const hasBatch = row[actualBatchCol] !== '' && row[actualBatchCol] !== null && row[actualBatchCol] !== undefined;

            if (overwrite || !hasBatch) {
                // Generate content
                const sourceValue = sourceCol ? (row[sourceCol] || '') : '';
                const content = template + sourceValue;

                row[actualContentCol] = content;
                row[actualBatchCol] = newBatch;
                picked++;
            }
        }

        // Update batch tracking
        if (picked > 0) {
            DataManager.smsBatches.add(newBatch);
        }

        // Log action
        ConfigManager.addActionHistory({
            type: 'mark_sms',
            batch: newBatch,
            count: picked,
            icon: '📱'
        });

        return {
            success: true,
            picked: picked,
            newBatch: newBatch,
            message: `Đã gán SMS batch ${newBatch} cho ${picked} dòng.`
        };
    },

    /**
     * Mark Email batch
     * @param {number} limit - Number of rows to mark
     * @param {Array} filteredIndices - Indices of visible rows (after filter)
     */
    markEmailBatch(limit, filteredIndices = null) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const headers = DataManager.getHeaders();

        if (data.length === 0) {
            return { success: false, message: 'Không có dữ liệu để xử lý.' };
        }

        // Find column
        const emailBatchCol = DataManager.findColumn(config.EMAIL_BATCH_COL);

        // Ensure column exists
        if (!emailBatchCol) DataManager.ensureColumn(headers[ConfigManager.colToIndex(config.EMAIL_BATCH_COL)] || 'Email_Batch');

        const actualBatchCol = DataManager.findColumn(config.EMAIL_BATCH_COL) || 'Email_Batch';

        // Get next batch number
        const newBatch = DataManager.getNextEmailBatch();
        const overwrite = config.OVERWRITE_BATCH;

        // Determine which rows to process
        const indicesToProcess = filteredIndices || data.map((_, i) => i);

        // Save undo state
        DataManager.saveUndoState();

        let picked = 0;

        for (const idx of indicesToProcess) {
            if (picked >= limit) break;

            const row = data[idx];
            const hasBatch = row[actualBatchCol] !== '' && row[actualBatchCol] !== null && row[actualBatchCol] !== undefined;

            if (overwrite || !hasBatch) {
                row[actualBatchCol] = newBatch;
                picked++;
            }
        }

        // Update batch tracking
        if (picked > 0) {
            DataManager.emailBatches.add(newBatch);
        }

        // Log action
        ConfigManager.addActionHistory({
            type: 'mark_email',
            batch: newBatch,
            count: picked,
            icon: '📧'
        });

        return {
            success: true,
            picked: picked,
            newBatch: newBatch,
            message: `Đã gán Email batch ${newBatch} cho ${picked} dòng.`
        };
    },

    /**
     * Get rows for a specific SMS batch
     */
    getSmsBatchRows(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.BATCH_COL);

        if (!batchCol) return [];

        return data.filter(row => row[batchCol] === batchNumber);
    },

    /**
     * Get rows for a specific Email batch
     */
    getEmailBatchRows(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.EMAIL_BATCH_COL);

        if (!batchCol) return [];

        return data.filter(row => row[batchCol] === batchNumber);
    }
};

if (typeof window !== 'undefined') {
    window.BatchManager = BatchManager;
}
