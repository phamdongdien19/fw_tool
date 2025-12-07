import { put, list, del, head } from '@vercel/blob';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectName, data: reqData, headers: reqHeaders, metadata, isMetadataUpdate } = req.body;

        if (!projectName) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        let finalData = reqData || [];
        let finalHeaders = reqHeaders || [];
        let preservedMetadata = {};

        // Check for existing project to merge metadata and potentially preserve data
        try {
            const { blobs } = await list({
                prefix: `projects/${projectName}.json`,
            });

            if (blobs.length > 0) {
                // Found existing project - fetch it for merging
                const response = await fetch(blobs[0].url);
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
