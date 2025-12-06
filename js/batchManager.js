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
    },
    /**
     * Mark Remind SMS batch
     */
    markRemindSmsBatch(limit, filteredIndices = null) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const headers = DataManager.getHeaders();
        const batchColName = config.REMIND_SMS_BATCH_COL;

        if (data.length === 0) return { success: false, message: 'No data.' };

        // Ensure column exists
        if (!DataManager.findColumn(batchColName)) {
            DataManager.ensureColumn(headers[ConfigManager.colToIndex(batchColName)] || 'Remind_SMS_Batch');
        }
        const actualBatchCol = DataManager.findColumn(batchColName) || 'Remind_SMS_Batch';

        // Get next batch number (shared with SMS or separate? Using separate logic for simplicity, or just incrementing)
        // For now, let's use the same logic as SMS but tracked separately if needed.
        // Actually, let's just use a simple robust approach: find max in column + 1
        let maxBatch = 0;
        data.forEach(row => {
            const val = parseInt(row[actualBatchCol]);
            if (!isNaN(val) && val > maxBatch) maxBatch = val;
        });
        const newBatch = maxBatch + 1;

        const indicesToProcess = filteredIndices || data.map((_, i) => i);
        DataManager.saveUndoState();

        let picked = 0;
        for (const idx of indicesToProcess) {
            if (picked >= limit) break;
            const row = data[idx];
            if (!row[actualBatchCol] && row[actualBatchCol] !== 0) {
                row[actualBatchCol] = newBatch;
                picked++;
            }
        }

        ConfigManager.addActionHistory({ type: 'mark_remind_sms', batch: newBatch, count: picked, icon: '📲' });
        return { success: true, picked, newBatch, message: `Marked Remind SMS batch ${newBatch} for ${picked} rows.` };
    },

    /**
     * Mark Remind Email batch
     */
    markRemindEmailBatch(limit, filteredIndices = null) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const headers = DataManager.getHeaders();
        const batchColName = config.REMIND_EMAIL_BATCH_COL;

        if (data.length === 0) return { success: false, message: 'No data.' };

        // Ensure column exists
        if (!DataManager.findColumn(batchColName)) {
            DataManager.ensureColumn(headers[ConfigManager.colToIndex(batchColName)] || 'Remind_Email_Batch');
        }
        const actualBatchCol = DataManager.findColumn(batchColName) || 'Remind_Email_Batch';

        let maxBatch = 0;
        data.forEach(row => {
            const val = parseInt(row[actualBatchCol]);
            if (!isNaN(val) && val > maxBatch) maxBatch = val;
        });
        const newBatch = maxBatch + 1;

        const indicesToProcess = filteredIndices || data.map((_, i) => i);
        DataManager.saveUndoState();

        let picked = 0;
        for (const idx of indicesToProcess) {
            if (picked >= limit) break;
            const row = data[idx];
            if (!row[actualBatchCol] && row[actualBatchCol] !== 0) {
                row[actualBatchCol] = newBatch;
                picked++;
            }
        }

        ConfigManager.addActionHistory({ type: 'mark_remind_email', batch: newBatch, count: picked, icon: '📧' });
        return { success: true, picked, newBatch, message: `Marked Remind Email batch ${newBatch} for ${picked} rows.` };
    },

    /**
     * Delete SMS batch - clear batch column for specified batch number
     */
    deleteSmsBatch(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.BATCH_COL);
        const contentCol = DataManager.findColumn(config.CONTENT_COL);

        if (!batchCol) {
            return { success: false, message: 'Không tìm thấy cột batch SMS.' };
        }

        DataManager.saveUndoState();

        let deleted = 0;
        data.forEach(row => {
            if (row[batchCol] === batchNumber) {
                row[batchCol] = '';
                if (contentCol) row[contentCol] = ''; // Also clear content
                deleted++;
            }
        });

        // Update batch tracking
        DataManager.smsBatches.delete(batchNumber);

        ConfigManager.addActionHistory({
            type: 'delete_batch',
            batch: batchNumber,
            count: deleted,
            icon: '🗑️'
        });

        return {
            success: true,
            deleted: deleted,
            message: `Đã xóa SMS batch ${batchNumber} (${deleted} dòng).`
        };
    },

    /**
     * Delete Email batch - clear batch column for specified batch number
     */
    deleteEmailBatch(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.EMAIL_BATCH_COL);

        if (!batchCol) {
            return { success: false, message: 'Không tìm thấy cột batch Email.' };
        }

        DataManager.saveUndoState();

        let deleted = 0;
        data.forEach(row => {
            if (row[batchCol] === batchNumber) {
                row[batchCol] = '';
                deleted++;
            }
        });

        // Update batch tracking
        DataManager.emailBatches.delete(batchNumber);

        ConfigManager.addActionHistory({
            type: 'delete_batch',
            batch: batchNumber,
            count: deleted,
            icon: '🗑️'
        });

        return {
            success: true,
            deleted: deleted,
            message: `Đã xóa Email batch ${batchNumber} (${deleted} dòng).`
        };
    }
};

if (typeof window !== 'undefined') {
    window.BatchManager = BatchManager;
}
