/**
 * Export Manager - FW Tools
 * Handles exporting data to Excel/CSV
 */

const ExportManager = {
    /**
     * Export SMS batch to Excel
     */
    exportSmsBatch(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.BATCH_COL);
        const contentCol = DataManager.findColumn(config.CONTENT_COL);

        if (!batchCol) {
            return { success: false, message: 'Không tìm thấy cột batch SMS.' };
        }

        // Filter rows by batch
        const rows = data.filter(row => row[batchCol] === batchNumber);

        if (rows.length === 0) {
            return { success: false, message: `Không có dữ liệu cho batch ${batchNumber}.` };
        }

        // Get first column (usually phone) and content column
        const headers = DataManager.getHeaders();
        const firstCol = headers[0];

        // Build export data
        const exportData = [['Phone', 'SMS Content']];
        rows.forEach(row => {
            exportData.push([
                row[firstCol] || '',
                contentCol ? (row[contentCol] || '') : ''
            ]);
        });

        // Generate filename
        const fileInfo = DataManager.getFileInfo();
        const baseName = fileInfo.name ? fileInfo.name.replace(/\.[^.]+$/, '') : 'export';
        const filename = `${baseName} - Batch ${batchNumber} (SMS).xlsx`;

        // Export
        this.downloadExcel(exportData, filename);

        // Log action
        ConfigManager.addActionHistory({
            type: 'export_sms',
            batch: batchNumber,
            count: rows.length,
            icon: '📤'
        });

        ConfigManager.addExportHistory({
            type: 'SMS',
            batch: batchNumber,
            rows: rows.length,
            filename: filename
        });

        return { success: true, message: `Đã export ${rows.length} dòng cho SMS batch ${batchNumber}.`, filename };
    },

    /**
     * Export Email batch to Excel
     */
    exportEmailBatch(batchNumber) {
        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const batchCol = DataManager.findColumn(config.EMAIL_BATCH_COL);
        const emailCol = DataManager.findColumn(config.EMAIL_COL);
        const linkCol = DataManager.findColumn(config.EMAIL_LINK_COL);

        if (!batchCol) {
            return { success: false, message: 'Không tìm thấy cột batch Email.' };
        }

        // Filter rows by batch
        const rows = data.filter(row => row[batchCol] === batchNumber);

        if (rows.length === 0) {
            return { success: false, message: `Không có dữ liệu cho batch ${batchNumber}.` };
        }

        // Build export data
        const exportData = [['Email', 'SGUID Link']];
        rows.forEach(row => {
            exportData.push([
                emailCol ? (row[emailCol] || '') : '',
                linkCol ? (row[linkCol] || '') : ''
            ]);
        });

        // Generate filename
        const fileInfo = DataManager.getFileInfo();
        const baseName = fileInfo.name ? fileInfo.name.replace(/\.[^.]+$/, '') : 'export';
        const filename = `${baseName} - Batch ${batchNumber} (Email).xlsx`;

        // Export
        this.downloadExcel(exportData, filename);

        // Log action
        ConfigManager.addActionHistory({
            type: 'export_email',
            batch: batchNumber,
            count: rows.length,
            icon: '📤'
        });

        ConfigManager.addExportHistory({
            type: 'Email',
            batch: batchNumber,
            rows: rows.length,
            filename: filename
        });

        return { success: true, message: `Đã export ${rows.length} dòng cho Email batch ${batchNumber}.`, filename };
    },

    /**
     * Export custom selection
     */
    exportCustom(options = {}) {
        const { columns = null, useFilter = false, format = 'xlsx' } = options;

        let data;
        if (useFilter && FilterEngine.hasActiveFilters()) {
            const filtered = FilterEngine.apply(DataManager.getData());
            data = filtered.data;
        } else {
            data = DataManager.getData();
        }

        const headers = columns || DataManager.getHeaders();

        // Build export data
        const exportData = [headers];
        data.forEach(row => {
            const rowData = headers.map(col => {
                const column = DataManager.findColumn(col) || col;
                return row[column] !== undefined ? row[column] : '';
            });
            exportData.push(rowData);
        });

        // Generate filename
        const fileInfo = DataManager.getFileInfo();
        const baseName = fileInfo.name ? fileInfo.name.replace(/\.[^.]+$/, '') : 'export';
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `${baseName} - Custom Export ${timestamp}.${format}`;

        // Export based on format
        if (format === 'csv') {
            this.downloadCSV(exportData, filename);
        } else {
            this.downloadExcel(exportData, filename);
        }

        ConfigManager.addExportHistory({
            type: 'Custom',
            rows: data.length,
            filename: filename
        });

        return { success: true, message: `Đã export ${data.length} dòng.`, filename };
    },

    /**
     * Download as Excel file
     */
    downloadExcel(data, filename) {
        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Auto-size columns
        const colWidths = data[0].map((_, colIndex) => {
            const maxLen = Math.max(...data.map(row =>
                String(row[colIndex] || '').length
            ));
            return { wch: Math.min(Math.max(maxLen, 10), 50) };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Data');

        // Download
        XLSX.writeFile(wb, filename);
    },

    /**
     * Download as CSV file
     */
    downloadCSV(data, filename) {
        const csv = data.map(row =>
            row.map(cell => {
                const str = String(cell || '');
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    },

    /**
     * Get latest SMS batch number
     */
    getLatestSmsBatch() {
        const batches = DataManager.getSmsBatches();
        return batches.length > 0 ? Math.max(...batches) : null;
    },

    /**
     * Get latest Email batch number
     */
    getLatestEmailBatch() {
        const batches = DataManager.getEmailBatches();
        return batches.length > 0 ? Math.max(...batches) : null;
    }
};

if (typeof window !== 'undefined') {
    window.ExportManager = ExportManager;
}
