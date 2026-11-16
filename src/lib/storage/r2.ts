import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter } from './types'

export class R2Storage implements StorageAdapter {
  private client: S3Client
  constructor(private bucket: string, accountId: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  async createUploadUrl(key: string, contentType: string) {
    // R2 không ép được kích thước qua presigned PUT; giới hạn được kiểm ở trình duyệt (nén ảnh).
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: 600 })
  }
  async createDownloadUrl(key: string, expiresSec: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresSec })
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
