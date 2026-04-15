/**
 * Photo upload utility — uploads a local file URI to the server's S3 storage
 * and returns the permanent S3 URL.
 *
 * Usage:
 *   const url = await uploadPhotoToServer(localUri, sessionToken);
 *   // store url instead of localUri
 */

import { getApiBaseUrl } from "@/constants/oauth";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/** Returns true if the URI is already a remote URL (https://...) */
export function isRemoteUrl(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * Upload a local file URI to the server and return the permanent S3 URL.
 * If the URI is already remote, returns it unchanged.
 * Throws on failure.
 */
export async function uploadPhotoToServer(
  localUri: string,
  sessionToken: string,
): Promise<string> {
  // Already uploaded
  if (isRemoteUrl(localUri)) return localUri;

  const apiBase = getApiBaseUrl();
  const uploadUrl = `${apiBase}/api/upload-user-photo`;

  if (Platform.OS === "web") {
    // Web: fetch the blob and upload via FormData
    const resp = await fetch(localUri);
    const blob = await resp.blob();
    const formData = new FormData();
    formData.append("file", blob, "photo.jpg");
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: formData,
    });
    if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);
    const json = await uploadResp.json();
    return json.url as string;
  }

  // Native: use FileSystem.uploadAsync (multipart)
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "field",
    headers: { Authorization: `Bearer ${sessionToken}` },
    mimeType: "image/jpeg",
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed: ${uploadResult.status} ${uploadResult.body}`);
  }

  const json = JSON.parse(uploadResult.body);
  return json.url as string;
}

/**
 * Upload all local URIs in a VisionBoard object to S3 and return a new board
 * with all URIs replaced by permanent S3 URLs.
 * Already-remote URLs are passed through unchanged.
 */
export async function uploadVisionBoardPhotos(
  board: Record<string, string[]>,
  sessionToken: string,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const [catId, uris] of Object.entries(board)) {
    const uploaded: string[] = [];
    for (const uri of uris) {
      try {
        const url = await uploadPhotoToServer(uri, sessionToken);
        uploaded.push(url);
      } catch (err) {
        console.warn("[uploadVisionBoardPhotos] failed to upload", uri, err);
        // Keep local URI as fallback so user doesn't lose the image
        uploaded.push(uri);
      }
    }
    result[catId] = uploaded;
  }
  return result;
}
