# v1.89.1 公開前検証

基準：8673a4a51ec8703392d6d74f0809e76bd7f8e393。元のルート作業ツリーは変更せず、既存のlearning-plan worktreeで実装。

- 子ども向けに今日の範囲・目標分・タスク/タイマーへの入口、今週の課題状態と時間を優先表示。
- 数字付き日付を常時表示する7/14日表、今日列、固定課題列、回/教科/教材の開閉、実績率と赤/紫の差を表示。旧編集は保護者向け詳細に残す。
- 私的ローカルJSONを照合・差分確認・本人確認後に原子的取込。同一revisionは重複保存せず、旧版と固定基準を変更不能で保持。未知taskIdや教材不一致は全体拒否。
- 範囲実績は追加フィールドのみ。課題全体status・タイマー履歴・回答・報酬・従来planningを変更しない。実績のある範囲IDの意味・量の変更を拒否。
- Rules追加は本人のlearningSchedules保存先のみ。現行本番Rulesは基準と一致。既存のタスク・復習権限は差分なし。

## 検証

- 新スキーマunit6件、関連する既存受入unit3件、私的計画と実taskId照合1件 PASS。
- 専用Firestore Emulator3件 PASS：同時取込の重複防止、採点/直し同時保存の保持、同一revision、改訂、旧版/実績保持、不正計画の原子拒否、利用者切替、他UID/非家族拒否、変更不能版、単独ポインタ更新拒否。
- 専用Auth/Firestoreブラウザ：取込/不一致/別アカウント/改訂/再読込/旧完了/範囲記録/タイマー入口、および1440/768/375px、日付・横スクロール・可読性 PASS。
- typecheck・build・変更コンポーネントlint・diff-check PASS。App既存lint34指摘の種類・件数に増減なし。既存chunkサイズ警告は非阻害。
- 前回の82 unit/62 Emulator/8フロー/計算復帰の証跡を再利用し、全件は再実行していない。

## 公開・復元

本番データの一括取込や教材登録は行わない。個人資料と計画・結果はGit対象外。Production Rulesの元ソースは `.release-v1891.local/firestore.production.before.rules`、復元設定は同ディレクトリのfirebase.rollback.json。復元する場合は `firebase deploy --only firestore:rules --project study-app-v5 --config .release-v1891.local/firebase.rollback.json --non-interactive`。直前のVercel Productionは `dpl_Ct7jET2KcNQsNyzT1aCdFv4MW58G`。

A：検証範囲で未解決なし。
B：仮計画の正式な範囲・時間・日程、第12回taskId、実アカウント運用受入は未確定。Windowsブラウザの現在URLを安全に特定できずコンピューター操作が停止したため、実利用者の復習・追加練習・タイマーを操作していない。履歴を汚染する試験はしない。
C：既存lintとbundleサイズ警告。

公開結果・SHA・画像は私的な最終報告へ記録する。ローカルの私的ファイル内容を公開資料へコピーしない。
