import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { parsePhotoExif } from './exifParser';

/**
 * Automatically scans the Android device's DCIM/Camera and Pictures directories 
 * without forcing the user to pick files manually.
 */
export async function scanDeviceCameraFolder(onProgress) {
  if (!Capacitor.isNativePlatform()) return [];

  // 1. Request storage permissions
  try {
    const permStatus = await Filesystem.checkPermissions();
    if (permStatus.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch (e) {
    console.warn('Permission check/request error:', e);
  }

  const mediaDirectories = ['DCIM/Camera', 'DCIM', 'Pictures/Camera', 'Pictures'];
  const discoveredFiles = [];

  // 2. Discover image files in camera folders
  for (const dirPath of mediaDirectories) {
    try {
      const result = await Filesystem.readdir({
        path: dirPath,
        directory: Directory.ExternalStorage
      });

      if (result && result.files) {
        for (const fileObj of result.files) {
          const name = typeof fileObj === 'string' ? fileObj : fileObj.name;
          const uri = typeof fileObj === 'object' && fileObj.uri ? fileObj.uri : null;

          // Only target camera photo extensions
          if (/\.(jpe?g|png|heic|webp)$/i.test(name)) {
            discoveredFiles.push({
              name,
              dirPath,
              uri
            });
          }
        }
      }
    } catch (e) {
      console.log(`Directory ${dirPath} skip or empty:`, e.message);
    }
  }

  if (discoveredFiles.length === 0) return [];

  // 3. Process discovered files in 10-parallel chunks with progress
  const parsedPhotos = [];
  const chunkSize = 10;

  for (let i = 0; i < discoveredFiles.length; i += chunkSize) {
    const chunk = discoveredFiles.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (fileItem) => {
        try {
          let fileBlob = null;

          if (fileItem.uri) {
            const webSrc = Capacitor.convertFileSrc(fileItem.uri);
            const res = await fetch(webSrc);
            fileBlob = await res.blob();
          } else {
            const readRes = await Filesystem.readFile({
              path: `${fileItem.dirPath}/${fileItem.name}`,
              directory: Directory.ExternalStorage
            });
            // Convert base64 data to blob if needed
            const base64Str = readRes.data;
            const byteCharacters = atob(base64Str);
            const byteNumbers = new Array(byteCharacters.length);
            for (let j = 0; j < byteCharacters.length; j++) {
              byteNumbers[j] = byteCharacters.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNumbers);
            fileBlob = new Blob([byteArray], { type: 'image/jpeg' });
          }

          if (fileBlob) {
            // Attach name to blob so parsePhotoExif can check filename & fingerprint
            fileBlob.name = fileItem.name;
            return await parsePhotoExif(fileBlob);
          }
        } catch (err) {
          console.warn(`Error scanning file ${fileItem.name}:`, err);
        }
        return null;
      })
    );

    parsedPhotos.push(...chunkResults.filter(Boolean));

    if (onProgress) {
      onProgress(Math.min(i + chunkSize, discoveredFiles.length), discoveredFiles.length);
    }

    // Yield 16ms to main thread
    await new Promise(r => setTimeout(r, 16));
  }

  return parsedPhotos;
}
