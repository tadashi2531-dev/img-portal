# Grok Bot 向け操作マニュアル

このポータルは、各社の Grok Bot（Supabase の MCP でデータベースを直接読み書きできる AI）が声の依頼を受けて操作し、人が画面で確認・手直しする前提です。Bot は下の関数（RPC）を呼んでください。画面のボタンと同じルールです。

## 守るルール

- 見積メール、請求メール、書類メールは下書きまで。`draft_outbound_message` は送信しません。実際に送るのは、人が画面で下書きを見て「送信」を押したときだけです。
- 宿の予約、外部へのファイル送信、天候以外の外部書き込みはしません。天気の取得は画面が Open-Meteo を読むだけで、Bot は予定の行を作るところまでです。
- 削除は、人に確認してからポータルの削除ボタンで行います。削除用の RPC はありません。
- 作成系の関数は、下書き（`draft`）か確認待ち（`awaiting_confirmation = true`）で作ります。
- 会社名、住所、電話、業種は `company_settings` から読みます。会話やコードに他社の情報を書き込まないでください。

## 会社設定

テーブル `company_settings` は 1 行（`id = 1`）です。

| 列 | 意味 |
| --- | --- |
| company_name | 会社名 |
| trade | 業種（例: 塗装・防水工事） |
| address | 住所 |
| phone | 電話 |
| email | メール |

- `get_company_settings()` で読む
- `set_company_settings(company_name, trade, address, phone, email)` で更新する

## テーブル

ログイン済み（`authenticated`）だけが読み書きできます。未ログイン（`anon`）は権限がありません。

| テーブル | 内容 |
| --- | --- |
| customers | 得意先 |
| estimates | 見積。`source_estimate_id` は複製元 |
| estimate_items | 見積明細。単価と金額は値引き・端数調整のためマイナス可。数量は 0 以上 |
| jobs | 現場・案件。緯度経度は天気用 |
| job_days | 日別工程（作業内容、塗料、担当、時間） |
| job_costs | 原価 |
| trips | 出張。宿の予約番号などは人が記録 |
| trip_checks | 持ち物 |
| documents | 契約・書類。ファイルは Storage `documents` |
| invoices / invoice_items | 請求。明細の単価と金額はマイナス可。小計・消費税・合計はマイナス行を含めて計算する |
| site_photos | 現場写真の行。ファイルは Storage `site-photos` |
| outbound_messages | メール履歴。`draft` は未送信。`sent` は人が送信した記録 |
| company_settings | 会社情報 |

見積の状態は `draft` 下書き、`sent` 提出済み、`accepted` 受注、`lost` 失注です。

## RPC

すべて `security invoker` です。未ログインでは失敗します。

| 関数 | 動き |
| --- | --- |
| find_similar_estimates(query) | 件名・現場名・顧客名・品目名で過去見積を近い順に返す |
| clone_estimate(source_id, customer_name) | 見積と明細を下書きで複製。宛先、今日の発行日、30日後の有効期限に差し替える。値引き行（マイナスの単価・金額）もそのまま写す |
| ensure_customer(customer_name) | 同名の得意先がなければ作る |
| create_job(title, site_name, customer_name, start_on, end_on) | 案件を予定で作る |
| add_job_day(job_id, work_date, work_content, paint, assignee, hours) | 工程を1行追加する |
| create_invoice_from_estimate(estimate_id) | 請求の下書きを作り、確認待ちにする。送信しない。見積の値引き行もそのまま写す |
| create_trip(title, job_id, depart_on, return_on, site_address, party_size) | 出張を確認待ちで作る。予約しない |
| create_document(title, doc_kind, customer_name, job_id, due_on) | 書類を確認待ちで作る |
| add_pending_check(kind, ref_id) | 見積・請求・書類・出張を確認待ちにする。kind は estimate / invoice / document / trip |
| draft_outbound_message(kind, ref_id, to_email, subject, body) | メール下書きを履歴に残す。送信しない |
| register_site_photo(job_id, stage, caption, storage_path, taken_on) | 先に Storage へ上げた写真の行を登録する。stage は undercoat / top1 / top2 / finished / other |
| list_pending_checks() | 確認待ちの一覧 |
| get_sales_summary() | 案件ごとの売上・原価・粗利。下書き請求は売上に入れない |
| get_company_settings() / set_company_settings(...) | 会社情報 |
| next_estimate_no() / next_invoice_no() | 番号の提案 |

## 話し言葉と関数

| 頼まれ方の例 | 呼ぶもの |
| --- | --- |
| 「前のマンション外壁塗装の見積で、株式会社山田建設宛の下書きを作って」 | `find_similar_estimates('マンション 外壁塗装')` で候補を見て、人が選んだ id で `clone_estimate(id, '株式会社山田建設')` |
| 「明日の工程に養生を追加して」 | 対象の案件 id が分かっているとき `add_job_day(job_id, 明日の日付, '養生', '', '', 0)` |
| 「この見積から請求を作って」 | `create_invoice_from_estimate(estimate_id)` |
| 「山田邸の出張を作って。住所は横浜市中区、2名」 | `create_trip('山田邸の出張', job_id, 出発日, 帰着日, '横浜市中区', 2)` |
| 「この見積を確認待ちにして」 | `add_pending_check('estimate', estimate_id)` |
| 「見積メールの下書きを残して」 | `draft_outbound_message('estimate', estimate_id, 宛先, 件名, 本文)`。送らない |
| 「今月の粗利は」 | `get_sales_summary()` |
| 「会社の住所を変えて」 | 人に内容を確認してから `set_company_settings(...)` |

候補が複数あるとき、Bot は勝手に1件へ決めず、人に選ばせます。

## 写真

1. Storage の非公開バケット `site-photos` にファイルを置く。
2. そのパスで `register_site_photo` を呼ぶ。
3. 書類ファイルはバケット `documents`。行の `storage_path` は人が画面で付けるか、更新はポータルの画面で行う。

## 他社への導入

1. 導入先自身の Supabase プロジェクトを作る。
2. このリポジトリの `supabase/migrations` を、ファイル名の順にそのプロジェクトへ適用する。本番で適用済みの環境には、同じファイルを再実行しない。
3. Authentication でメールログインを有効にし、使う人を招待する。公開サインアップは止めてよい。
4. Grok Bot に、その Supabase のコネクタ（MCP）を接続する。Bot はそのプロジェクトのデータベースだけを見る。
5. `company_settings` の 1 行を、導入先の会社名、業種、住所、電話、メールに更新する。`set_company_settings` でもよい。
6. メールを送る会社は、Resend でドメインを確認し、Edge Function Secrets に `RESEND_API_KEY` と `RESEND_FROM` を入れる。未設定なら画面は「送信設定がまだ」と出て送らない。
7. GitHub Pages などでこのポータルを公開し、Supabase の Site URL をそのアドレスにする。

会社ごとにプロジェクトを分けます。ある会社の Bot から、別の会社のデータベースは開きません。
