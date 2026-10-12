# v1.86.2 学習記録保存のhotfixレビュー

## 1. 本番Version／基準commit

本番はv1.86.1、`c3d389cd8ff85e187018891d2e5446d0485db999`。
別worktreeの `codex/hotfix-study-timer-v1862` で修正した。本番基準へ独立テスト環境の23ファイルは取り込んでいない。
元checkoutの `codex/isolated-firebase-test-env` / `3ca5216af890a5db899f072c6306a548a8f78b68` は維持。

## 2–5. 再現可否と対象

通常学習・計算とも、認証済みEmulatorでSTART・カウントアップ・STOPを実行できた。
START／STOP自体が反応しない本番報告は再現していない。
通常学習の「保存失敗なのに完了として詳細画面が閉じる」は修正前に再現した。
計算の保存拒否は、元から得点・時間・draftを残して再試行できることを確認した。

## 6–7. 発生条件と根本原因

通常学習START後、EmulatorでUIDのmembershipを外して保存を拒否させた。
修正前は `modalRetained=false / retryMessage=false` で再現テストFAIL。
`syncTaskToCloud` がキュー送信エラーを握りつぶし、`saveHistoryRecord` が履歴追加・時間リセットを先行して無条件で詳細を閉じていた。
分類はD（Firestore拒否）／F（membership拒否）の発生を保存成功として処理したもの。
A（イベント不達）、B/C/E/Gについて、本番START／STOPの根本原因と断定できる証拠はない。

## 8. 修正内容・ファイル

- `src/App.tsx`: v1.86.2。明示SAVEはtransactionのapplied／duplicate確認後に閉じる。失敗時は停止した時間・メモを保持し、再試行を説明する。キューに残った同一操作ID／STOP時刻を再利用する。保存中・保存保留中のSTARTを止め、その理由を表示する。
- `firebase.hotfix-test.json`: loopback限定のAuth／Firestore Emulator設定。既存 `firestore.rules` を使用。
- `tests/vite-timer.config.ts`: テスト用ViteだけがAppをdemo project／専用familyへ差し替える。対象ソースが一致しなければ配信停止。production設定・環境変数は変更しない。
- `tests/timer-setup.html`, `tests/timer-client.ts`: テスト専用Authログイン、最小初期データ、Web SDK照合。
- `scripts/test-timer-browser.mjs`: 実Appの認証済みブラウザー回帰。外部通信はすべて遮断。
- 本文書。

Rules、Firestoreパス、Auth設定、報酬式、ゲーム処理、schema、依存関係は変更していない。

## 9–12. ブラウザー／保存／実績／報酬

通常START連打、実時間カウント、STOP、保存、拒否後reload・再試行、遅延transaction、切断・復旧を検証。
遅延中は保存中表示・ボタン無効化・詳細画面保持。拒否後は同じ操作ID／停止時刻で履歴を1件だけ保存する。
Timelineの3本のバーをFirestore historyの開始・終了・秒数と照合する。
計算①は3→5→7→2点、②〜⑦は0点、320pxで②を追加4点。taskId／秒数／UIDをWeb SDKから照合する。
実績と4グラフの点数（①の4attemptに対して1／1／4／4）を確認する。
計算時間が通常history／報酬台帳へ追加されないこと、2つのmember UIDのattempt／draft分離、reload復元を確認する。
15分idleは901秒前に開始した専用セッションを作り、実際のidle処理で900秒pendingを生成する。時計変更・未来時刻操作はしない。
10分／0分確定、報酬連打、reload後の活動P・台帳件数不変を確認する。実時間15分待機の試験ではない。
320px／390pxの表示と実touchを検証。通常STARTは48px、中央タップ位置に重なりなし。実機Safariは未検証。
既存計算ブラウザーテスト8検証群では履歴読込み遅延、保存拒否、reload、相互排他、task／tab切替、全得点範囲の代表値を確認した。

追加の負例で、稼働中のAppをmemberからnonmemberへ切り替えて戻した際にFirestore SDK内部assertが出た。今回の保存修正では解消していない。
member A→B→Aは正常。family外アクセス拒否の試験は別ブラウザーcontextで行い、期待する `permission-denied` を確認する。
この内部assertについて、本番基準での独立再現・SDK原因調査は残課題。START／STOP報告の原因とは断定しない。

## 13–14. 検証

