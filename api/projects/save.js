import { put, list, del, head } from '@vercel/blob';
import { gunzipSync } from 'zlib';

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
                // Try parsing as raw JSON if decompression fails (fallback)
                try {
                    reqBody = JSON.parse(reqBody.toString('utf-8'));
                } catch (e2) {
                    throw new Error('Invalid compression or JSON format');
                }
            }
        } else {
            // Standard JSON
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
            try {
                const { blobs } = await list({ prefix: `projects/${originalProjectName}.json` });
                if (blobs.length > 0) {
                    const url = new URL(blobs[0].url);
                    url.searchParams.set('t', Date.now());
                    const response = await fetch(url.toString(), { cache: 'no-store' });

                    if (response.ok) {
                        const oldProject = await response.json();

                        // Migrate data from old project
                        if (!finalData || finalData.length === 0) {
                            finalData = oldProject.data || [];
                            finalHeaders = oldProject.headers || [];
                            console.log(`[save.js] Migrated ${finalData.length} rows from "${originalProjectName}" to "${projectName}"`);
                        }

                        // Use old metadata as base
                        preservedMetadata = oldProject.metadata || {};
                        originalProjectUrl = blobs[0].url;
                    }
                }
            } catch (err) {
                console.warn('[save.js] Failed to fetch original project for migration:', err);
            }
        }

        // 2. If NOT renaming (or migration failed), check for existing target project to merge
        if (!originalProjectUrl) {
            try {
                const { blobs } = await list({
                    prefix: `projects/${projectName}.json`,
                });

                if (blobs.length > 0) {
                    // Found existing project - fetch it for merging
                    const url = new URL(blobs[0].url);
                    url.searchParams.set('t', Date.now());
                    const response = await fetch(url.toString(), { cache: 'no-store' });

                    if (response.ok) {
                        const existingProject = await response.json();

                        // Capture existing metadata to prevent overwriting
                        preservedMetadata = existingProject.metadata || {};

                        // If this is a metadata-only update (e.g. from ProjectManager), preserve existing data
                        if (isMetadataUpdate && (!finalData || finalData.length === 0)) {
                            finalData = existingProject.data || [];
                            finalHeaders = existingProject.headers || [];
                            console.log(`[save.js] Preserved ${finalData.length} rows for metadata update of "${projectName}"`);
                        } else {
                            console.log(`[save.js] Check found existing project "${projectName}", merging metadata.`);
                        }
                    }
                }
            } catch (err) {
                console.warn('[save.js] Failed to fetch existing project for merge:', err);
                // Continue with provided data/metadata if fetch fails
            }
        }

        // Create project data object
        const projectData = {
            projectName,
            headers: finalHeaders,
            data: finalData,
            metadata: {
                ...preservedMetadata,  // Keep existing fields (like notes, criteria, or config)
                ...metadata,           // Overwrite with new fields provided in this request
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

        // Delete old project if rename was successful (and we have the url)
        if (originalProjectUrl) {
            try {
                await del(originalProjectUrl);
                console.log(`[save.js] Deleted old project: ${originalProjectUrl}`);
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
