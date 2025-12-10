/**
 * Alchemer API Manager - FW Tools
 * Handles fetching survey data from Alchemer (SurveyGizmo) API
 */

const AlchemerAPI = {
    // API Configuration
    config: {
        baseUrl: 'https://api.alchemer.com/v5',
        apiToken: '',
        apiSecret: '',
        surveyId: ''
    },

    // Cache for API responses (plid -> status mapping)
    // This is stored separately from main DataManager data
    apiResponseCache: {
        surveyId: null,
        responses: [],      // Raw responses from API
        plidStatusMap: new Map(),  // plid -> status mapping for quick lookup
        fetchedAt: null
    },

    // CORS Proxy options (needed for browser-based requests)
    corsProxies: [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/'
    ],

    /**
     * Initialize with API credentials
     */
    init() {
        this.loadCredentials();
        console.log('AlchemerAPI initialized');
    },

    /**
     * Load credentials from localStorage
     */
    loadCredentials() {
        try {
            const stored = localStorage.getItem('fw_tools_alchemer_config');
            if (stored) {
                const config = JSON.parse(stored);
                this.config.apiToken = config.apiToken || '';
                this.config.apiSecret = config.apiSecret || '';
                this.config.surveyId = config.surveyId || '';
            }
        } catch (e) {
            console.warn('Failed to load Alchemer credentials:', e);
        }
    },

    /**
     * Save credentials to localStorage
     */
    saveCredentials(apiToken, apiSecret, surveyId) {
        this.config.apiToken = apiToken;
        this.config.apiSecret = apiSecret;
        this.config.surveyId = surveyId;

        try {
            localStorage.setItem('fw_tools_alchemer_config', JSON.stringify({
                apiToken,
                apiSecret,
                surveyId
            }));
            return true;
        } catch (e) {
            console.error('Failed to save Alchemer credentials:', e);
            return false;
        }
    },

    /**
     * Get current credentials
     */
    getCredentials() {
        return {
            apiToken: this.config.apiToken,
            apiSecret: this.config.apiSecret,
            surveyId: this.config.surveyId
        };
    },

    /**
     * Check if credentials are configured
     */
    isConfigured() {
        return !!(this.config.apiToken && this.config.apiSecret);
    },

    /**
     * Build API URL with authentication
     */
    buildUrl(endpoint, params = {}) {
        const url = new URL(`${this.config.baseUrl}${endpoint}`);
        url.searchParams.append('api_token', this.config.apiToken);
        url.searchParams.append('api_token_secret', this.config.apiSecret);

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.append(key, value);
            }
        });

        return url.toString();
    },

    /**
     * Fetch with CORS proxy - tries multiple proxies
     * If direct fetch works (e.g., with browser extension), use that
     */
    async fetchWithProxy(url) {
        let lastError = null;

        // Try direct fetch first (works if CORS is enabled or browser extension active)
        try {
            console.log('Trying direct fetch:', url.substring(0, 80) + '...');
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Direct fetch successful!');
                return data;
            } else {
                lastError = `Direct fetch returned ${response.status}: ${response.statusText}`;
                console.log(lastError);
            }
        } catch (e) {
            lastError = `Direct fetch error: ${e.message}`;
            console.log(lastError);
        }

        // Try each proxy in order
        for (const proxy of this.corsProxies) {
            try {
                console.log('Trying proxy:', proxy);
                const proxyUrl = proxy + encodeURIComponent(url);
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const text = await response.text();
                    try {
                        const data = JSON.parse(text);
                        console.log('Proxy successful:', proxy);
                        return data;
                    } catch (e) {
                        lastError = `Invalid JSON from ${proxy}`;
                        console.warn(lastError, text.substring(0, 100));
                        continue;
                    }
                }
                lastError = `Proxy ${proxy} returned ${response.status}`;
                console.log(lastError);
            } catch (e) {
                lastError = `Proxy ${proxy} error: ${e.message}`;
                console.log(lastError);
                continue;
            }
        }

        throw new Error(`API call failed. ${lastError || 'Tất cả phương thức đều thất bại.'}`);
    },

    /**
     * Get list of surveys
     */
    async getSurveys() {
        if (!this.isConfigured()) {
            throw new Error('API credentials not configured');
        }

        const url = this.buildUrl('/survey', { resultsperpage: 50 });
        const data = await this.fetchWithProxy(url);

        if (!data.result_ok) {
            throw new Error(data.message || 'Failed to fetch surveys');
        }

        return data.data || [];
    },

    /**
     * Get survey details
     */
    async getSurveyDetails(surveyId) {
        if (!this.isConfigured()) {
            throw new Error('API credentials not configured');
        }

        const url = this.buildUrl(`/survey/${surveyId}`);
        const data = await this.fetchWithProxy(url);

        if (!data.result_ok) {
            throw new Error(data.message || 'Failed to fetch survey details');
        }

        return data.data;
    },

    /**
     * Get survey questions
     */
    async getSurveyQuestions(surveyId) {
        if (!this.isConfigured()) {
            throw new Error('API credentials not configured');
        }

        const url = this.buildUrl(`/survey/${surveyId}/surveyquestion`, { resultsperpage: 100 });
        const data = await this.fetchWithProxy(url);

        if (!data.result_ok) {
            throw new Error(data.message || 'Failed to fetch survey questions');
        }

        return data.data || [];
    },

    /**
     * Get survey responses with pagination
     * @param {string} surveyId - Survey ID
     * @param {Object} options - Options like filter, page, resultsperpage
     */
    async getSurveyResponses(surveyId, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('API credentials not configured');
        }

        const {
            page = 1,
            resultsperpage = 100,
            filter = null,
            status = null  // Changed: don't filter by default, let API return all
        } = options;

        const params = {
            page,
            resultsperpage
        };

        // Only add status filter if explicitly requested
        if (status) {
            params['filter[field][0]'] = 'status';
            params['filter[operator][0]'] = '==';
            params['filter[value][0]'] = status;
        }

        const url = this.buildUrl(`/survey/${surveyId}/surveyresponse`, params);
        console.log('Fetching responses page', page, '- URL:', url.substring(0, 100) + '...');

        const data = await this.fetchWithProxy(url);

        if (!data.result_ok) {
            throw new Error(data.message || 'Failed to fetch survey responses');
        }

        console.log(`Page ${page}: got ${data.data?.length || 0} responses, total: ${data.total_count}`);

        return {
            data: data.data || [],
            totalCount: data.total_count || 0,
            page: data.page || 1,
            totalPages: data.total_pages || 1
        };
    },

    /**
     * Fetch all responses (handles pagination)
     * @param {string} surveyId - Survey ID
     * @param {Function} onProgress - Progress callback (current, total)
     */
    async fetchAllResponses(surveyId, onProgress = null) {
        const allResponses = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const result = await this.getSurveyResponses(surveyId, {
                page,
                resultsperpage: 100
                // Removed status filter - was causing 500 error
            });

            allResponses.push(...result.data);
            totalPages = result.totalPages;

            if (onProgress) {
                onProgress(allResponses.length, result.totalCount);
            }

            page++;

            // Add small delay to avoid rate limiting
            if (page <= totalPages) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return allResponses;
    },

    /**
     * Convert Alchemer responses to flat data format
     * @param {Array} responses - Raw responses from API
     * @param {Array} questions - Questions for header mapping
     */
    convertToFlatData(responses, questions = []) {
        if (!responses || responses.length === 0) {
            return { headers: [], data: [] };
        }

        // Create question ID to title mapping
        const questionMap = {};
        questions.forEach(q => {
            questionMap[q.id] = q.title ? q.title.replace(/<[^>]*>/g, '').trim() : `Question ${q.id}`;
        });

        // Collect all unique field keys
        const allKeys = new Set();
        const standardFields = ['id', 'contact_id', 'status', 'is_test_data', 'date_submitted', 'session_id', 'language', 'date_started', 'link_id', 'url_variables'];

        responses.forEach(response => {
            // Add standard fields
            standardFields.forEach(key => {
                if (response[key] !== undefined) {
                    allKeys.add(key);
                }
            });

            // Add survey_data fields
            if (response.survey_data) {
                Object.keys(response.survey_data).forEach(key => {
                    allKeys.add(`q_${key}`);
                });
            }

            // Add url_variables
            if (response.url_variables && typeof response.url_variables === 'object') {
                Object.keys(response.url_variables).forEach(key => {
                    allKeys.add(`url_${key}`);
                });
            }
        });

        // Convert to headers array
        const headers = Array.from(allKeys).map(key => {
            if (key.startsWith('q_')) {
                const qId = key.replace('q_', '');
                return questionMap[qId] || `Question ${qId}`;
            }
            if (key.startsWith('url_')) {
                return key.replace('url_', 'URL: ');
            }
            return key;
        });

        // Convert responses to data rows
        const data = responses.map((response, index) => {
            const row = { _rowIndex: index };
            let i = 0;

            allKeys.forEach(key => {
                const header = headers[i];
                let value = '';

                if (key.startsWith('q_')) {
                    const qId = key.replace('q_', '');
                    const qData = response.survey_data?.[qId];
                    if (qData) {
                        // Handle different answer formats
                        if (qData.answer !== undefined) {
                            value = qData.answer;
                        } else if (qData.options) {
                            value = Object.values(qData.options).map(opt => opt.answer || opt.option).join(', ');
                        } else {
                            value = JSON.stringify(qData);
                        }
                    }
                } else if (key.startsWith('url_')) {
                    const urlKey = key.replace('url_', '');
                    value = response.url_variables?.[urlKey] || '';
                } else {
                    value = response[key] !== undefined ? response[key] : '';
                }

                row[header] = value;
                i++;
            });

            return row;
        });

        return { headers, data };
    },

    /**
     * Fetch survey responses and cache plid+status for Update Status feature
     * Does NOT modify main DataManager data
     */
    async fetchStatusData(surveyId, onProgress = null) {
        console.log('Fetching status data for survey:', surveyId);

        // Fetch all responses
        let responses;
        try {
            console.log('Fetching survey responses...');
            responses = await this.fetchAllResponses(surveyId, onProgress);
            console.log('Got responses:', responses.length);
        } catch (e) {
            console.error('Failed to fetch responses:', e);
            throw new Error(`Không thể lấy responses: ${e.message}`);
        }

        if (!responses || responses.length === 0) {
            throw new Error('Survey không có responses nào');
        }

        // Build plid -> status mapping
        const plidStatusMap = new Map();
        let foundPlid = 0;

        // Debug: log first response structure
        if (responses.length > 0) {
            console.log('=== DEBUG: First response structure ===');
            console.log('Keys:', Object.keys(responses[0]));
            console.log('url_variables:', responses[0].url_variables);
            console.log('status:', responses[0].status);
            console.log('id:', responses[0].id);
            console.log('contact_id:', responses[0].contact_id);

            // Find all available url_variable keys
            const allUrlVarKeys = new Set();
            responses.forEach(r => {
                if (r.url_variables && typeof r.url_variables === 'object') {
                    Object.keys(r.url_variables).forEach(k => allUrlVarKeys.add(k));
                }
            });
            console.log('All url_variable keys found:', [...allUrlVarKeys]);
        }

        // Try to find the plid field - check common names
        const possiblePlidKeys = ['plid', 'PLID', 'Plid', 'panelistId', 'panelist_id', 'respondent_id', 'rid', 'RID', 'uid', 'UID', 'id', 'pid', 'PID'];

        responses.forEach(response => {
            let plid = '';

            // Check url_variables for any possible plid key
            if (response.url_variables && typeof response.url_variables === 'object') {
                for (const key of possiblePlidKeys) {
                    if (response.url_variables[key]) {
                        plid = response.url_variables[key];
                        break;
                    }
                }

                // If still not found, try first non-empty value
                if (!plid) {
                    const urlVarValues = Object.entries(response.url_variables);
                    for (const [key, value] of urlVarValues) {
                        if (value && String(value).trim()) {
                            console.log(`Using url_variable "${key}" as plid:`, value);
                            plid = value;
                            break;
                        }
                    }
                }
            }

            // Fallback: use contact_id or response id
            if (!plid && response.contact_id) {
                plid = response.contact_id;
            }
            if (!plid && response.id) {
                plid = response.id;
            }

            // Get status
            const status = response.status || 'Unknown';

            plid = String(plid).trim();

            if (plid) {
                plidStatusMap.set(plid, status);
                foundPlid++;
            }
        });

        // Cache the results with url_variables info for debugging
        const sampleUrlVars = responses.length > 0 ? responses[0].url_variables : null;
        this.apiResponseCache = {
            surveyId: surveyId,
            responses: responses,
            plidStatusMap: plidStatusMap,
            sampleUrlVars: sampleUrlVars,
            fetchedAt: new Date().toISOString()
        };

        console.log(`Cached ${responses.length} responses, found ${foundPlid} with plid`);

        // Count statuses from all responses (not just those with plid)
        const allStatuses = responses.map(r => r.status);
        const statusCounts = {
            Complete: allStatuses.filter(s => s === 'Complete').length,
            Partial: allStatuses.filter(s => s === 'Partial').length,
            Disqualified: allStatuses.filter(s => s === 'Disqualified').length
        };

        // Log action
        ConfigManager.addActionHistory({
            type: 'api_fetch',
            fileName: `Survey ${surveyId} - Status Data`,
            icon: '🔗'
        });

        return {
            success: true,
            totalResponses: responses.length,
            responsesWithPlid: foundPlid,
            sampleUrlVars: sampleUrlVars,
            statuses: statusCounts,
            Disqualified: [...plidStatusMap.values()].filter(s => s === 'Disqualified').length
        };
    },

    /**
     * Apply cached status to current DataManager data
     * @param {string} plidColumn - Column name containing plid in main data
     * @param {string} targetColumn - Column name to write status to (will be created if not exists)
     */
    applyStatusToData(plidColumn, targetColumn = 'Response_Status') {
        if (!this.apiResponseCache.plidStatusMap || this.apiResponseCache.plidStatusMap.size === 0) {
            throw new Error('Chưa có dữ liệu API. Vui lòng Fetch Data trước.');
        }

        const data = DataManager.getData();
        const headers = DataManager.getHeaders();

        if (data.length === 0) {
            throw new Error('Chưa có dữ liệu chính. Vui lòng Import file trước.');
        }

        if (!headers.includes(plidColumn)) {
            throw new Error(`Không tìm thấy cột "${plidColumn}" trong dữ liệu`);
        }

        // Ensure target column exists
        if (!headers.includes(targetColumn)) {
            DataManager.headers.push(targetColumn);
        }

        // Save undo state
        DataManager.saveUndoState();

        // Match and update
        let matched = 0;
        let notFound = 0;

        data.forEach(row => {
            const plid = String(row[plidColumn] || '').trim();

            if (plid && this.apiResponseCache.plidStatusMap.has(plid)) {
                row[targetColumn] = this.apiResponseCache.plidStatusMap.get(plid);
                matched++;
            } else {
                row[targetColumn] = ''; // Empty if not found
                notFound++;
            }
        });

        DataManager.detectBatches();

        return {
            success: true,
            matched: matched,
            notFound: notFound,
            total: data.length
        };
    },

    /**
     * Get cached status summary
     */
    getCachedStatusSummary() {
        if (!this.apiResponseCache.plidStatusMap) {
            return null;
        }

        const statuses = [...this.apiResponseCache.plidStatusMap.values()];
        return {
            surveyId: this.apiResponseCache.surveyId,
            fetchedAt: this.apiResponseCache.fetchedAt,
            total: this.apiResponseCache.plidStatusMap.size,
            Complete: statuses.filter(s => s === 'Complete').length,
            Partial: statuses.filter(s => s === 'Partial').length,
            Disqualified: statuses.filter(s => s === 'Disqualified').length
        };
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.AlchemerAPI = AlchemerAPI;

    // Auto-init to load credentials from localStorage
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            AlchemerAPI.init();
        });
    } else {
        AlchemerAPI.init();
    }
}
