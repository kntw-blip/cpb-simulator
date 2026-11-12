# 人工心肺シミュレータ / CPB Simulator

心臓血管外科手術における人工心肺（体外循環）操作を、ブラウザ上で手術開始から終了まで通して練習できるトレーニング用シミュレータです。主に新人の臨床工学技士を対象としています。

A browser-based training simulator for operating the heart-lung machine through a whole cardiac operation. English UI is available from the language button. See [English summary](#english-summary).

> **注意**: 教育・訓練用です。数値モデルは簡略化されており、臨床判断や機器設定の根拠には使用できません。

## できること

- **モニター**: 生体情報モニター（心電図・動脈圧・CVP・SpO₂・体温）、脳局所酸素飽和度（rSO₂）、術野モニター
- **人工心肺装置の操作**: 送血ポンプ（ローラー／遠心を選択）、送血クランプ、脱血オクルーダー、リザーバー、ガスブレンダー、冷温水槽、サクション・ベントポンプ、心筋保護回路（血液併用／晶質液、順行性／逆行性）、血液濃縮
- **CDI（連続血液ガスモニター）**: 動脈側・静脈側センサーの連続表示、採血結果による校正（ストア → 採血 → 校正）
- **検査・投与**: ACT、動脈血・静脈血の採血による血液ガス、昇圧薬・降圧薬、補液、赤血球液、炭酸水素Na、ヘパリン追加
- **シナリオ**: 心停止下CABG ×3（プレバイパスチェック → ヘパリン・ACT → カニュレーション → 体外循環開始 → 冷却 → 大動脈遮断・心筋保護 → 末梢側吻合 → 遮断解除 → 中枢側吻合・復温 → 離脱 → プロタミン）
- **チームとのやり取り**: 術者・麻酔科からの指示と、技士からのコール
- **評価**: 操作ガイド（表示切替可）、アラーム、減点ルール、終了後のデブリーフィング（スコア・減点項目・トレンド）
- 画面の各フレームはドラッグ（またはタップ2回）で入れ替え可能。配置はブラウザに保存
- 手術の待ち時間は短縮されており、速度（×1〜×30）も変更できます

弁置換・大血管手術のシナリオは今後追加予定です。

## 使い方

```bash
npm install
npm run dev      # 開発サーバー
npm test         # モデルとシナリオの自動テスト
npm run build    # dist/ に静的ファイルを出力
```

`main` ブランチに push すると、`.github/workflows/deploy.yml` により GitHub Pages へ自動公開されます（リポジトリの Settings → Pages → Source を「GitHub Actions」に設定）。

## 構成

| パス | 内容 |
| --- | --- |
| `src/sim/model.ts` | 患者と人工心肺回路の数値モデル |
| `src/sim/engine.ts` | 時間進行、シナリオ実行、アラーム、減点ルール |
| `src/sim/scenarios/cabg.ts` | CABGシナリオ |
| `src/ui/` | 画面（モニター、回路図、操作パネル、デブリーフィング） |
| `src/i18n.ts` | 日本語・英語の文言 |
| `tests/` | 理想的な操作を行う自動操作によるシナリオ完走テスト |
| `docs/MODEL.md` | モデルの前提と、臨床的な確認が必要な項目 |

## English summary

A lumped-parameter patient model (hemodynamics, gas exchange, temperature, anticoagulation, electrolytes, cerebral oximetry) is coupled to a heart-lung machine model (roller or centrifugal arterial pump, venous occluder, reservoir, gas blender, heater-cooler, suction and vent pumps, cardioplegia, hemoconcentrator). An arrested-heart CABG scenario runs from the pre-bypass checklist to protamine, with requests from the surgeon and anesthesiologist, alarms, scoring rules and a debriefing screen. For education only; not for clinical use.

## ライセンス / License

MIT License
