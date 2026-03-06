/**
 * Service to handle image uploads to Cloudflare R2 via a Worker
 */

export interface UploadResponse {
  url: string;
  error?: string;
}

export const uploadToR2 = async (
  base64Image: string,
  fileName: string,
  contentType: string = 'image/png'
): Promise<string> => {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  const authKey = import.meta.env.VITE_WORKER_AUTH_KEY;

  if (!workerUrl || !authKey) {
    console.warn("Worker URL or Auth Key not configured. Falling back to base64 storage.");
    return base64Image;
  }

  try {
    const response = await fetch(`${workerUrl}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authKey,
      },
      body: JSON.stringify({
        image: base64Image,
        fileName,
        contentType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }

    const data: UploadResponse = await response.json();
    return data.url;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    // Fallback to base64 if upload fails, so the user doesn't lose their card
    return base64Image;
  }
};
