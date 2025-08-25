import { Storage } from '@google-cloud/storage';

class GCSService {
  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.GCS_BUCKET_NAME;
    
    if (!this.bucketName) {
      throw new Error('GCS_BUCKET_NAME environment variable is required');
    }
    
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Upload a file to GCS
   * @param {string} fileName - The name/path of the file in the bucket
   * @param {Buffer} fileBuffer - The file content as a buffer
   * @param {string} contentType - The MIME type of the file
   * @returns {Promise<string>} - The public URL of the uploaded file
   */
  async uploadFile(fileName, fileBuffer, contentType = 'application/octet-stream') {
    try {
      const file = this.bucket.file(fileName);
      
      const stream = file.createWriteStream({
        metadata: {
          contentType: contentType,
        },
        resumable: false,
      });

      return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          console.error('Error uploading to GCS:', error);
          reject(error);
        });

        stream.on('finish', () => {
          // Make the file publicly readable
          file.makePublic().then(() => {
            const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
            resolve(publicUrl);
          }).catch(reject);
        });

        stream.end(fileBuffer);
      });
    } catch (error) {
      console.error('Error in uploadFile:', error);
      throw error;
    }
  }

  /**
   * Download a file from GCS
   * @param {string} fileName - The name/path of the file in the bucket
   * @returns {Promise<Buffer>} - The file content as a buffer
   */
  async downloadFile(fileName) {
    try {
      const file = this.bucket.file(fileName);
      const [fileBuffer] = await file.download();
      return fileBuffer;
    } catch (error) {
      console.error('Error downloading from GCS:', error);
      throw error;
    }
  }

  /**
   * Check if a file exists in GCS
   * @param {string} fileName - The name/path of the file in the bucket
   * @returns {Promise<boolean>} - Whether the file exists
   */
  async fileExists(fileName) {
    try {
      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * List files in a directory (prefix)
   * @param {string} prefix - The directory prefix to list
   * @returns {Promise<Array>} - Array of file objects
   */
  async listFiles(prefix = '') {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: prefix,
      });
      
      return files.map(file => ({
        name: file.name,
        size: file.metadata.size,
        created: file.metadata.timeCreated,
        contentType: file.metadata.contentType,
        publicUrl: `https://storage.googleapis.com/${this.bucketName}/${file.name}`
      }));
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  /**
   * Delete a file from GCS
   * @param {string} fileName - The name/path of the file in the bucket
   * @returns {Promise<boolean>} - Whether the deletion was successful
   */
  async deleteFile(fileName) {
    try {
      const file = this.bucket.file(fileName);
      await file.delete();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Get a public URL for a file
   * @param {string} fileName - The name/path of the file in the bucket
   * @returns {string} - The public URL
   */
  getPublicUrl(fileName) {
    return `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
  }

  /**
   * Generate a signed URL for temporary access
   * @param {string} fileName - The name/path of the file in the bucket
   * @param {number} expiresInMinutes - Expiration time in minutes (default: 60)
   * @returns {Promise<string>} - The signed URL
   */
  async getSignedUrl(fileName, expiresInMinutes = 60) {
    try {
      const file = this.bucket.file(fileName);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + (expiresInMinutes * 60 * 1000),
      });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }
}

export default GCSService;