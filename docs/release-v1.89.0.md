# v1.89.0 正式リリース確認

受入修正コミット `8a8cb56` の内容を維持し、今回の正式公開指定に合わせ表示をv1.89.0に統一する。新機能追加や保存処理本体の追加変更はない。

## 追加監査

`material-repository.ts` / `repository.ts` の実際のFirestore transactionを2クライアントで同じrevisionから競合させ、両方の先行順を検証した。

- 計画保存が先行：教材登録が再試行で最新計画を読み、計画と教材を保持してrevision 2へ。
- 教材登録が先行：古いrevisionの計画保存を拒否。教材と元の計画を保持してrevision 1へ。
- 再登録はrevision・履歴を重複しない。
- 他UIDの学習可能時間の読取を拒否。
- 通常復習は保存でき、practiceの回答とprogressの同時改変を拒否。practice履歴のみの保存では元progress不変。

追加Emulator 4件PASS。実画面監査9項目PASS（1440px/375px、日付配置・保存・タッチ操作を含む）。前回の82 unit/62 Emulator/8ブラウザフロー/タイマー復帰、および受入監査の17 unit/6 Emulatorの証跡を再利用。全件再実行なし。
型チェック・build・diff-check・追加テストのlint PASS。既存lintとchunk警告は非阻害。

## 公開先と安全策

- GitHub: mineo1178/study-app-v5、Production branch main。
- Vercel: mineojan1178s-projects/study-app-v5、project `prj_12iONIUyWVkxweWfvM1opDz09Rcb`。
- Firebase: study-app-v5。Production設定のプロジェクト一致・復習フラグ有効を確認。
- 公開前main: `5a18396c633bec05661a88c7e7cb7d293bc84ec1`。
- 現行Production Rulesは上記mainと一致。Ruleset `8446b807-c108-487c-be9f-fa3079dfab33`。
- バックアップと復元用firebase設定はGit対象外の `.release.local/` に保持する。
- Rulesのロールバック：保存済み元ソースを使い `firebase deploy --only firestore:rules --project study-app-v5 --config .release.local/firebase.rollback.json --non-interactive`。データの移行・削除はしない。
- Vercelの公開前READY deploymentは `dpl_6GVVw96YQxwY25RdxpYuosYtQokQ`。必要時はこの旧Productionへ戻す。
- 個人PDF・private JSON・認証情報・ローカル結果はcommitへ含めない。教材の本番登録は行わない。

公開結果・SHA・画像参照・実アカウント確認範囲はローカルの最終リリース報告へ記録する。実利用者として確認できない項目を架空データの成功で代用しない。
