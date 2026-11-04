"""
EarthCam Live Stream Proxy Engine (High Fidelity Base64 Router)
Proxies the live Times Square HLS (.m3u8 / .ts) stream directly from EarthCam's servers
without query parameter token corruption or cross-origin blocks.
"""

import base64
import json
import re
import time
from typing import Optional
import requests
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/stream/earthcam", tags=["EarthCam Live Stream"])

EARTHCAM_PAGE = "https://www.earthcam.com/cams/newyork/timessquare/?cam=tsrobo1"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://www.earthcam.com/",
    "Origin": "https://www.earthcam.com",
}

_cache = {
    "stream_url": None,
    "base_url": None,
    "last_fetched": 0,
}


def b64_encode(s: str) -> str:
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("utf-8")


def b64_decode(s: str) -> str:
    return base64.urlsafe_b64decode(s.encode("utf-8")).decode("utf-8")


def fetch_fresh_stream_url() -> tuple:
    """Extracts the active tokenized m3u8 stream from EarthCam's HTML config."""
    now = time.time()
    if _cache["stream_url"] and (now - _cache["last_fetched"]) < 50:
        return _cache["stream_url"], _cache["base_url"]

    try:
        r = requests.get(EARTHCAM_PAGE, headers=HEADERS, timeout=8)
        match = re.search(r"var\s+json_base\s*=\s*(\{.*?\});\s*(?:var|//)", r.text, re.DOTALL)
        if not match:
            raise ValueError("json_base variable not found in EarthCam page")

        data = json.loads(match.group(1))
        # Prefer tsrobo1 or tsnorth4k
        cam_info = data.get("cam", {}).get("tsrobo1", {}) or data.get("cam", {}).get("tsnorth4k", {})
        stream_url = cam_info.get("stream") or cam_info.get("html5_streampath")
        if not stream_url or "m3u8" not in stream_url:
            raise ValueError(f"No valid m3u8 stream found: {stream_url}")

        base_url = stream_url.split("playlist.m3u8")[0]
        _cache["stream_url"] = stream_url
        _cache["base_url"] = base_url
        _cache["last_fetched"] = now
        print(f"[EarthCam Proxy] Connected to fresh stream: {stream_url[:80]}...")
        return stream_url, base_url
    except Exception as e:
        print(f"[EarthCam Proxy Error] Failed to refresh stream token: {e}")
        if _cache["stream_url"]:
            return _cache["stream_url"], _cache["base_url"]
        raise HTTPException(status_code=502, detail=f"Unable to reach EarthCam stream: {e}")


@router.get("/live.m3u8")
def get_master_playlist():
    """Returns rewritten master HLS playlist pointing chunklists to this proxy."""
    stream_url, base_url = fetch_fresh_stream_url()
    try:
        r = requests.get(stream_url, headers=HEADERS, timeout=6)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="EarthCam upstream rejected playlist request")

        rewritten_lines = []
        for line in r.text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                rewritten_lines.append(line)
            else:
                full_chunklist_url = line if line.startswith("http") else base_url + line
                token_b64 = b64_encode(full_chunklist_url)
                proxy_chunklist = f"/api/stream/earthcam/chunklist.m3u8?b={token_b64}"
                rewritten_lines.append(proxy_chunklist)

        content = "\n".join(rewritten_lines)
        return Response(
            content=content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunklist.m3u8")
def get_chunklist(b: Optional[str] = None, url: Optional[str] = None):
    """Returns rewritten chunklist pointing .ts video segments to this proxy."""
    if b:
        chunklist_url = b64_decode(b)
    elif url:
        chunklist_url = url
    else:
        raise HTTPException(status_code=400, detail="Missing url or b parameter")

    base_chunk_url = chunklist_url.split("chunklist")[0]

    try:
        r = requests.get(chunklist_url, headers=HEADERS, timeout=6)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=f"Failed to fetch chunklist (HTTP {r.status_code})")

        rewritten_lines = []
        for line in r.text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                rewritten_lines.append(line)
            else:
                full_ts_url = line if line.startswith("http") else base_chunk_url + line
                token_b64 = b64_encode(full_ts_url)
                proxy_ts = f"/api/stream/earthcam/segment.ts?b={token_b64}"
                rewritten_lines.append(proxy_ts)

        content = "\n".join(rewritten_lines)
        return Response(
            content=content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/segment.ts")
def get_segment(b: Optional[str] = None, url: Optional[str] = None):
    """Proxies the MPEG-TS video byte stream without token corruption."""
    if b:
        ts_url = b64_decode(b)
    elif url:
        ts_url = url
    else:
        raise HTTPException(status_code=400, detail="Missing url or b parameter")

    def iter_stream():
        with requests.get(ts_url, headers=HEADERS, stream=True, timeout=8) as r:
            for chunk in r.iter_content(chunk_size=32768):
                if chunk:
                    yield chunk

    return StreamingResponse(
        iter_stream(),
        media_type="video/MP2T",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
        },
    )
