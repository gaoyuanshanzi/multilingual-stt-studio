from typing import List
from datetime import datetime

def format_seconds(seconds: float) -> str:
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def generate_txt_content(filename: str, duration: float, segments: List[dict]) -> str:
    lines = [
        f"=== STT 변환 보고서: {filename} ===",
        f"총 재생 시간: {format_seconds(duration)} ({duration:.2f}초)",
        f"생성 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 50,
        ""
    ]
    for seg in segments:
        st = format_seconds(seg.get("start", 0.0))
        et = format_seconds(seg.get("end", 0.0))
        lang = str(seg.get("language", "unk")).upper()
        prob = seg.get("probability", 1.0)
        lines.append(f"[{st} -> {et}] [{lang} (신뢰도: {prob:.2f})] {seg.get('text', '')}")
    return "\n".join(lines)

def generate_html_content(filename: str, duration: float, languages: List[str], segments: List[dict]) -> str:
    lang_colors = {
        "ko": "#2563eb",
        "en": "#16a34a",
        "es": "#ea580c",
        "zh": "#dc2626",
        "ja": "#9333ea",
        "pt": "#db2777",
    }
    cards = []
    for s in segments:
        lang = s.get("language", "unk").lower()
        badge_bg = lang_colors.get(lang, "#4b5563")
        st = format_seconds(s.get("start", 0.0))
        et = format_seconds(s.get("end", 0.0))
        text = s.get("text", "")
        prob = s.get("probability", 1.0)
        card = (
            '<div style="margin-bottom: 12px; padding: 12px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">'
            '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">'
            f'<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #4b5563;">[{st} &rarr; {et}]</span>'
            f'<span style="background: {badge_bg}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase;">{lang}</span>'
            f'<span style="font-size: 11px; color: #9ca3af;">신뢰도: {prob:.2f}</span>'
            '</div>'
            f'<p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6;">{text}</p>'
            '</div>'
        )
        cards.append(card)

    cards_html = "\n".join(cards)
    lang_str = ", ".join(languages)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dur_str = format_seconds(duration)

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>STT Transcript - {filename}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 24px; }}
        .container {{ max-width: 860px; margin: 0 auto; }}
        .header {{ background: white; padding: 20px 24px; border-radius: 12px; border: 1px solid #e5e7eb; margin-bottom: 20px; }}
        h1 {{ margin: 0 0 8px 0; font-size: 22px; color: #111827; }}
        .meta {{ font-size: 13px; color: #6b7280; display: flex; gap: 16px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{filename}</h1>
            <div class="meta">
                <span>총 시간: {dur_str}</span>
                <span>감지된 언어: {lang_str}</span>
                <span>생성: {now_str}</span>
            </div>
        </div>
        <div>
            {cards_html}
        </div>
    </div>
</body>
</html>"""
