import { File, UploadType } from 'expo-file-system';

/**
 * The part of an upload that touches the device: reading a picked note and streaming an
 * attachment to the Worker. Kept apart so the client's tests can swap it for a fake.
 */
export interface LocalFiles {
  readText(uri: string): Promise<string>;
  /** PUTs the file's bytes as the request body; resolves with the response (also for non-2xx). */
  putBinary(
    url: string,
    uri: string,
    opts: { headers: Record<string, string>; onProgress?: (sent: number, total: number) => void; signal?: AbortSignal },
  ): Promise<{ status: number; body: string }>;
}

export const deviceFiles: LocalFiles = {
  readText: (uri) => new File(uri).text(),
  async putBinary(url, uri, { headers, onProgress, signal }) {
    const task = new File(uri).createUploadTask(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      // Foreground: the progress callback and the promise belong to this JS runtime anyway.
      sessionType: 'foreground',
      onProgress: onProgress ? ({ bytesSent, totalBytes }) => onProgress(bytesSent, totalBytes) : undefined,
      signal,
    });
    try {
      const { status, body } = await task.uploadAsync();
      return { status, body };
    } finally {
      task.release();
    }
  },
};
