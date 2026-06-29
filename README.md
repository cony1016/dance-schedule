# 💃 ダンススタジオ 月次スケジュール

Google Drive の画像から自動生成されるダンスクラスカレンダーです。

## 🌐 公開URL
**https://cony1016.github.io/dance-schedule/**

## ⚙️ 自動更新の仕組み

```
毎月末日 23:00 JST
    ↓
GitHub Actions 起動
    ↓
Google Drive から画像取得 (Schedule_img/{yyyymm}/)
    ↓
Claude API で画像を読み取り・スケジュール抽出
    ↓
HTMLカレンダー生成
    ↓
GitHub Pages に自動デプロイ
```

## 📁 Google Drive フォルダ構成

```
Dance_Schedule_Asistant/
└── Schedule_img/
    └── 202608/   ← 毎月ここに画像を入れる
        ├── 土曜4日.jpg
        ├── 土曜11日.jpg
        └── ...
```

## 🔑 必要なシークレット（GitHub Settings > Secrets）

| シークレット名 | 内容 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウントのJSONキー |
| `ANTHROPIC_API_KEY` | Claude API キー |
| `GDRIVE_FOLDER_ID` | Dance_Schedule_Asistant フォルダID |

## 🚀 手動実行

Actions タブ → 「月次ダンススケジュール更新」→ 「Run workflow」
対象年月を入力（例: `202608`）して実行できます。

## 📅 月末の作業

1. Google Drive の `Schedule_img/202608/` に画像をアップロード
2. 月末日 23:00 に自動実行される（または手動で実行）
3. 数分後に GitHub Pages が更新される
