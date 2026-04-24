"""
Copy all objects from R2 bucket `assetiq-files` to `assetiq-files-uat`.

Usage:
    python r2_copy_to_uat.py --check       # verify read/write access to both buckets
    python r2_copy_to_uat.py --copy        # perform full copy
    python r2_copy_to_uat.py --copy --limit 5   # copy only 5 objects (test)
"""
import os
import sys
import argparse
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

ENDPOINT = os.environ["R2_ENDPOINT"]
ACCESS_KEY = os.environ["R2_ACCESS_KEY"]
SECRET_KEY = os.environ["R2_SECRET_KEY"]
SRC_BUCKET = os.environ.get("R2_BUCKET", "assetiq-files")
DST_BUCKET = "assetiq-files-uat"

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=Config(signature_version="s3v4", retries={"max_attempts": 5}),
    region_name="auto",
)


def check_access():
    ok = True
    for b in (SRC_BUCKET, DST_BUCKET):
        try:
            s3.head_bucket(Bucket=b)
            print(f"[OK] head_bucket {b}")
        except ClientError as e:
            ok = False
            print(f"[FAIL] head_bucket {b}: {e.response['Error']}")
    try:
        resp = s3.list_objects_v2(Bucket=SRC_BUCKET, MaxKeys=3)
        print(f"[OK] list {SRC_BUCKET}: {resp.get('KeyCount', 0)} keys (sample)")
    except ClientError as e:
        ok = False
        print(f"[FAIL] list {SRC_BUCKET}: {e.response['Error']}")
    # write probe
    try:
        s3.put_object(Bucket=DST_BUCKET, Key=".access-probe", Body=b"probe")
        s3.delete_object(Bucket=DST_BUCKET, Key=".access-probe")
        print(f"[OK] write+delete probe on {DST_BUCKET}")
    except ClientError as e:
        ok = False
        print(f"[FAIL] write probe on {DST_BUCKET}: {e.response['Error']}")
    return ok


def iter_keys(bucket):
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []) or []:
            yield obj["Key"], obj["Size"]


def existing_keys(bucket):
    keys = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []) or []:
            keys[obj["Key"]] = obj["Size"]
    return keys


def copy_all(limit=None):
    if not check_access():
        print("Aborting: access check failed")
        sys.exit(2)

    print(f"\nIndexing destination bucket {DST_BUCKET}...")
    dst_keys = existing_keys(DST_BUCKET)
    print(f"Destination already has {len(dst_keys)} objects")

    copied = skipped = failed = 0
    total_bytes = 0
    for i, (key, size) in enumerate(iter_keys(SRC_BUCKET), 1):
        if limit and copied + skipped >= limit:
            break
        if dst_keys.get(key) == size:
            skipped += 1
            if skipped % 100 == 0:
                print(f"  skipped {skipped} (already present)")
            continue
        try:
            s3.copy_object(
                Bucket=DST_BUCKET,
                Key=key,
                CopySource={"Bucket": SRC_BUCKET, "Key": key},
            )
            copied += 1
            total_bytes += size
            if copied % 50 == 0:
                print(f"  copied {copied} ({total_bytes/1_000_000:.1f} MB)")
        except ClientError as e:
            failed += 1
            print(f"[FAIL] {key}: {e.response['Error'].get('Code')} {e.response['Error'].get('Message')}")
            if failed > 10:
                print("Too many failures, aborting")
                break

    print("\n=== SUMMARY ===")
    print(f"Copied : {copied}")
    print(f"Skipped: {skipped}")
    print(f"Failed : {failed}")
    print(f"Bytes  : {total_bytes:,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--copy", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if args.check and not args.copy:
        sys.exit(0 if check_access() else 2)
    elif args.copy:
        copy_all(limit=args.limit)
    else:
        parser.print_help()
