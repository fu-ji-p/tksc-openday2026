#!/usr/bin/env python3
"""公式サイトのイベントデータ (events.js) から data/program.json を作る。

    python3 scripts/build_program.py            # 公式サイトから取得
    python3 scripts/build_program.py events.js  # 保存済みファイルから

公式データにあるもの（題名・場所・時間の文面・申込の開始/締切/URL・整理券）はそのまま使い、
公式データに構造化されていないもの（各回の開始/終了時刻、抽選か先着か、結果通知の時期、
ひとこと紹介）はこのファイルの OVERRIDES に手で書いている。

実行すると data/source_snapshot.json（公式データの要点の写し）も更新する。
前回の写しと比べて時間・場所・申込情報が変わったイベントを警告するので、
警告が出たら OVERRIDES の該当イベントを見直すこと。
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

SOURCE_URL = "https://visit-tsukuba.jaxa.jp/2026openday/assets/data/events.js"
SITE_URL = "https://visit-tsukuba.jaxa.jp/2026openday/index.html"
LIST_URL = "https://visit-tsukuba.jaxa.jp/2026openday/event_list.html"
ROOT = Path(__file__).resolve().parent.parent
EVENT_DATE = "2026-11-28"

AREAS = [
    {"id": "E", "name": "Eエリア"},
    {"id": "S", "name": "Sエリア"},
    {"id": "C", "name": "Cエリア"},
    {"id": "W", "name": "Wエリア"},
]

# タイムテーブルの列になる場所（時刻の決まった回があるところだけ）
PLACES = [
    {"id": "SD", "area": "E", "code": "展示館", "building": "展示館", "room": "スペースドーム"},
    {"id": "E2K", "area": "E", "code": "E-2", "building": "広報・情報棟", "room": "記者会見室"},
    {"id": "E2K1", "area": "E", "code": "E-2", "building": "広報・情報棟", "room": "広報普及室１"},
    {"id": "E2F", "area": "E", "code": "E-2", "building": "広報・情報棟", "room": "広報普及室２"},
    {"id": "E2AV", "area": "E", "code": "E-2", "building": "広報・情報棟", "room": "視聴覚室"},
    {"id": "S3", "area": "S", "code": "S-3", "building": "6mφ放射計スペースチャンバ棟", "room": "1階ロビー"},
    {"id": "S4", "area": "S", "code": "S-4", "building": "8mφ放射計スペースチャンバ棟", "room": ""},
    {"id": "S10", "area": "S", "code": "S-10", "building": "総合環境試験棟", "room": "クリーンルーム"},
    {"id": "C1F", "area": "C", "code": "C-1", "building": "総合開発推進棟", "room": "1階 ホワイエ"},
    {"id": "C1S", "area": "C", "code": "C-1", "building": "総合開発推進棟", "room": "1階 小会議室"},
    {"id": "C1S2", "area": "C", "code": "C-1", "building": "総合開発推進棟", "room": "2階 小会議室２"},
    {"id": "C1MB", "area": "C", "code": "C-1", "building": "総合開発推進棟", "room": "2階 中会議室Ｂ"},
    {"id": "C5", "area": "C", "code": "C-5/C-6", "building": "宇宙飛行士養成棟／無重量環境試験棟", "room": ""},
    {"id": "W1", "area": "W", "code": "W-1", "building": "電波試験棟", "room": ""},
    {"id": "W3", "area": "W", "code": "W-3", "building": "宇宙実験棟", "room": "大会議室"},
    {"id": "W4", "area": "W", "code": "W-4", "building": "宇宙ステーション試験棟", "room": "1階"},
]


def slots(place, *pairs, needs=None, sub=None, est=False, prefix=""):
    """時刻の決まった回。pairs は ("10:05", "11:00") の並び。"""
    out = []
    for i, (s, e) in enumerate(pairs, 1):
        d = {"key": f"{prefix}{i}", "label": "①②③④⑤⑥⑦⑧⑨"[i - 1] if len(pairs) > 1 else "", "place": place, "start": s, "end": e}
        if needs:
            d["needs"] = needs
        if sub:
            d["sub"] = sub
        if est:
            d["endEstimated"] = True
        out.append(d)
    return out


def step(start, minutes, count, gap):
    """開始時刻から gap 分おきに count 回、各 minutes 分。"""
    h, m = map(int, start.split(":"))
    t = h * 60 + m
    f = lambda x: f"{x // 60:02d}:{x % 60:02d}"
    return [(f(t + i * gap), f(t + i * gap + minutes)) for i in range(count)]


# no -> 手で補う情報
#   summary    ひとこと紹介（自分の言葉で要約）
#   slots      時刻の決まった回
#   open       出入り自由の時間帯 [["10:00","15:30"]]（省略時は公式の時間文面から読み取る）。None = 出入り自由の部分なし
#   openSub    出入り自由の部分の名前（回と両方あるイベント用）
#   visit      自分で時刻を決めたときの所要時間の初期値（分）
#   method     事前申込の方式 lottery / first / tbd
#   result     結果通知の案内（要約）, resultBy  通知期限 (ISO)
#   applyNote  申込の注意（公式の文面が長いときの要約。省略時は公式の participationNote）
#   tickets    整理券の配布開始時刻 [("12:00", "②の回")]（タイムテーブルに印を出す。公式の ticketTime の文面から読み取る）
# 45・48・50・51 は有人宇宙技術部門・国際宇宙探査センターの申込サイト (tokubetsu-yuutan.jaxa.jp) でまとめて受付。
# 回の時刻は申込フォームの「参加希望イベント」の選択肢で確認（2026-11-20）。
YUUTAN = {"method": "lottery", "result": "11/26(木) までに応募者全員へ当選・落選をメールで通知", "resultBy": "2026-11-26T23:59:00+09:00",
          "applyNote": "申込は4イベント共通のフォーム。各イベント1回まで（48・51 は第3希望まで選べる）、2つのイベントで同じ時間帯は申し込めない。1回につき4名まで。"
                       "\n当選でも通知メールを受信拒否していると落選扱い。11/19〜11/28 は jimukyoku@tokubetsu-yuutan.jaxa.jp からのメールを受け取れるようにしておく。"}

OVERRIDES = {
    "01": {"summary": "H-IIロケット実機を一周しながら解説を聞くツアー。毎時00・20・40分に出発。", "open": [["10:00", "12:00"], ["13:00", "15:30"]], "visit": 20},
    "02": {"summary": "スペースドームを手話で案内するツアー（手話ができる方と同伴者向け）。", "slots": slots("SD", ("10:05", "11:00"), ("11:05", "12:00"), ("13:05", "14:00")),
           "method": "lottery", "result": "11/24(火) 17:00 までに応募者全員へメールで連絡（参加可否と時間帯）", "resultBy": "2026-11-24T17:00:00+09:00"},
    "03": {"summary": "宇宙の質問に手話や筆談で答えるコーナー。宇宙手話の紹介も。", "slots": slots("E2K", ("14:10", "15:30"))},
    "04": {"tickets": [("12:00", "②の回")], "summary": "JAXA女性職員が進路選択やキャリアを語るトーク。①は先着順、②は整理券。",
           "slots": [dict(x, needs=n) for x, n in zip(slots("E2K", ("10:15", "11:00"), ("12:45", "13:30")), ["first", "ticket"])]},
    # 回は予約フォームの「参加希望回」から（公式一覧は 10:00～15:30 のみ）。終了時刻は未公表のため目安。
    "05": {"summary": "衛星画像を織り込んだジーンズの紹介と、ミニチュアの服づくりワークショップ。予約フォームでは 10:30・12:00・13:30 開始の3回から選ぶ。",
           "open": None, "slots": slots("E2K1", *step("10:30", 60, 3, 90), est=True),
           "method": "lottery", "result": "11/17(火) までに当選者のみへメールで通知", "resultBy": "2026-11-17T23:59:00+09:00"},
    "06": {"summary": "「みちびき」と測位の今とこれからをプロジェクトマネージャが話すミニトーク。", "slots": slots("E2F", ("11:00", "12:00"), ("13:00", "14:00")),
           "method": "first", "result": "先着順。公式の案内では「当日までに当選者のみへメールで通知」"},
    "07": {"summary": "地球観測衛星で見る地球の楽しみ方をファミリー向けに話すミニトーク（各回約15分）。", "slots": slots("E2AV", *step("10:00", 15, 6, 30)),
           "method": "first", "result": "先着順（予約できれば確定）。当日参加枠もあり"},
    "08": {"summary": "地球観測衛星のクイズ大会。全問正解でグッズ（各回約20分）。", "slots": slots("E2AV", *step("13:00", 20, 4, 40)),
           "method": "first", "result": "先着順（予約できれば確定）。当日参加枠もあり"},
    "09": {"summary": "アンテナのしくみを博士が実験で説明（約3分）。", "visit": 10},
    "10": {"summary": "年に1回だけ公開される追跡中央管制室の見学ツアー（約10分、15:00受付終了）。", "visit": 15},
    "11": {"summary": "中止になった美笹局特別公開の当選者向け記念品の配布場所。", "visit": 10},
    "12": {"summary": "捕獲をめざす宇宙ごみの実物大タペストリー展示。先着150名。"},
    "13": {"summary": "再使用ロケット実験機 RV-X の映像・パネル展示と、実験主任による講演。", "openSub": "展示",
           "slots": slots("S3", ("11:00", "11:30"), ("12:00", "12:30"), ("13:45", "14:15"), ("14:45", "15:15"), sub="講演")},
    "14": {"summary": "巨大な試験設備スペースチャンバの内部に入れる公開（各回20名）。", "slots": slots("S4", ("10:15", "11:15"), ("11:15", "12:15"), ("13:15", "14:15"), ("14:15", "15:15")),
           "method": "lottery", "result": "11/20(金) までに応募者全員へメールで通知", "resultBy": "2026-11-20T23:59:00+09:00"},
    "15": {"summary": "レーザー光でのデータ送信を体験。衛星通信機器の実物展示も。"},
    "16": {"summary": "宇宙機の電源技術をゲームで体験。"},
    "17": {"summary": "ロケットや衛星を支える小さな電子部品を観察。"},
    "18": {"summary": "宇宙望遠鏡の鏡合わせの精密調整をゲームで体験。"},
    "19": {"summary": "クリーンルームに入って大型衛星試験設備を間近で見る特別ツアー（各回20名）。", "slots": slots("S10", ("10:15", "11:15"), ("11:30", "12:30"), ("12:45", "13:45"), ("14:00", "15:00")),
           "method": "lottery", "result": "11/20(金) までに応募者全員へメールで通知", "resultBy": "2026-11-20T23:59:00+09:00"},
    "20": {"summary": "水ロケットの打上げ体験（工作なし）。受付は午前11:30・午後15:00まで。", "open": [["10:00", "12:00"], ["13:30", "15:30"]], "visit": 20},
    "21": {"summary": "EarthCARE（はくりゅう）のこいのぼり展示。", "visit": 10},
    "22": {"summary": "EarthCARE の実物大タペストリー展示。", "visit": 10},
    # 回は予約ページ (Bookings) の案内から: 10:30 から30分ごとに開始・計8枠・所要約1時間（前後の回と重なる）。
    "23": {"summary": "オリジナル人工衛星を作って自撮りする工作体験（約1時間）。10:30 から30分ごとに開始する8回（各回3組）。",
           "open": None, "slots": slots("C1F", *step("10:30", 60, 8, 30), est=True),
           "method": "first", "result": "先着順（予約できれば確定）。キャンセルが出ると空きが出ます。締切は変更の可能性あり"},
    "24": {"summary": "人工衛星の基礎と、衛星地球観測の重点テーマのポスター紹介。"},
    "25": {"summary": "「きく9号」と歴代「きく」シリーズを模型と動画で紹介。"},
    "26": {"summary": "測位の取り組みをポスター・展示・ミニクイズで紹介。"},
    "27": {"summary": "災害時に活躍する「だいち2号・4号」の観測技術の紹介。"},
    "28": {"summary": "「だいち」の画像から場所を当てるクイズ体験。"},
    "29": {"summary": "クイズと AR で雨の観測（PMM）を体験。ミッションマーク投票も。"},
    "30": {"summary": "いぶき・AMSR シリーズの謎解きで研究員気分を体験。"},
    "31": {"summary": "「いぶき」「いぶきGW」と記念撮影。", "visit": 10},
    "32": {"summary": "打上げ隊の一員になり、制限時間内に打上げ続行か延期かを判断する体験。",
           "slots": slots("C1S", ("10:15", "11:15"), ("11:15", "12:15"), ("12:15", "13:15"), ("13:15", "14:15"), ("14:15", "15:15")),
           "method": "lottery", "result": "11/24(火) に応募者全員へメールで通知", "resultBy": "2026-11-24T23:59:00+09:00"},
    "33": {"summary": "ミニ装置で高度計ライダーのしくみを学ぶ。クイズあり。", "open": [["10:00", "12:00"], ["13:00", "15:30"]]},
    "34": {"tickets": [("10:00", "午前の回"), ("13:00", "午後の回")], "summary": "手作りの「衛星人生すごろく」で地球観測衛星の運用を学ぶ（整理券）。",
           "slots": slots("C1S2", ("10:15", "10:55"), ("11:00", "11:40"), ("11:45", "12:25"), ("13:15", "13:55"), ("14:00", "14:40"), ("14:45", "15:25"), est=True)},
    "35": {"summary": "地球観測データを映像と音楽にした体験展示。"},
    "36": {"summary": "宇宙に残るわずかな大気を燃料にする新しいイオンエンジンの紹介。"},
    "37": {"summary": "EarthCARE のポスター展示。グッズあり。"},
    "38": {"summary": "EarthCARE の観測データを 3D で見る体験。"},
    "39": {"summary": "自分の力で真空を作って、大気との違いを確かめる実験。"},
    "40": {"tickets": [("10:00", "①②③の回"), ("12:00", "④⑤の回")], "summary": "顕微鏡体験（整理券不要）と、宇宙部品と同じ方法で髪の毛を観察する回（整理券）。", "openSub": "顕微鏡体験", "open": [["10:00", "15:30"]],
           "slots": slots("C1MB", *step("10:30", 30, 5, 60), sub="髪の毛観察", needs="ticket")},
    "41": {"summary": "ロケットや衛星に載る JAXA 認定部品の紹介。"},
    "42": {"summary": "デブリ衝突試験の映像と貫通痕の展示。簡単デブリ講座も。"},
    "43": {"summary": "手のひらサイズの衛星 CubeSat を模型と映像で紹介。"},
    "44": {"summary": "惑星保護とは何か、探査機の「見えない汚れ」を紹介。"},
    "45": {"tickets": [("10:00", "ミーティング")], "summary": "諏訪宇宙飛行士のミッション応援企画。入退場自由の体験エリアのほか、専門家と話すラウンジ（事前申込）と整理券制のミーティングがある。",
           "openSub": "ミッション\"つなぐ\"（入退場自由）",
           "slots": slots("C5", ("11:00", "11:30"), ("11:40", "12:10"), ("13:00", "13:30"), ("13:40", "14:10"), sub="ラウンジ\"つなぐ\"", needs="apply", prefix="L")
           + [dict(x, key="M") for x in slots("C5", ("14:30", "15:00"), sub="ミーティング\"つなぐ\"", needs="ticket")],
           **YUUTAN},
    "46": {"summary": "トゲトゲに囲まれた電波試験設備の内部を見学（各回20名）。", "slots": slots("W1", ("10:15", "11:15"), ("11:15", "12:15"), ("13:15", "14:15"), ("14:15", "15:15")),
           "method": "lottery", "result": "11/20(金) までに応募者全員へメールで通知", "resultBy": "2026-11-20T23:59:00+09:00"},
    "47": {"summary": "「きぼう」や HTV-X の管制室を見学できるツアー（最終入場15:00）。", "visit": 30},
    "48": {"summary": "油井宇宙飛行士の講演。ISS での生活や宇宙からの景色の話。", "slots": slots("W3", ("10:30", "11:15"), ("13:15", "14:00"), ("14:30", "15:15")), **YUUTAN},
    "49": {"summary": "「きぼう」での宇宙実験の紹介。ミニセミナーやクイズも。"},
    "50": {"summary": "宇宙飛行士・宇宙キャスターと未来の宇宙実験を考えるイベント。", "slots": slots("W3", ("11:45", "12:30")), **YUUTAN},
    "51": {"summary": "有人与圧ローバーの模型・パネル展示とドライビングシミュレータ（本格版は事前申込の8回、簡易版は予約なし）。",
           "openSub": "展示・簡易シミュレータ（予約なし）",
           "slots": slots("W4", ("10:20", "10:50"), ("11:00", "11:30"), ("11:40", "12:10"), ("12:20", "12:50"), ("13:00", "13:30"), ("13:40", "14:10"), ("14:20", "14:50"), ("15:00", "15:20"),
                          sub="本格ドライビングシミュレータ", needs="apply"),
           **YUUTAN},
    "52": {"summary": "月探査 LUPEX を 3D 立体映像で紹介。"},
    "53": {"summary": "補給機 HTV-X と自動ドッキング実証 JDOCX の展示。"},
    "54": {"summary": "HTV-X を ISS まで誘導する運用体験ゲーム。"},
    "55": {"summary": "HTV-X の愛称を決める投票。", "visit": 10},
    "56": {"summary": "国際宇宙探査センターの活動紹介。なぞ解きも。"},
    "57": {"summary": "複数の建物を回るなぞ解きゲーム。用紙は C-1 総合開発推進棟前で配布（最終回は14:50から）。", "visit": 60},
    "58": {"summary": "Int-Ball2 や TUSK など、ISS で宇宙飛行士を支えるロボットや設備の展示。"},
}

SNAPSHOT_FIELDS = [
    "title", "areas", "participation", "applyTarget", "ticketTarget", "participationNote", "status", "place", "time",
    "target", "capacity", "note", "applyStatus", "applyStart", "applyEnd", "applyUrl", "applyAfterCloseNotice",
    "ticketCount", "ticketTime", "ticketPlace", "firstCome",
]


def load_source(arg):
    if arg:
        text = Path(arg).read_text(encoding="utf-8-sig")
    else:
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
        text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8-sig")
    body = text[text.index("{", text.index("window.OPEN_DAY_2026")):].rstrip().rstrip(";")
    body = re.sub(r",(\s*[\]}])", r"\1", body)  # 公式ファイルは末尾カンマを含む
    return json.loads(body)


def clean(s):
    return re.sub(r"[ 　]+", " ", (s or "").replace("\n", " ")).strip()


def lines(s):
    return "\n".join(x.strip() for x in (s or "").split("\n") if x.strip())


def open_ranges(time_text):
    m = re.search(r"(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})", time_text)
    return [[m.group(1).zfill(5), m.group(2).zfill(5)]] if m else [["10:00", "15:30"]]


def main():
    src = load_source(sys.argv[1] if len(sys.argv) > 1 else None)
    published = [e for e in src["events"] if e.get("published")]
    events, sessions, snapshot, warnings = [], [], {}, []

    snap_path = ROOT / "data" / "source_snapshot.json"
    old = json.loads(snap_path.read_text(encoding="utf-8")) if snap_path.exists() else {}

    for e in published:
        no = e["number"]
        ov = OVERRIDES.get(no)
        if ov is None:
            warnings.append(f"{no}: OVERRIDES に無い新しいイベント（出入り自由として登録）")
            ov = {}
        snapshot[no] = {k: e.get(k) for k in SNAPSHOT_FIELDS}
        if no in old:
            changed = [k for k in SNAPSHOT_FIELDS if old[no].get(k) != snapshot[no][k]]
            if changed:
                warnings.append(f"{no}: 公式データが変わりました → {', '.join(changed)}")

        part = e.get("participation") or []
        ev = {
            "no": no,
            "title": clean(e["title"]),
            "areas": e["areas"],
            "categories": list(dict.fromkeys(e.get("categories") or [])),
            "placeText": lines(e.get("place")),
            "timeText": lines(e.get("time")),
            "summary": ov.get("summary", ""),
            "participation": part,
        }
        for k_src, k in [("note", "note"), ("target", "target"), ("capacity", "capacity"), ("duration", "duration"), ("firstCome", "firstCome"), ("status", "status")]:
            if lines(e.get(k_src)):
                ev[k] = lines(e[k_src])
        if "事前申込" in part:
            ap = {"method": ov.get("method", "tbd"), "pending": clean(e.get("applyStatus")) == "準備中" or not e.get("applyUrl")}
            if e.get("applyTarget"):
                ap["target"] = e["applyTarget"]
            if e.get("applyStart"):
                ap["start"] = e["applyStart"]
            if e.get("applyEnd"):
                ap["end"] = e["applyEnd"]
            if e.get("applyUrl"):
                ap["url"] = e["applyUrl"]
            if ov.get("applyNote"):
                ap["note"] = ov["applyNote"]
            elif lines(e.get("participationNote")):
                ap["note"] = lines(e["participationNote"])
            if ov.get("result"):
                ap["result"] = ov["result"]
            if ov.get("resultBy"):
                ap["resultBy"] = ov["resultBy"]
            ev["apply"] = ap
        if "整理券" in part:
            tk = {"time": lines(e.get("ticketTime")), "place": lines(e.get("ticketPlace"))}
            if e.get("ticketTarget"):
                tk["target"] = e["ticketTarget"]
            if e.get("ticketCount"):
                tk["count"] = e["ticketCount"]
            ev["ticket"] = tk
        events.append(ev)

        sl = ov.get("slots", [])
        has_open = "open" in ov or not sl or "openSub" in ov
        if ov.get("open", 1) is None:
            has_open = False
        if has_open:
            ranges = ov.get("open") or open_ranges(ev["timeText"])
            s = {"id": no, "event": no, "open": True, "area": e["areas"][0], "start": ranges[0][0], "end": ranges[-1][1], "visit": ov.get("visit", 30)}
            if len(ranges) > 1:
                s["hours"] = ranges
            if ov.get("openSub"):
                s["sub"] = ov["openSub"]
            elif "apply" in ev and "target" not in ev["apply"]:
                s["needs"] = "apply"
            sessions.append(s)
        for x in sl:
            s = {"id": f"{no}/{x['key']}", "event": no, "open": False, "place": x["place"], "start": x["start"], "end": x["end"]}
            for k in ("label", "sub", "endEstimated"):
                if x.get(k):
                    s[k] = x[k]
            needs = x.get("needs")
            if not needs and "apply" in ev and "target" not in ev["apply"]:
                needs = "apply"
            if not needs and "ticket" in ev and "target" not in ev["ticket"]:
                needs = "ticket"
            if needs:
                s["needs"] = needs
            sessions.append(s)
        if "ticket" in ev and ov.get("tickets"):
            # 印を出す列 = 整理券が必要な回の場所
            col = next((x["place"] for x in sl if x.get("needs") == "ticket" or "target" not in ev["ticket"]), None)
            if col:
                ev["ticket"]["slots"] = [{"time": t, "note": n, "place": col} for t, n in ov["tickets"]]
        elif "ticket" in ev:
            warnings.append(f"{no}: 整理券の配布時刻 (tickets) が OVERRIDES に無い")

    for no in OVERRIDES:
        if no not in snapshot:
            warnings.append(f"{no}: OVERRIDES にあるが公式データに無い（非公開または削除）")

    # 整合チェック
    place_ids = {p["id"] for p in PLACES}
    ids = [s["id"] for s in sessions]
    assert len(ids) == len(set(ids)), "セッション ID が重複"
    to_min = lambda t: int(t[:2]) * 60 + int(t[3:])
    fixed = [s for s in sessions if not s["open"]]
    for s in fixed:
        assert s["place"] in place_ids, s
        assert 600 <= to_min(s["start"]) < to_min(s["end"]) <= 930 and to_min(s["start"]) % 5 == 0 and to_min(s["end"]) % 5 == 0, s
    for a in fixed:
        for b in fixed:
            # 同じイベントの回が重なるのは可（30分ごとに始まる所要1時間の体験など。画面では次の回の開始までを描く）
            if a["id"] < b["id"] and a["event"] != b["event"] and a["place"] == b["place"] and to_min(a["start"]) < to_min(b["end"]) and to_min(b["start"]) < to_min(a["end"]):
                raise AssertionError(f"同じ場所で時間が重なる: {a['id']} {b['id']}")

    program = {
        "event": {
            "name": "JAXA筑波宇宙センター特別公開2026",
            "date": EVENT_DATE,
            "open": "10:00",
            "close": "15:30",
            "lastEntry": src["site"].get("lastEntry", "15:00"),
            "site": SITE_URL,
            "listUrl": LIST_URL,
            "generatedFrom": [SOURCE_URL],
            "generatedAt": date.today().isoformat(),
        },
        "areas": AREAS,
        "places": PLACES,
        "events": events,
        "sessions": sessions,
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "program.json").write_text(json.dumps(program, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    snap_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    n_apply = sum(1 for e in events if "apply" in e)
    n_ticket = sum(1 for e in events if "ticket" in e)
    print(f"イベント {len(events)} 件 / 事前申込 {n_apply} 件 / 整理券 {n_ticket} 件 / セッション {len(sessions)} 件（時刻固定 {len(fixed)}、出入り自由 {len(sessions) - len(fixed)}）")
    for w in warnings:
        print("⚠", w)


if __name__ == "__main__":
    main()
