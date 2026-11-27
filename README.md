# IMG株式会社 社内ポータル

塗装・防水工事の社内向け画面です。この版で使えるのは **見積** と、見積で選ぶ **得意先** です。

現場・案件、出張・準備、契約・書類、請求発行、売上・粗利は、メニューに「準備中」と出るだけで、まだ動きません。

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

`main` への push で GitHub Actions（`.github/workflows/pages.yml`）が動きます。

1. `npm ci` と `npm run build`
2. `actions/configure-pages`（`enablement: true` で Pages の有効化を試みる）
3. `actions/upload-pages-artifact`
4. `actions/deploy-pages`

画面のアドレスはハッシュ（`#/estimates`）なので、GitHub Pages でも見積の画面を開き直せます。

### Pages を有効にすること

`configure-pages` の `enablement: true` は、公式の説明どおり **GITHUB_TOKEN 以外のトークン** がないと Pages を新規に有効化できません。このワークフローはリポジトリの `GITHUB_TOKEN` だけを使います。

そのため、初回はワークフローが Pages の作成に失敗することがあります。そのときはリポジトリの **Settings > Pages > Build and deployment > Source** を **GitHub Actions** にしてください。一度 Source を GitHub Actions にすると、以降の push でこのワークフローが公開を更新します。

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
