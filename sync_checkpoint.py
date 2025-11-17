import json
import re
from urllib.parse import urlparse, parse_qs

def normalize_udemy_url(url):
    parsed = urlparse(url)
    path = parsed.path
    qs = parse_qs(parsed.query)

    # Kiểm tra nếu là link tracking hoặc có chuỗi thừa
    if "utm_" in url or "im_ref" in url or "irpid" in url or "afsrc" in url or "&" in url:
        coupon = qs.get("couponCode", [""])[0]
        if "/course/" in path and coupon:
            return f"https://www.udemy.com{path}?couponCode={coupon}"
        elif "/course/" in path:
            return f"https://www.udemy.com{path}"
        else:
            return None

    # Nếu đã là dạng chuẩn
    return url if url.startswith("https://www.udemy.com/course/") else None


def sync_checkpoint(file_path="checkpoint.json"):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    urls = data.get("processed", [])
    normalized = []

    for url in urls:
        new_url = normalize_udemy_url(url)
        if new_url:
            normalized.append(new_url)

    # Lọc trùng
    # old way:
    # unique_urls = sorted(list(set(normalized)))
    # filter base on path, prefer ones with couponCode
    unique_map = {}
    for url in normalized:
        p = urlparse(url)
        # use path (case-insensitive, without trailing slash) as dedupe key
        key = p.path.rstrip('/').lower()
        qs = parse_qs(p.query)

        if key not in unique_map:
            unique_map[key] = url

    unique_urls = list(unique_map.values())

    # Cập nhật lại file
    data["processed"] = unique_urls
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Đã chuẩn hóa và đồng bộ {len(unique_urls)} khóa học hợp lệ trong {file_path}")


if __name__ == "__main__":
    sync_checkpoint("checkpoint.json")
