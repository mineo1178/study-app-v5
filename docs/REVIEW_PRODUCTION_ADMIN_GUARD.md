# v1.88.2 PC Admin：初期5問専用の承認ゲート（guard schema 1）

## 範囲と信頼境界

通常アプリ、既存UID、family.memberUids、reviewManagers、Firestore Rulesは変更しない。元の`review-admin.mjs`は引き続き本番・旧Cloud Testを接続前に拒否する。独立した`review-initial-admin.mjs`だけが、署名・対象・入力全バイトhash・期限等の条件を通過した場合に初期5問を作成できる。本番でのcheck/applyは、別途明示承認後の操作である。今回、本番接続・本番dry-run・本番書込みは実行しない。

これは信頼された管理者PCでの**誤接続・誤更新防止**。管理者自身や奪われたAdmin資格情報に対する完全な改ざん防止ではない。署名鍵、policyの確認hash、実行物、資格情報を同じ特権操作者が変更できる場合、意図的な制限回避は可能。Admin SDKはRulesを迂回するため、IAM最小権限と端末管理も必要。Firestore IAMを問題ID単位の認可と誤認しない。

初回create専用で、将来の一般問題追加・通常編集・削除・非公開登録後の公開変更を解放しない。それらは別の用途・対象・承認・実装レビューが必要。

## 承認資料

非Git・所有者のみアクセス可能なディレクトリに次を置く。実UID、入力問題、秘密情報を公開Gitへ置かない。

- `policy`：schemaVersion=1、target（projectId/familyId/uid）、questionIds（重複なし5件）、manifestSha256、keyFingerprintのみ。
- targetのprojectIdは`study-app-v5`、familyIdは`oomine-study-2026`へ厳密固定。uidは既存本人のものを安全な手元で照合しpolicyへ設定する。コード内に固定UIDを埋め込まない。署名approvalのtargetとpolicyのtargetも完全一致を要求する。
- `manifest`：schemaVersion/questions/weaknessesのみ。正規化済み5問、weaknessesは空。id/versionは事前固定し、再prepareしない。全問にpublishedを明示。SHA-256は**保存ファイルのUTF-8全バイト**（空白・改行込み）であり、JSONを再整形すると失効する。
- `approval`：schemaVersion=1、purpose=`initial-five-create-only`、approvalId、target、manifestSha256、actions、notBefore、expiresAtのみ。actionsはid順の5件で、各項目はid/operation=`create`/version/published。manifestと全件一致を要求。更新・削除などの操作は拒否する。
- `notBefore/expiresAt`はUnix epochミリ秒整数、期間は最大24時間。未開始・期限切れは拒否。PCの時刻同期を確認し、資格情報取得前・backup後・transaction直前/commit前に再確認。サーバーの処理完了時刻まで期限内であることを保証するサーバー認可ではない。
- `public-key`はEd25519の公開PEM。policy.keyFingerprintはSPKI DERのSHA-256。承認者が別途管理する秘密鍵で、`hash(approval)`（既存coreのキー順正規化SHA-256、64文字ASCII）のバイト列へEd25519署名し、base64の`signature`ファイルへ保存する。
- 署名者は問題全文・正解・解説・ID・公開状態・対象・期限を確認した後にだけ署名する。秘密鍵はOS保護/暗号化された保管先に置き、コードやログに渡さない。今回作った実行可能な本番approvalや本番署名はない。テストの鍵/UIDは架空のものだけ。

policyはローカルの信頼された対象設定であり、署名ファイルと同時に置くだけで第三者の信頼を保証するものではない。操作者は別途承認されたpolicyファイル全バイトhashを`--confirm-policy`で照合する。signatureやpolicyを任意に再発行できる管理者の意図的改変まで防ぐという意味ではない。

## コマンド境界

`check`はオフラインのみ。Auth/Firestore/ADC取得を行わず、すべての署名・対象・期限・入力hashを検証し、hash/件数/書込0だけを出力する。

```text
node scripts/review-initial-admin.mjs check --policy <private-policy-file> --approval <private-approval-file> --signature <private-signature-file> --manifest <private-manifest-file> --public-key <private-public-key-file> --confirm-policy <approved-policy-file-sha256>
```

