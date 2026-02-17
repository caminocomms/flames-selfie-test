import boto3
from botocore.client import Config


class S3Storage:
    def __init__(
        self,
        endpoint_url: str,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        public_base_url: str,
    ) -> None:
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return f"{self.public_base_url}/{key}"

    def delete_object(self, key: str) -> None:
        if not key:
            return
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def presigned_get_url(
        self,
        key: str,
        expires_in: int,
        download_filename: str | None = None,
    ) -> str:
        params = {
            "Bucket": self.bucket,
            "Key": key,
        }
        if download_filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{download_filename}"'
        return self.client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
