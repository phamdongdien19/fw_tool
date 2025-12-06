/**
 * Project Manager - FW Tools
 * Manages project data, criteria, and Alchemer quota integration
 * Uses server-side storage via Vercel Blob
 */

const ProjectManager = {
    // API endpoint
    API_URL: '/api/project-manager',

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
     */
    async syncFromServer() {
        try {
            this.isLoading = true;

            // Add timeout of 5 seconds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(this.API_URL, { signal: controller.signal });
            clearTimeout(timeoutId);

            const result = await response.json();
            const serverProjects = result.projects || [];

            // Merge server data with local
            const localProjects = this.projects || [];
            const merged = [...serverProjects];

            // Add any local-only projects
            localProjects.forEach(localP => {
                if (!merged.find(p => p.id === localP.id)) {
                    merged.push(localP);
                }
            });

            this.projects = merged;
            this.saveToLocalStorage();

            console.log('Server sync complete:', merged.length, 'projects');
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
     * Save projects to localStorage
     */
    saveToLocalStorage() {
        try {
            localStorage.setItem('fw_tools_projects', JSON.stringify(this.projects));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
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
     * Save project to server
     */
    async saveProjectToServer(project) {
        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to save');
            }
            return result;
        } catch (e) {
            console.error('Failed to save project to server:', e);
            // Fallback: save to localStorage
            localStorage.setItem('fw_tools_projects', JSON.stringify(this.projects));
            throw e;
        }
    },

    /**
     * Update project on server
     */
    async updateProjectOnServer(id, updates) {
        try {
            const response = await fetch(this.API_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, updates })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update');
            }
            return result;
        } catch (e) {
            console.error('Failed to update project on server:', e);
            // Fallback: save to localStorage
            localStorage.setItem('fw_tools_projects', JSON.stringify(this.projects));
            throw e;
        }
    },

    /**
     * Delete project from server
     */
    async deleteProjectFromServer(id) {
        try {
            const response = await fetch(`${this.API_URL}?id=${id}`, {
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

        // Add to local cache first
        this.projects.unshift(project);

        // Save to localStorage immediately
        this.saveToLocalStorage();

        // Refresh the Filter & Batch dropdown
        if (typeof StorageManager !== 'undefined' && StorageManager.loadProjectList) {
            StorageManager.loadProjectList();
        }

        // Save to server (async, don't block)
        this.saveProjectToServer(project).catch(e => {
            console.error('Background save failed:', e);
        });

        return project;
    },

    /**
     * Update an existing project
     */
    async updateProject(id, updates) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return null;

        this.projects[index] = {
            ...this.projects[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Save to server (async)
        this.updateProjectOnServer(id, updates).catch(e => {
            console.error('Background update failed:', e);
        });

        return this.projects[index];
    },

    /**
     * Delete a project
     */
    async deleteProject(id) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.projects.splice(index, 1);

        if (this.activeProjectId === id) {
            this.activeProjectId = null;
        }

        // Delete from server (async)
        this.deleteProjectFromServer(id).catch(e => {
            console.error('Background delete failed:', e);
        });

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