将来の明示承認後だけ、同じ6引数に`--backup-directory <owner-only-ignored-or-outside-git-directory>`と`--sdk-directory <trusted-external-admin-sdk-directory>`を加え、commandを`apply-approved`とする。今回このコマンドを本番へ実行しない。`apply`/`--force`/不明引数だけでは実行できない。署名が不正/未取得ならSDKを初期化しない。

保管先/入力ファイルはWindows所有者のみの保護ACL、symlink/junction/hardlink拒否、サイズ上限、リポジトリ内ならGit ignored必須。平文の実UIDを引数へ置かずファイルから読む。公開鍵を含め、CLIが扱うpolicy等は同じprivate保管条件とする。

## 接続・認証と書込み制限

- 外部Admin SDKはViteからimportしない。資格情報は端末側で安全に管理された`applicationDefault()`だけを利用する。SDKや資格情報は信頼された管理者が別途準備する。署名条件を通過してもIAMが不足なら停止し、権限を自動追加しない。
- 秘密鍵ファイルを指定する`GOOGLE_APPLICATION_CREDENTIALS`、project/Emulator/endpoint/proxy/TLS/ログの危険なoverride等は拒否する。許可されない環境変数を値付きで出力しない。新しいCLIは既存REVIEW_ADMIN_SDK_DIRではなく明示したSDK directoryを使う。
- 正確なprojectIdをSDKへ渡し、初期化後のprojectIdと既定Firestore endpointも照合する。Auth getUserは存在・本人UID・disabledでないことだけを確認し、Auth変更はしない。familyは読み取り、memberUidsにそのUIDがあることを確認する。家族情報をwriteしない。
- adapterが持つwriteは`questions/{approvedId}`へのtransaction.createのみ。5ID以外、同IDの二重queue、承認JSON以外、5件以外を拒否。set/update/deleteや一般コレクション操作を公開しない。回答・進捗・学習・計算・成績・ゲーム・roleを書かない。
- IAMはFirestoreのread/create/transaction等とAuth users.getの必要最小限を別途確認する。Owner、IAM変更、Auth作成/削除、Rules deploy等をこの作業のために付与しない。公開・将来編集の権限を無制限に与えない。短期impersonation等を優先検討するが、実IAM/ADCの本番設定と動作は今回未検証。

## バックアップ・競合・原子性・監査

1. SDKからfamily所属・Auth有効性・承認5IDのbeforeを読む。beforeはdataと完全精度updateTime（秒/nanosのprotoを文字列化）。全5件不存在を要求する。別version、部分存在、違う内容が1件でもあれば初回createは拒否する。
2. Windows CurrentUser DPAPIでbefore（対象と承認hash、家族所属の読取結果、5件不存在）を暗号化し、owner-only directoryへ排他的に新規保存する。平文はstdin/メモリだけで処理する。直ちにファイルを復号しpayload hash一致を確認する。保存/復号/ACL/監査準備に失敗したら書込み0。バックアップ範囲はこの5IDのbeforeと所属情報であり、既存family全体やAuth/Rulesの復元backupとは主張しない。
3. transaction内で同じ5件・所属・Authを再確認し、beforeの内容/版/updateTimeに変化があれば停止。各createの不存在preconditionも維持する。5件を原子的にcommitする。
4. 保存後に再読取して5件の全内容を承認JSONと照合。監査は承認hash/before・after hash/件数/状態だけを同じprivate保管先へ新規保存し、UID/内容/資格情報をログへ出さない。
5. 同じ承認で再実行し5件すべてが承認afterと一致するなら`ALREADY_APPLIED`で書込み0。部分一致/別versionなら停止。並行実行は片方のcreate/transaction競合で拒否され、二重変更しない。バックアップ等の失敗後に無理に続けない。
6. commit後の読取/監査に失敗した場合、CLIは成功を返さず停止する。ただしサーバーcommit済みの可能性がある。再prepare/別IDで登録せず、同じ5IDを安全に照合・再実行して既適用を判定する。自動rollback/削除はない。インシデント時の復元は新しい変更承認を必要とする。

