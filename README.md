# IMG株式会社 社内ポータル

塗装・防水工事の社内向け画面です。見積、現場・案件、出張・準備、契約・書類、請求、売上・粗利、現場写真、確認待ち、得意先を扱います。

メールの送信、宿泊の予約、天候の自動取得、音声報告はしません。社外へ出すものは下書きで、担当者が確認します。

公開URL（GitHub Pages）: https://tadashi2531-dev.github.io/img-portal/

## 守ること

見積メールは **下書きを作って、担当者が確認してから** 出します。このアプリに送信ボタンはありません。画面の「メール下書きを作る」は件名と本文をコピーするだけで、メールは送りません。

画面に出る注意書き: 「送信は担当者が確認してから。この画面からは送信しません。」

## ログイン

メールアドレスとパスワードで入ります。新規登録のフォームはありません。使う人は、管理者が Supabase から招待します。

## 見積でできること

- 一覧（現場名・顧客・件名・見積番号で検索。状態は 下書き / 提出済み / 受注 / 失注）
- 新規作成。見積番号は `EST-2026-001` のように年と連番を提案します
- 過去の見積りをベースに、新しい下書きを作る
- 明細（品名、仕様、数量、単位、単価、金額）。単位は候補から選ぶか、そのまま入力できます
- 小計、消費税（初期値 10%）、合計を自動計算して保存します
- 印刷、またはブラウザから PDF 保存
- 削除（確認あり）

発行元は **IMG株式会社**（塗装・防水工事）です。住所・電話・登録番号はまだ入れていません。

## ほかの画面

- 現場・案件: 予定・実行・完了、日別工程（作業内容、塗料、担当、時間）、原価、見積の紐づけ
- 出張・準備: 日程、宿と移動のメモ、持ち物チェック。手配はしない
- 契約・書類: 注文書・契約書などの状態。ファイルは非公開バケット `documents`
- 請求: 見積からの下書き、印刷、メール下書き。送信はしない
- 売上・粗利: 提出済み・入金済の請求を売上、案件の原価との差を粗利
- 現場写真: 下塗り、上塗り1回目、上塗り2回目、塗り終わり、その他。非公開バケット `site-photos`
- 確認待ち: 見積・請求・書類・出張メモ。確認しても送信しない

確認待ちの画面から「架空の見本を入れる」と、名前が「架空）」で始まる見本を入れられます。実在の顧客ではありません。

追加テーブルは `jobs`, `job_days`, `job_costs`, `trips`, `trip_checks`, `documents`, `invoices`, `invoice_items`, `site_photos` です。見積には案件の紐づけと確認待ちの列を足しています。本番のマイグレーション名は `portal_operations`（記録上の版 `20261127115210`）です。リポジトリのファイル名は `20261127120000_portal_operations.sql` です。本番へ再実行しないでください。

## 利用者を招待する（Supabase）

プロジェクト: [img-portal](https://supabase.com/dashboard/project/unaeywdkcsoezhigeueh)

1. Authentication の Users を開く。
2. 利用者を Invite（招待）する。届いたメールからパスワードを設定してもらう。
3. Email のログインが有効であることを確認する。
4. 勝手な新規登録を止めるなら、サインアップを許可する設定をオフにする。招待は管理者が行う。
5. URL の設定を次にする。
   - Site URL: `https://tadashi2531-dev.github.io/img-portal/`
   - Redirect URLs: `https://tadashi2531-dev.github.io/img-portal/`

データはログインした人だけが読み書きできます。未ログイン（anon）には権限がありません。ブラウザに入っているのは公開用の publishable key です。サービスロールの鍵はリポジトリに置いていません。

## ローカルで動かす

```bash
npm ci
npm run dev
```

開発サーバーは http://localhost:5173/img-portal/ です。パスに `/img-portal/` が付きます。

確認コマンド:

```bash
npm run typecheck
npm run lint
npm run build
```

接続先は `.env` に書いてあります。未設定でも、同じ公開用の URL と鍵を初期値として使います。

## デプロイ

`main` への push で GitHub Actions（`.github/workflows/pages.yml`）が動きます。ビルドと公開は別のジョブです。同じジョブで成果物を上げてすぐ公開すると、公開側から成果物が見えず失敗します。

1. ビルド: `npm ci`、`npm run build`、`actions/configure-pages`（`enablement: true`）、`actions/upload-pages-artifact`
2. 公開: `actions/deploy-pages`

画面のアドレスはハッシュ（`#/estimates`）なので、GitHub Pages でも見積の画面を開き直せます。

### Pages の Source

公開の仕組みは GitHub Actions です。Source が GitHub Actions でないときは、**Settings > Pages > Build and deployment > Source** を **GitHub Actions** にしてください。`enablement: true` は未設定の Pages を有効化しようとします。トークンの権限でそれが失敗したときも、同じ設定に切り替えてから Actions を再実行します。

Actions の画面で `github-pages` 環境の承認待ちになっていたら、承認してください。

## データベース

`supabase/migrations/` は、すでに本番へ適用済みの見積スキーマの記録です。

- `customers` 得意先
- `estimates` 見積
- `estimate_items` 明細
- 状態: `draft` 下書き / `sent` 提出済み / `accepted` 受注 / `lost` 失注

本番のマイグレーション履歴には、次の版として入っています。

- `20261127103305` create_estimate_schema
- `20261127103345` tighten_table_grants

リポジトリのファイル名は、渡された SQL の名前のままです。本番には再実行しないでください。テーブルはすでにあります。
