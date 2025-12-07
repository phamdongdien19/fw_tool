import { put, del, head } from '@vercel/blob';
import { gunzipSync } from 'zlib';

const PROJECTS_INDEX_PATH = 'projects/_index.json';

export const config = {
    api: {
        bodyParser: false,
    },
};

const getRawBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
};

// Helper function to fetch existing project using head() instead of list()
async function fetchExistingProject(projectName) {
    const blobPath = `projects/${projectName}.json`;

    try {
        // head() is a Simple Operation, not Advanced
        const blobInfo = await head(blobPath);

        // Fetch the blob content
        const url = new URL(blobInfo.url);
        url.searchParams.set('t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });

        if (response.ok) {
            const projectData = await response.json();
            return { data: projectData, url: blobInfo.url };
        }
        return null;
    } catch (err) {
        // head() throws if blob doesn't exist - this is expected for new projects
        return null;
    }
}

// Helper function to get projects index
async function getProjectsIndex() {
    try {
        const blobInfo = await head(PROJECTS_INDEX_PATH);
        const url = new URL(blobInfo.url);
        url.searchParams.set('t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });

        if (response.ok) {
            const indexData = await response.json();
            return indexData.projects || [];
        }
        return [];
    } catch (err) {
        return [];
    }
}

// Helper function to update projects index
async function updateProjectsIndex(project, blobUrl) {
    try {
        let projects = await getProjectsIndex();

        // Update or add project info
        const existingIndex = projects.findIndex(p => p.name === project.projectName);
        const projectInfo = {
            name: project.projectName,
            url: blobUrl,
            size: JSON.stringify(project).length,
            uploadedAt: new Date().toISOString(),
            rowCount: project.metadata?.rowCount || 0
        };

        if (existingIndex >= 0) {
            projects[existingIndex] = projectInfo;
        } else {
            projects.unshift(projectInfo);
        }

        await put(PROJECTS_INDEX_PATH, JSON.stringify({ projects }), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        console.log('[save.js] Updated projects index with', projects.length, 'projects');
    } catch (err) {
        console.warn('[save.js] Failed to update projects index:', err.message);
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Encoding');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Read raw body
        let reqBody = await getRawBody(req);

        // Handle gzip
        const contentEncoding = req.headers['content-encoding'] || '';
        const contentType = req.headers['content-type'] || '';

        if (contentEncoding.includes('gzip') || contentType.includes('application/octet-stream')) {
            try {
                const decompressed = gunzipSync(reqBody);
                reqBody = JSON.parse(decompressed.toString('utf-8'));
            } catch (e) {
                console.error('Decompression error', e);
                try {
                    reqBody = JSON.parse(reqBody.toString('utf-8'));
                } catch (e2) {
                    throw new Error('Invalid compression or JSON format');
                }
            }
        } else {
            try {
                reqBody = JSON.parse(reqBody.toString('utf-8'));
            } catch (e) {
                // ignore
            }
        }

        const { projectName, data: reqData, headers: reqHeaders, metadata, isMetadataUpdate, originalProjectName } = reqBody;

        if (!projectName) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        let finalData = reqData || [];
        let finalHeaders = reqHeaders || [];
        let preservedMetadata = {};
        let originalProjectUrl = null;

        // 1. Check for Rename Migration (if originalProjectName provided)
        if (originalProjectName && originalProjectName !== projectName) {
            const oldProject = await fetchExistingProject(originalProjectName);
            if (oldProject) {
                if (!finalData || finalData.length === 0) {
                    finalData = oldProject.data.data || [];
                    finalHeaders = oldProject.data.headers || [];
                    console.log(`[save.js] Migrated ${finalData.length} rows from "${originalProjectName}" to "${projectName}"`);
                }
                preservedMetadata = oldProject.data.metadata || {};
                originalProjectUrl = oldProject.url;
            }
        }

        // 2. If NOT renaming, check for existing target project to merge
        if (!originalProjectUrl) {
            const existingProject = await fetchExistingProject(projectName);
            if (existingProject) {
                preservedMetadata = existingProject.data.metadata || {};

                if (isMetadataUpdate && (!finalData || finalData.length === 0)) {
                    finalData = existingProject.data.data || [];
                    finalHeaders = existingProject.data.headers || [];
                    console.log(`[save.js] Preserved ${finalData.length} rows for metadata update of "${projectName}"`);
                } else {
                    console.log(`[save.js] Check found existing project "${projectName}", merging metadata.`);
                }
            }
        }

        // Create project data object
        const projectData = {
            projectName,
            headers: finalHeaders,
            data: finalData,
            metadata: {
                ...preservedMetadata,
                ...metadata,
                savedAt: new Date().toISOString(),
                rowCount: finalData.length,
                columnCount: finalHeaders.length
            }
        };

        // Convert to JSON string
        const jsonContent = JSON.stringify(projectData);
        console.log(`Saving project "${projectName}" - size: ${jsonContent.length} bytes, rows: ${projectData.metadata.rowCount}`);

        // Create blob filename
        const blobPath = `projects/${projectName}.json`;

        // Upload to Vercel Blob
        const blob = await put(blobPath, jsonContent, {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        // Update projects index (for list.js to use without list() operation)
        await updateProjectsIndex(projectData, blob.url);

        // Delete old project if rename was successful
        if (originalProjectUrl) {
            try {
                await del(originalProjectUrl);
                console.log(`[save.js] Deleted old project: ${originalProjectUrl}`);

                // Also remove from index
                let projects = await getProjectsIndex();
                projects = projects.filter(p => p.name !== originalProjectName);
                await put(PROJECTS_INDEX_PATH, JSON.stringify({ projects }), {
                    access: 'public',
                    contentType: 'application/json',
                    addRandomSuffix: false,
                });
            } catch (err) {
                console.warn('[save.js] Failed to delete old project:', err);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Project "${projectName}" saved successfully`,
            url: blob.url,
            savedAt: projectData.metadata.savedAt,
            rowCount: projectData.metadata.rowCount
        });

    } catch (error) {
        console.error('Save error:', error);
        return res.status(500).json({
            success: false,
            error: `Failed to save project: ${error.message}`,
            details: error.message
        });
    }
}
