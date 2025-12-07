/**
 * Project Manager - FW Tools
 * Manages project data, criteria, and Alchemer quota integration
 * Uses server-side storage via Vercel Blob (file-per-project)
 */

const ProjectManager = {
    // API endpoints (file-per-project storage)
    API_LIST: '/api/projects/list',
    API_SAVE: '/api/projects/save',
    API_LOAD: '/api/projects/load',
    API_DELETE: '/api/projects/delete',

    // Current active project
    activeProjectId: null,

    // Projects array (local cache)
    projects: [],

    // Loading state
    isLoading: false,

    /**
     * Initialize Project Manager
     */
    async init() {
        // Load from localStorage first (instant)
        this.loadFromLocalStorage();
        this.loadActiveProject();
        console.log('ProjectManager initialized with', this.projects.length, 'projects (local)');

        // Then sync from server in background (don't await)
        this.syncFromServer();
    },

    /**
     * Load projects from localStorage (fast)
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('fw_tools_projects');
            this.projects = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.projects = [];
        }
    },

    /**
     * Sync projects from server (background)
     * Uses list metadata directly - full data is loaded on-demand
     */
    async syncFromServer() {
        try {
            this.isLoading = true;

            // Add timeout of 30 seconds (increased)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(this.API_LIST, { signal: controller.signal });
            clearTimeout(timeoutId);

            const result = await response.json();
            let serverProjectMeta = result.projects || [];

            console.log('syncFromServer: Server returned', serverProjectMeta.length, 'projects');

            // Sort by uploadedAt descending (newest first) to prioritize recent projects
            serverProjectMeta.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

            // Fetch full data for each project from blob
            // Optimization: Keep full data only for top 4 recent projects
            const RECENT_LIMIT = 4;
            const serverProjects = [];

            for (let i = 0; i < serverProjectMeta.length; i++) {
                const meta = serverProjectMeta[i];
                const isRecent = i < RECENT_LIMIT;

                try {
                    // Fetch the actual project JSON from blob
                    // Cache busting: Add timestamp and cache control
                    const url = new URL(meta.url);
                    url.searchParams.set('t', Date.now());

                    const blobResponse = await fetch(url.toString());

                    if (blobResponse.ok) {
                        const projectData = await blobResponse.json();

                        const safeName = (projectData.projectName || meta.name || 'unnamed').replace(/[^a-zA-Z0-9]/g, '_');
                        const dateStr = projectData.metadata?.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

                        // Keep data if recent, otherwise discard to save memory
                        const data = isRecent ? (projectData.data || []) : [];

                        serverProjects.push({
                            id: projectData.metadata?.id || 'proj_' + safeName + '_' + dateStr,
                            name: projectData.projectName || meta.name,
                            blobUrl: meta.url,
                            headers: projectData.headers || [],
                            data: data,
                            isCached: isRecent && data.length > 0, // Flag for UI
                            surveyId: projectData.metadata?.surveyId || '',
                            criteria: projectData.metadata?.criteria || '',
                            target: projectData.metadata?.target || 0,
                            notes: projectData.metadata?.notes || '',
                            questions: projectData.metadata?.questions || [],
                            quotas: projectData.metadata?.quotas || [],
                            lastQuotaFetch: projectData.metadata?.lastQuotaFetch || null,
                            config: projectData.metadata?.config || null,
                            createdAt: projectData.metadata?.createdAt || meta.uploadedAt || new Date().toISOString(),
                            updatedAt: projectData.metadata?.updatedAt || projectData.metadata?.savedAt || meta.uploadedAt || new Date().toISOString(),
                            _serverMeta: meta
                        });
                    } else {
                        // Fallback
                        console.warn(`Failed to fetch blob for ${meta.name}, using minimal data`);
                        const safeName = (meta.name || 'unnamed').replace(/[^a-zA-Z0-9]/g, '_');
                        serverProjects.push({
                            id: 'proj_' + safeName + '_' + new Date().toISOString().slice(0, 10),
                            name: meta.name,
                            blobUrl: meta.url,
                            headers: [],
                            data: [],
                            isCached: false,
                            surveyId: '',
                            criteria: '',
                            target: 0,
                            notes: '',
                            quotas: [],
                            lastQuotaFetch: null,
                            createdAt: meta.uploadedAt || new Date().toISOString(),
                            updatedAt: meta.uploadedAt || new Date().toISOString(),
                            _serverMeta: meta
                        });
                    }
                } catch (fetchErr) {
                    console.warn(`Error fetching blob for ${meta.name}:`, fetchErr.message);
                }
            }

            // Replace local data with server data
            this.projects = serverProjects;

            // Clear and save to localStorage
            try {
                localStorage.removeItem('fw_tools_projects');
            } catch (e) { /* ignore */ }
            this.saveToLocalStorage();

            console.log('Server sync complete:', this.projects.length, 'projects');
        } catch (e) {
            console.warn('Server sync failed (using local data):', e.message);
        } finally {
            this.isLoading = false;
            // Always re-render after sync attempt
            if (typeof renderProjectsList === 'function') {
                renderProjectsList();
            }
        }
    },

    /**
     * Save projects to localStorage (best effort, non-blocking)
     */
    saveToLocalStorage() {
        try {
            // Only store minimal project metadata (not full data) to avoid quota
            const minimalProjects = this.projects.map(p => ({
                id: p.id,
                name: p.name,
                surveyId: p.surveyId,
                criteria: p.criteria,
                target: p.target,
                notes: p.notes,
                quotas: p.quotas,
                lastQuotaFetch: p.lastQuotaFetch,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
                // Exclude: headers, data (large arrays)
            }));
            localStorage.setItem('fw_tools_projects', JSON.stringify(minimalProjects));
        } catch (e) {
            console.warn('localStorage save failed (quota exceeded?), continuing without local cache:', e.message);
            // Try to clear old data to make room
            try {
                localStorage.removeItem('fw_tools_projects');
            } catch (e2) {
                // Ignore
            }
        }
    },

    /**
     * Load projects (for compatibility - now just returns local)
     */
    async loadProjects() {
        this.loadFromLocalStorage();
        return this.projects;
    },

    /**
     * Save project to server (file-per-project)
     */
    async saveProjectToServer(project) {
        try {
            const body = {
                projectName: project.name,
                // If we don't have data/headers, flag this as a metadata update
                isMetadataUpdate: (!project.data || project.data.length === 0),
                data: project.data || [],
                headers: project.headers || [],
                metadata: {
                    id: project.id,
                    surveyId: project.surveyId,
                    criteria: project.criteria,
                    target: project.target,
                    notes: project.notes,
                    quotas: project.quotas,
                    lastQuotaFetch: project.lastQuotaFetch,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt
                }
            };

            // Pass original name if renaming
            if (project.originalProjectName) {
                body.originalProjectName = project.originalProjectName;
            }

            const response = await fetch(this.API_SAVE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to save');
            }
            return result;
        } catch (e) {
            console.error('Failed to save project to server:', e);
            // Fallback: save to localStorage
            this.saveToLocalStorage();
            throw e;
        }
    },

    /**
     * Update project on server (same as save for file-per-project)
     */
    async updateProjectOnServer(id, updates) {
        const project = this.getProject(id);
        if (!project) {
            throw new Error('Project not found');
        }

        // Check for rename
        const originalName = project.name;
        const updatedProject = { ...project, ...updates };

        if (updates.name && updates.name !== originalName) {
            updatedProject.originalProjectName = originalName;
        }

        // Strip data and headers for metadata-only update to avoid 413 Payload Too Large
        const projectToSave = { ...updatedProject };
        projectToSave.data = [];
        projectToSave.headers = [];

        return this.saveProjectToServer(projectToSave);
    },

    /**
     * Delete project from server
     */
    async deleteProjectFromServer(projectName) {
        try {
            const response = await fetch(`${this.API_DELETE}?name=${encodeURIComponent(projectName)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete');
            }
            return result;
        } catch (e) {
            console.error('Failed to delete project from server:', e);
            throw e;
        }
    },

    /**
     * Generate unique project ID
     */
    generateId() {
        return 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Create a new project
     */
    async createProject({ name, surveyId, criteria, target, notes }) {
        const project = {
            id: this.generateId(),
            name: name || 'Untitled Project',
            surveyId: surveyId || '',
            criteria: criteria || '',
            target: parseInt(target) || 0,
            notes: notes || '',
            quotas: [],
            lastQuotaFetch: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save to server FIRST - if this fails, don't add locally
        await this.saveProjectToServer(project);

        // Only add to local cache after server save succeeds
        this.projects.unshift(project);
        this.saveToLocalStorage();

        // Refresh the Filter & Batch dropdown
        if (typeof StorageManager !== 'undefined' && StorageManager.loadProjectList) {
            StorageManager.loadProjectList();
        }

        // Re-render UI after successful save
        if (typeof renderProjectsList === 'function') {
            renderProjectsList();
        }

        return project;
    },

    /**
     * Update an existing project
     */
    async updateProject(id, updates) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) {
            throw new Error('Project not found');
        }

        const updatedProject = {
            ...this.projects[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Save to server FIRST - if this fails, don't update locally
        await this.updateProjectOnServer(id, updates);

        // Only update local cache after server save succeeds
        this.projects[index] = updatedProject;
        this.saveToLocalStorage();

        return this.projects[index];
    },

    /**
     * Delete a project
     */
    async deleteProject(id) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) {
            throw new Error('Project not found');
        }

        const project = this.projects[index];
        const projectName = project.name;

        // Delete from server FIRST - if this fails, don't delete locally
        if (projectName) {
            await this.deleteProjectFromServer(projectName);
        }

        // Only remove from local after server delete succeeds
        this.projects.splice(index, 1);
        this.saveToLocalStorage();

        if (this.activeProjectId === id) {
            this.activeProjectId = null;
        }

        return true;
    },

    /**
     * Get project by ID
     */
    getProject(id) {
        return this.projects.find(p => p.id === id) || null;
    },

    /**
     * Get all projects
     */
    getAllProjects() {
        return [...this.projects];
    },

    /**
     * Get active project
     */
    getActiveProject() {
        if (!this.activeProjectId) return null;
        return this.getProject(this.activeProjectId);
    },

    /**
     * Set active project
     */
    setActiveProject(id) {
        this.activeProjectId = id;
        localStorage.setItem('fw_tools_active_project', id || '');
    },

    /**
     * Load active project from storage
     */
    loadActiveProject() {
        this.activeProjectId = localStorage.getItem('fw_tools_active_project') || null;
        return this.getActiveProject();
    },

    /**
     * Fetch quotas from Alchemer API
     * @param {string} projectId - Project ID to fetch quotas for
     * @returns {Promise<Object>} Quota data
     */
    async fetchQuotas(projectId) {
        const project = this.getProject(projectId);
        if (!project || !project.surveyId) {
            throw new Error('Project không có Survey ID');
        }

        // Check if AlchemerAPI is configured
        if (typeof AlchemerAPI === 'undefined' || !AlchemerAPI.isConfigured()) {
            throw new Error('Chưa cấu hình Alchemer API credentials');
        }

        try {
            // Use AlchemerAPI to fetch quotas (uses CORS proxy internally)
            const surveyId = project.surveyId;
            const quotasUrl = AlchemerAPI.buildUrl(`/survey/${surveyId}/quotas`);
            const result = await AlchemerAPI.fetchWithProxy(quotasUrl);

            if (!result.result_ok && !result.success) {
                throw new Error(result.error || 'Failed to fetch quotas');
            }

            // Parse quota data - API returns { result_ok, quotas: [...] }
            // Each quota has: id, name, description, responses (count), limit, distributed
            const rawQuotas = result.quotas || result.data || [];
            const quotas = rawQuotas.map(q => ({
                id: q.id,
                name: q.name || `Quota ${q.id}`,
                description: q.description || '',
                limit: parseInt(q.limit) || 0,
                count: parseInt(q.responses) || 0,  // API uses 'responses' not 'current_count'
                remaining: Math.max(0, (parseInt(q.limit) || 0) - (parseInt(q.responses) || 0)),
                distributed: q.distributed === 'true',
                isComplete: (parseInt(q.responses) || 0) >= (parseInt(q.limit) || 0)
            }));

            // Update project with quota data
            await this.updateProject(projectId, {
                quotas: quotas,
                lastQuotaFetch: new Date().toISOString()
            });

            return {
                success: true,
                quotas: quotas,
                total: quotas.reduce((sum, q) => sum + q.limit, 0),
                completed: quotas.reduce((sum, q) => sum + q.count, 0),
                remaining: quotas.reduce((sum, q) => sum + q.remaining, 0)
            };

        } catch (error) {
            console.error('Failed to fetch quotas:', error);
            throw error;
        }
    },

    /**
     * Get quota summary for a project
     */
    getQuotaSummary(projectId) {
        const project = this.getProject(projectId);
        if (!project || !project.quotas || project.quotas.length === 0) {
            return null;
        }

        return {
            totalLimit: project.quotas.reduce((sum, q) => sum + q.limit, 0),
            totalCompleted: project.quotas.reduce((sum, q) => sum + q.count, 0),
            totalRemaining: project.quotas.reduce((sum, q) => sum + q.remaining, 0),
            quotaCount: project.quotas.length,
            lastFetch: project.lastQuotaFetch
        };
    },

    /**
     * Get quota display text for tooltip/notes
     */
    getQuotaTextSummary(projectId) {
        const summary = this.getQuotaSummary(projectId);
        if (!summary) return 'Chưa có dữ liệu quota';

        const project = this.getProject(projectId);
        let text = `Quota Status (${new Date(summary.lastFetch).toLocaleString('vi-VN')}):\n`;
        text += `Tổng: ${summary.totalCompleted}/${summary.totalLimit} (còn ${summary.totalRemaining})\n\n`;

        project.quotas.forEach(q => {
            const percent = q.limit > 0 ? Math.round((q.count / q.limit) * 100) : 0;
            text += `• ${q.name}: ${q.count}/${q.limit} (${percent}%)\n`;
        });

        return text;
    },

    /**
     * Export projects as JSON
     */
    exportProjects() {
        return JSON.stringify(this.projects, null, 2);
    },

    /**
     * Import projects from JSON
     */
    async importProjects(jsonString, merge = false) {
        try {
            const imported = JSON.parse(jsonString);
            if (!Array.isArray(imported)) {
                throw new Error('Invalid format: expected array');
            }

            if (merge) {
                // Merge with existing, avoiding duplicates
                imported.forEach(proj => {
                    const existing = this.projects.find(p => p.id === proj.id);
                    if (!existing) {
                        this.projects.push(proj);
                        this.saveProjectToServer(proj).catch(e => console.error(e));
                    }
                });
            } else {
                // Replace all - need to delete old and add new
                this.projects = imported;
                // Save each project to server
                for (const proj of imported) {
                    await this.saveProjectToServer(proj);
                }
            }

            return { success: true, count: imported.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.ProjectManager = ProjectManager;

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            await ProjectManager.init();
            // Trigger re-render if on projects view
            if (typeof renderProjectsList === 'function') {
                renderProjectsList();
            }
        });
    } else {
        // DOM already loaded
        ProjectManager.init().then(() => {
            if (typeof renderProjectsList === 'function') {
                renderProjectsList();
            }
        });
    }
}