- Unit: production基準228件PASS。隔離ブランチの314件とは別。
- Emulator／Rules／transactions: 82件PASS。
- 既存計算ブラウザー: 8検証群PASS。主にSDK fixtureとsample Appの補助検証。
- 新規タイマーブラウザー: 11検証群PASS、JavaScript error 0件。Auth Emulatorでログインした実App／通常Rulesで検証。実行結果は `.timer-browser-results.local/results.json`。Google通信確認画像への要求5件は全遮断、許可した外部要求0件。
- lint: baseline／hotfixとも既存43 errors・3 warnings。新規違反0、新規テストコードの違反0。全lint成功とは扱わない。
- `npm run build`: PASS。既存bundleサイズ警告あり。
- 本番環境変数はhotfixへコピーしていない。build成功はコンパイル検証であり、本番Firebase接続の実動作検証ではない。
- `git diff --check`: PASS。

再実行（別terminal、Java／Firebase CLI／既存Playwrightが必要）：

```powershell
npx firebase-tools emulators:start --project demo-study-hotfix --config firebase.hotfix-test.json --only auth,firestore
npx vite --config tests/vite-timer.config.ts
# Playwrightが通常解決できなければ既存runtimeのmoduleディレクトリを指定する。
$env:PLAYWRIGHT_MODULE_PATH='<既存playwright moduleの絶対パス>'
node scripts/test-timer-browser.mjs
$env:CALCULATION_BROWSER_URL='http://127.0.0.1:5178'
node scripts/test-calculation-browser.mjs
npm test
npm run test:emulator
npm run build
```

タイマーE2Eは専用 `demo-study-hotfix` Emulatorデータをリセットする。クラウド／他の開発用Emulatorへ転用しない。

## 15. Auth機密情報ログの影響評価

対象はテストproject `study-app-v5-cloud-test`。signerKeyを含む管理APIレスポンスが以前のtool出力へ露出した。機密値は再表示しない。
ローカル限定ではなく、このCodexチャットのtool応答とsession transcriptに記録された。
保存場所は `C:/Users/mineo/.codex/sessions/2026/10/12/rollout-2026-10-12T08-29-56-01a12d4d-3437-7e70-98a5-c09a40ee2bd6.jsonl`。
ACL上は所有ユーザー、SYSTEM、AdministratorsがFullControl、CodexSandboxUsersがReadAndExecute。ユーザーだけの排他的ログではない。
agentによるチャット共有・push・CI送信はしていない。サービス側の保存範囲、閲覧者、利用者によるexportは未確認。

既知の診断ファイル・Firebase log・環境ファイルへ露出値が含まれるかを値非表示で照合し、該当なし。元checkout tracked差分なし／HEAD不変で今回のGit混入なし。
今回ログ／鍵／ACLを削除・変更していない。
ignored `.cloud-test.local/admin.cjs` を安全化し、管理API取得項目を `name/subtype/signIn.emailのboolean/authorizedDomains` に限定。機密フィールドが返れば表示せず停止する。
実GETで `hashConfigReturned=false` を確認。UIDだけのfield maskでAuthユーザー件数0件を確認し、passwordHash／salt／メール／tokenを取得・表示していない。
ユーザー0件は現在の影響範囲を限定するが、露出鍵の失効を証明しない。本番Authハッシュ設定は取得していない。

[Firebase CLI公式](https://firebase.google.com/docs/cli/auth) はパスワードハッシュ設定の機密性を説明している。
[管理Config API](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config) のhashConfigはoutput-only。自前PATCHでの鍵更新を行わない。
Firebase Supportにproject ID・発生時刻・設定種別・露出先（機密値なし）を伝え、管理されたハッシュ設定の更新／封じ込め可否を確認する手順を提案する。実際の連絡は行っていない。
ID token失効やJWT署名鍵の更新を、このパスワードハッシュパラメータの更新と同一視しない。
更新できない場合は、別途承認した新しい独立テストprojectへ移行する案を検討する。
既存ログは保全し、未編集のチャットexportを共有しない。ローカルACL制限／サービス側ログ処理はappへの影響と保持要件を確認した後、承認して実施する。

## 16–19. 再開／Git／限界／次の承認

クラウドテストは `CLOUD_TEST_BLOCKED` を維持し、今回再開していない。診断はテストprojectのfield限定readのみ。
本番familyのread／write、クラウドwrite、Authユーザー作成、Rules deploy、Vercel deployは行っていない。
hotfix関連7ファイルだけを明示stageしてローカルcommitする。push／main mergeは行わない。AGENTS.mdは元checkoutに未追跡のまま維持。
本番固有のSTART／STOP操作不能、実機Safari、実利用端末の古いキャッシュ・認証・通信状態、本番Firebaseでの保存成功は未検証。
次に必要なのはhotfixレビューと本番反映の承認（今回は反映しない）、露出ログの取扱い・Support連絡／鍵対応の承認。
利用者から端末・ブラウザー・対象課題・disabledか無反応か・表示エラーの情報を得て、操作不能を別途絞り込む。
