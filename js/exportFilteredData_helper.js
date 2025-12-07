// ===== Export Filtered Data =====
function exportFilteredData() {
    if (!DataManager.hasData()) {
        UIRenderer.showToast('Không có dữ liệu để export.', 'warning');
        return;
    }

    UIRenderer.showToast('Đang export...', 'info');

    // Use ExportManager to export with filters applied
    // Delay slightly to allow toast to show
    setTimeout(() => {
        const result = ExportManager.exportCustom({
            useFilter: true,
            format: 'xlsx'
        });

        if (result.success) {
            UIRenderer.showToast(result.message, 'success');
        } else {
            UIRenderer.showToast(result.message, 'error');
        }
    }, 100);
}

// Attach to window
window.exportFilteredData = exportFilteredData;