端末を失った場合にDPAPI復号ができる保証はない。Windows本人の保管・回復計画を別途確認する。時刻・承認鍵・policy・SDK・ADCがすべて信頼されたPC内にある境界を理解して使う。

## 本番公開前の順序（すべて別途承認後）

1. 初期5問全文・ID・正解・解説・公開状態と最終JSON hashを保護者が承認。現在の候補は全問published=falseで未承認。
2. Vercelダッシュボードで正しいteam/project、Git repository、Production Branch=main、自動deploy/skip条件、Production環境変数、VITE_REVIEW_STORAGE_ENABLED、rollback先v1.87 deployment、queued build・別hook/workflowの有無を確認。過去403/invalidTokenのAPIは再試行しない。値/秘密をログへ出さない。
3. 実UIDの用途/所属は既存本人のまま、安全な保管先でtarget・5ID・鍵・期限・IAMを最終確認し、オフラインcheckと具体的実行計画を別途承認する。現行CLIの本番拒否を解除しない。
4. 本番Rulesを保全して新Rulesを先行適用・release/source hashを確認する計画。既存v1.87との互換性は単一UID Cloud Test 2の実測PASS。Rules適用失敗なら公開と登録を止める。今回はRules変更0。
5. **公開前登録を推奨**。内容確認を終えた最終JSONで公開状態も承認し、5件を限定createしてread-only確認する。現在の非公開JSONのままではアプリに0問となる。公開で初回登録する場合はpublished=trueを含む別の最終JSON/hashを明示承認する。隠れた自動公開はしない。
6. 新Rules準備完了後、将来の承認操作でProductionのVITE_REVIEW_STORAGE_ENABLED=trueを次のbuild前に設定。mainを監査済みrelease SHAへfast-forward、1回のpushを唯一のProduction build起動元にし、手動deploy/hookを重ねない。環境変数はbuild時に埋め込まれ、既存配信物は変数変更だけでは切替わらない。
7. Vercel Production READY/Current、domain、source SHA、アプリversion、正しい保存設定を確認。5問・本人認証・最初の承認された実学習の回答保存/reloadを受入確認する。本番の攻撃テストや試験データは入れない。

公開後登録は0問案内/開始不可の期間ができ、環境確認と問題登録の失敗が混ざる。先に公開5問を登録し旧v1.87で既存機能が維持されることを確認してから新clientを公開する方が、空画面と不要な再deployを避けやすい。非公開登録を選ぶなら、将来の公開限定更新ゲートが別途必要で、この初回承認では更新できない。

停止/復旧：対象・署名・backup不一致は接続/書込を止める。Rules失敗は旧clientを維持。登録の応答不明は同じ5IDを照合。Vercel失敗/skip/誤SHAは既知正常deploymentを維持し、別トリガーを連打しない。公開後障害は別途承認のv1.87 rollbackを使い、新Rulesとの互換性を維持する。新しい回答を削除しない。保存フラグをfalseにする場合も再buildか既知配信物へのrollbackが必要。

## 実機Safari・残ゲート

実機Safariは未検証。非本番の専用アカウント/問題で、ログイン、5問回答/採点/解説、3分超、途中/完了reload、draft/履歴復元、再挑戦、タブ切替/別タブ、ログアウト/UID切替、通信断/再試行、320/390px、既存学習START/STOPと計算①〜⑦を確認する。console/SDK assertionと旧データ表示を記録。実機なしではPASSにしない。本番受入は承認された実学習だけ。

アプリVersionはv1.88.2を維持する。今回は配信アプリやschema/Rulesを変えず、PC専用管理スクリプトのschema 1を追加したため。Admin実行物は最終commitで固定し、今後クライアント動作を変える場合はアプリVersion更新を行う。

関連一次資料：[Firebase server clientのRules迂回](https://firebase.google.com/docs/firestore/security/rules-conditions)、[IAM](https://firebase.google.com/docs/firestore/security/iam)、[Vercel環境変数](https://vercel.com/docs/environment-variables)、[Git deployment](https://vercel.com/docs/git)。実環境の設定確認は未完了。
