/**
 * Storage Manager - FW Tools
 * Handles saving/loading project data to/from server
 */

const StorageManager = {
    // API base URL - will be relative in production
    apiBase: '',

    // Current project state
    currentProject: null,
    isDirty: false,
    isSaving: false,

    // Auto-save settings
    autoSaveEnabled: true,
    autoSaveDelay: 5000, // 5 seconds
    autoSaveTimer: null,

    /**
     * Initialize Storage Manager
     */
    init() {
        // Detect if running on Vercel (has /api endpoints) or locally
        this.apiBase = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
            ? '' : '';

        console.log('StorageManager initialized');
        this.loadProjectList();

        // Auto-load last project if exists
        this.autoLoadLastProject();
    },

    /**
     * Auto-load the last used project on page refresh
     */
    async autoLoadLastProject() {
        const lastProject = localStorage.getItem('fw_tools_last_project');
        if (lastProject) {
            console.log(`[StorageManager] Auto-loading last project: ${lastProject}`);
            // Delay slightly to ensure UI is ready
            setTimeout(async () => {
                const result = await this.loadProject(lastProject);
                if (result.success) {
                    // Update the project dropdown selection
                    const projectSelect = document.getElementById('projectSelect');
                    if (projectSelect) {
                        projectSelect.value = lastProject;
                    }
                }
            }, 500);
        }
    },

    /**
     * Save last project name to localStorage
     */
    saveLastProject(projectName) {
        if (projectName) {
            localStorage.setItem('fw_tools_last_project', projectName);
        }
    },

    /**
     * Save current project to server
     */
    async saveProject(projectName = null) {
        const name = projectName || this.currentProject || 'untitled';

        if (!DataManager.hasData()) {
            UIRenderer.showToast('Không có dữ liệu để save.', 'warning');
            return { success: false, message: 'No data to save' };
        }

        this.isSaving = true;
        this.updateSaveIndicator('saving');

        try {
            const headers = DataManager.getHeaders();
            const data = DataManager.getData();
            console.log(`[StorageManager] Saving project "${name}" - ${data.length} rows, ${headers.length} columns`);

            // Build the project data object
            const projectData = {
                projectName: name,
                headers: headers,
                data: data,
                metadata: {
                    fileInfo: DataManager.getFileInfo(),
                    config: ConfigManager.getAll(),
                    savedAt: new Date().toISOString(),
                    rowCount: data.length,
                    columnCount: headers.length
                }
            };

            const jsonContent = JSON.stringify(projectData);
            const bodySize = jsonContent.length;
            console.log(`[StorageManager] Request body size: ${(bodySize / 1024 / 1024).toFixed(2)} MB`);

            let result;

            // Use streaming upload for files > 3MB to bypass Vercel's 4.5MB body limit
            if (bodySize > 3 * 1024 * 1024) {
                console.log(`[StorageManager] Using streaming upload for large file`);
                result = await this.streamingUpload(name, jsonContent);
            } else {
                // Use normal POST for small files
                const response = await fetch(`${this.apiBase}/api/projects/save`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: jsonContent
                });

                console.log(`[StorageManager] Response status: ${response.status}`);
                result = await response.json();
            }

            console.log(`[StorageManager] Response:`, result);

            if (result.success) {
                this.currentProject = name;
                this.isDirty = false;
                this.updateSaveIndicator('saved');

                // Save as last project for auto-load on refresh
                this.saveLastProject(name);

                // Sync with ProjectManager - create entry if not exists
                await this.syncProjectToManager(name, result.url);

                UIRenderer.showToast(`Đã lưu project "${name}"`, 'success');
                this.loadProjectList(); // Refresh project list
                return { success: true, message: result.message };
            } else {
                throw new Error(result.error || 'Save failed');
            }

        } catch (error) {
            console.error('[StorageManager] Save error:', error);
            this.updateSaveIndicator('error');

            UIRenderer.showToast(`Lỗi save server: ${error.message}`, 'error');
            return { success: false, message: error.message };
        } finally {
            this.isSaving = false;
        }
    },

    /**
     * Compressed upload for large files (uses gzip to reduce size)
     */
    async streamingUpload(projectName, jsonContent) {
        console.log(`[StorageManager] Compressing data...`);

        // Convert string to bytes
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(jsonContent);

        // Compress using gzip
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(inputBytes);
                controller.close();
            }
        });

        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const compressedResponse = await new Response(compressedStream);
        const compressedBlob = await compressedResponse.blob();

        console.log(`[StorageManager] Compressed: ${(inputBytes.length / 1024 / 1024).toFixed(2)} MB → ${(compressedBlob.size / 1024 / 1024).toFixed(2)} MB`);

        // Check if compressed size is still too large
        if (compressedBlob.size > 4 * 1024 * 1024) {
            throw new Error(`File quá lớn (${(compressedBlob.size / 1024 / 1024).toFixed(1)} MB sau khi nén). Giới hạn 4MB.`);
        }

        // Send compressed data
        const response = await fetch(`${this.apiBase}/api/projects/upload-compressed?filename=${encodeURIComponent(projectName)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/gzip',
                'X-Original-Size': inputBytes.length.toString()
            },
            body: compressedBlob
        });

        console.log(`[StorageManager] Compressed upload response status: ${response.status}`);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${text}`);
        }

        return await response.json();
    },

    /**
     * Sync saved project with ProjectManager
     */
    async syncProjectToManager(projectName, dataUrl) {
        if (typeof ProjectManager === 'undefined') return;

        // Check if project exists in ProjectManager
        const existingProjects = ProjectManager.getAllProjects();
        const existing = existingProjects.find(p => p.name === projectName);

        if (existing) {
            // Update with data URL
            await ProjectManager.updateProject(existing.id, { dataFileUrl: dataUrl });
        } else {
            // Create new ProjectManager entry for this data project
            await ProjectManager.createProject({
                name: projectName,
                surveyId: '',
                criteria: '',
                target: 0,
                notes: 'Auto-created from data save',
                dataFileUrl: dataUrl
            });
        }
    },

    /**
     * Load project from server
     */
    async loadProject(projectName) {
        if (!projectName) {
            UIRenderer.showToast('Vui lòng chọn project.', 'warning');
            return { success: false };
        }

        try {
            UIRenderer.showToast('Đang tải project...', 'info');

            const response = await fetch(`${this.apiBase}/api/projects/load?name=${encodeURIComponent(projectName)}`);
            const result = await response.json();

            if (result.success && result.project) {
                const { headers, data, metadata } = result.project;

                // Load data into DataManager
                DataManager.setData(headers, data, projectName);

                // Restore config if available
                if (metadata?.config) {
                    ConfigManager.updateConfig(metadata.config);
                }

                this.currentProject = projectName;
                this.isDirty = false;
                this.updateSaveIndicator('saved');

                // Update UI
                UIRenderer.updateFileInfo();
                UIRenderer.renderDataTable();
                UIRenderer.renderDashboard();

                UIRenderer.showToast(`Đã tải project "${projectName}" (${data.length} rows)`, 'success');
                return { success: true };
            } else {
                throw new Error(result.error || 'Load failed');
            }

        } catch (error) {
            console.error('Load error:', error);

            // Try loading from localStorage
            const localData = this.loadFromLocalStorage(projectName);
            if (localData) {
                UIRenderer.showToast('Đã tải từ local backup.', 'warning');
                return { success: true };
            }

            UIRenderer.showToast(`Lỗi tải project: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
    },

    /**
     * Get list of saved projects - merged from server AND ProjectManager
     */
    async loadProjectList() {
        const allProjects = new Map(); // Use Map to dedupe by name

        // 1. Get projects from ProjectManager first (priority)
        if (typeof ProjectManager !== 'undefined') {
            const pmProjects = ProjectManager.getAllProjects();
            pmProjects.forEach(p => {
                allProjects.set(p.name, {
                    name: p.name,
                    id: p.id,
                    hasMetadata: true,
                    surveyId: p.surveyId,
                    criteria: p.criteria
                });
            });
        }

        // 2. Get projects from server (data files) and merge
        try {
            const response = await fetch(`${this.apiBase}/api/projects/list`);
            const result = await response.json();

            if (result.success && result.projects) {
                result.projects.forEach(p => {
                    const name = p.name || p;
                    if (!allProjects.has(name)) {
                        allProjects.set(name, {
                            name: name,
                            url: p.url,
                            hasData: true,
                            hasMetadata: false
                        });
                    } else {
                        // Merge: project from PM now also has data
                        const existing = allProjects.get(name);
                        existing.hasData = true;
                        existing.url = p.url;
                    }
                });
            }
        } catch (error) {
            console.error('Server list error:', error);
        }

        // 3. Also check localStorage
        const localProjects = this.getLocalProjects();
        localProjects.forEach(p => {
            const name = p.name || p;
            if (!allProjects.has(name)) {
                allProjects.set(name, {
                    name: name,
                    hasData: true,
                    hasMetadata: false,
                    isLocal: true
                });
            }
        });

        const projects = Array.from(allProjects.values());
        this.renderProjectDropdown(projects);
        return projects;
    },

    /**
     * Delete a project
     */
    async deleteProject(projectName) {
        if (!confirm(`Xóa project "${projectName}"?`)) {
            return { success: false };
        }

        try {
            const response = await fetch(`${this.apiBase}/api/projects/delete?name=${encodeURIComponent(projectName)}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                UIRenderer.showToast(`Đã xóa project "${projectName}"`, 'success');
                this.loadProjectList();

                if (this.currentProject === projectName) {
                    this.currentProject = null;
                    DataManager.clear();
                    UIRenderer.renderDataTable();
                }

                return { success: true };
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Delete error:', error);
            UIRenderer.showToast(`Lỗi xóa project: ${error.message}`, 'error');
            return { success: false };
        }
    },

    /**
     * Mark data as changed (for auto-save)
     */
    markDirty() {
        this.isDirty = true;
        this.updateSaveIndicator('unsaved');

        // Trigger auto-save
        if (this.autoSaveEnabled && this.currentProject) {
            this.scheduleAutoSave();
        }
    },

    /**
     * Schedule auto-save
     */
    scheduleAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty && this.currentProject && !this.isSaving) {
                console.log('Auto-saving...');
                this.saveProject();
            }
        }, this.autoSaveDelay);
    },

    /**
     * Update save indicator UI
     */
    updateSaveIndicator(status) {
        const indicator = document.getElementById('saveIndicator');
        if (!indicator) return;

        const states = {
            saved: { text: '✓ Saved', class: 'saved' },
            saving: { text: '⏳ Saving...', class: 'saving' },
            unsaved: { text: '● Unsaved', class: 'unsaved' },
            error: { text: '⚠ Error', class: 'error' }
        };

        const state = states[status] || states.saved;
        indicator.textContent = state.text;
        indicator.className = `save-indicator ${state.class}`;
    },

    /**
     * Render project dropdown in UI
     */
    renderProjectDropdown(projects) {
        const select = document.getElementById('projectSelect');
        if (!select) return;

        const currentValue = select.value;

        select.innerHTML = '<option value="">-- Chọn Project --</option>';

        projects.forEach(project => {
            const name = project.name || project;
            const option = document.createElement('option');
            option.value = name;

            // Show indicator if project has metadata (from ProjectManager)
            const metaIcon = project.hasMetadata ? '📋 ' : '';
            option.textContent = metaIcon + name;

            if (name === this.currentProject) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    },

    /**
     * LocalStorage fallback methods
     */
    saveToLocalStorage(projectName) {
        try {
            const projectData = {
                projectName,
                headers: DataManager.getHeaders(),
                data: DataManager.getData(),
                metadata: {
                    fileInfo: DataManager.getFileInfo(),
                    config: ConfigManager.getAll(),
                    savedAt: new Date().toISOString()
                }
            };
            localStorage.setItem(`fw_project_${projectName}`, JSON.stringify(projectData));

            // Update project list
            const list = this.getLocalProjects();
            if (!list.find(p => p.name === projectName)) {
                list.push({ name: projectName, savedAt: new Date().toISOString() });
                localStorage.setItem('fw_project_list', JSON.stringify(list));
            }
        } catch (e) {
            console.error('LocalStorage save error:', e);
        }
    },

    loadFromLocalStorage(projectName) {
        try {
            const data = localStorage.getItem(`fw_project_${projectName}`);
            if (data) {
                const project = JSON.parse(data);
                DataManager.setData(project.headers, project.data, projectName);
                if (project.metadata?.config) {
                    ConfigManager.updateConfig(project.metadata.config);
                }
                this.currentProject = projectName;
                UIRenderer.updateFileInfo();
                UIRenderer.renderDataTable();
                return true;
            }
        } catch (e) {
            console.error('LocalStorage load error:', e);
        }
        return false;
    },

    getLocalProjects() {
        try {
            return JSON.parse(localStorage.getItem('fw_project_list') || '[]');
        } catch {
            return [];
        }
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
}
