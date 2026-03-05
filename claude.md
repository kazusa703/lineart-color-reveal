# Project: LineArt Color Reveal (Working Title)

写真を「ミニマル線画（影ほぼ無し）」に変換し、ベースを白黒化したうえで、ユーザーが選択した領域だけ元写真の色を復元できるWebサービスを作る。

- 最優先: **ログイン不要**
- 重要: **赤字回避（AI呼び出し回数と解像度を制御）**
- 収益: **クレジット制**（高解像度書き出し等で消費）
- 対象: 人物に限定しない（物・風景なども含む）

## Core User Flow (MVP)
1. Upload: ユーザーが画像をアップロード
2. Generate: サーバで「ミニマル線画」を1回生成（原価がかかる処理）
3. Edit (Client-side): 
   - 生成された線画をグレースケール化（白黒ベース）
   - ブラシでマスクを塗り、塗った領域のみ **元写真の色を復元**
   - Undo/Redo、ズーム、ブラシサイズ、Feather(ぼかし)
4. Export:
   - 1024px: 低コスト（基本はクライアント書き出し）
   - 2048/4096px: クレジット消費で書き出し（サーバ処理を使う場合はここに寄せる）

## Monetization / Credits (Draft)
クレジットは「原価がかかる処理」にのみ紐づける。
推奨案（初期）:
- 1024px: 生成済みなら何回でも書き出しOK（塗り直しで課金が増える事故を防ぐ）
- 線画生成: 1クレジット（or 無料枠なしで最初から課金も検討）
- 2048px: +1クレジット
- 4096px: +3クレジット

※「初回のみ無料」はログイン無し���と乱用され得るため、将来的に廃止/縮小する判断を前提に設計する。

## Anti-abuse (No-login priority)
ログイン無しを維持しつつ赤字を避けるための抑止策:
- ブラウザトークン（cookie/localStorage）で簡易的な利用制限
- サーバ側で利用履歴を保存（IPハッシュ + user-agent + 端末指標のハッシュ等）
- レート制限（短時間の連続生成を拒否）
- 画像サイズ上限・ファイルサイズ上限
- 生成ジョブのキュー制御（同一指標の並列数制限）

## Key Differentiation (Based on competitor research)
競合は「線画化」と「Selective Color」が別体験になりがち。
本プロダクトは以下を一気通貫にする:
- 写真 → **ミニマル線画** → **白黒ベース** → **選択領域だけ元色復元** → 書き出し

競合メモ（提供URLから）:
- Line Art / Sketch:
  - VanceAI Line Drawing Maker: 日本語対応、精度高い線画生成
  - Fotor Photo to Sketch: ワンクリック + 多スタイル
  - RapidResizer Photostencil: シンプルUI、純白黒の型紙・ステンシル寄り
  - BeFunky Photo-to-Art: Sketch/Line Artフィルタが強い
- Selective Color:
  - Adobe Express Color Splash: ブラウザで簡単、Adobe AI
  - Pixlr: 多機能エディタ、AI領域選択が強い
  - Photoroom B&W background: 被写体認識で背景だけ白黒が速い
- Vectorize:
  - Vectorizer.ai: 高品質なベクター化（SVG）

## Technical Principles (MVP)
### Cost control
- **AIサーバ呼び出しは基本「線画生成の1回だけ」**にする
- マスク編集・合成・プレビューはクライアント実行（原価ゼロ）
- サーバ処理が必要な場合は「高解像度書き出し」に限定する

### Editing model
- 入力: original image (RGB)
- generated: line_art image (RGB or RGBA)
- mask: single-channel (0..255)
- output:
  - base = grayscale(line_art)  ※白黒ベース
  - color_layer = original
  - final = mix(base, color_layer, mask)

### Storage (suggested)
- original image: object storage
- line_art result: object storage
- mask: small PNG / WebP / compressed representation
- job metadata: DB (credits, timestamps, abuse signals)

## MVP UI (Minimum)
- Upload page
- Editor page
  - Canvas preview
  - Brush tool (size)
  - Eraser tool
  - Undo/Redo
  - Zoom/Pan
  - Feather slider (optional)
- Export modal
  - 1024 / 2048 / 4096
  - credit cost display
  - purchase credits CTA

## Open questions (to resolve before coding)
1. Hosting target for "Claude Code CLI" (Cloudflare / Vercel / AWS / GCP など)の実体が何か
2. Payment provider (Stripeが第一候補)
3. Whether 1024px export is always free or always paid (重要: 乱用とUXのバランス)
4. Line art generation approach:
   - Option A: External API (faster to ship, per-call cost)
   - Option B: Self-hosted model (GPU cost, ops負担)
   - MVPはAで開始し、当たったらBを検討

## Repo conventions (recommended)
- /apps/web : frontend
- /apps/api : backend (if separated)
- /packages/shared : shared types/utils
- .env.example : env template (no secrets)
- README.md : setup + run + deploy

---
This file is the project contract. Implementations should follow this document first, and any deviations must be written back here as updates.