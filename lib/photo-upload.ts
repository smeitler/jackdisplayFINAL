/**
 * Photo upload utility — uploads a local file URI to the server's R2 storage
 * and returns the permanent R2 URL and storage key.
 *
 * Usage:
 *   const { url, key } = await uploadPhotoToServer(localUri, sessionToken);
 *   // store url for display, key for server sync (presigned URL regeneration)
 */

import { getApiBaseUrl } from "@/constants/oauth";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/** Returns true if the URI is already a remote URL (https://...) */
export function isRemoteUrl(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * Upload a local file URI to the server and return the permanent R2 URL and storage key.
 * If the URI is already remote, returns it with an empty key.
 * Throws on failure.
 */
export async function uploadPhotoToServer(
  localUri: string,
  sessionToken: string,
): Promise<{ url: string; key: string }> {
  // Already uploaded — return as-is with no key (key unknown for legacy uploads)
  if (isRemoteUrl(localUri)) return { url: localUri, key: "" };

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
    return { url: json.url as string, key: (json.key as string) ?? "" };
  }

  // Native: use FileSystem.uploadAsync (multipart)
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    headers: { Authorization: `Bearer ${sessionToken}` },
    mimeType: "image/jpeg",
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed: ${uploadResult.status} ${uploadResult.body}`);
  }

  const json = JSON.parse(uploadResult.body);
  return { url: json.url as string, key: (json.key as string) ?? "" };
}

/**
 * Upload all local URIs in a VisionBoard object to R2 and return a new board
 * with all URIs replaced by permanent R2 URLs, plus a key map for server sync.
 * Already-remote URLs are passed through unchanged.
 */
export async function uploadVisionBoardPhotos(
  board: Record<string, string[]>,
  sessionToken: string,
): Promise<{ board: Record<string, string[]>; keyMap: Record<string, string> }> {
  const result: Record<string, string[]> = {};
  const keyMap: Record<string, string> = {};
  for (const [catId, uris] of Object.entries(board)) {
    const uploaded: string[] = [];
    for (const uri of uris) {
      try {
        const { url, key } = await uploadPhotoToServer(uri, sessionToken);
        uploaded.push(url);
        if (key) keyMap[url] = key;
      } catch (err) {
        console.warn("[uploadVisionBoardPhotos] failed to upload", uri, err);
        // Keep local URI as fallback so user doesn't lose the image
        uploaded.push(uri);
      }
    }
    result[catId] = uploaded;
  }
  return { board: result, keyMap };
}
