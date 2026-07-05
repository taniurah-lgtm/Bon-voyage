---
id: sample-id                 # ファイル名と一致させる(半角英数・ハイフン)
nickname: ○○ファミリー
home_station: 最寄駅(路線)
home_city: 市区町村
transport: [walk, bike, train, car]   # 使うものだけ
coverage: tama                # neighborhood | city | tama | tama_plus_tokyo | kanto_drive
camp_ok: false
camp_drive_hours: 2.5         # camp_ok=true のとき有効
categories: [summer_festival, fireworks, pool_water]  # 上のカテゴリ語彙から
kids:
  - age: 0                    # 子どもの人数ぶん並べる
stroller_needed: true
diaper_care: false            # オムツ配慮が要る子がいるか
weekday_ok: false             # 平日もおでかけ可能か
budget: mixed                 # free_first | mixed | premium_ok
frequency: 1x_week            # 2x_week | 1x_week
delivery: manual              # line | email | manual
# contact(実名・連絡先)はここに書かない。宛先はオーナーがフォーム回答シート等で別管理する。
# どうしても紐付けメモが要るなら profiles/contacts.local.md 等(.gitignoreでGit管理外)に置く。
active: true
---

## 自由メモ
（混雑が苦手・車移動が多い・特定ジャンルが好き 等、レポートの出し分けに効く情報を書く）
