# v1.88.1 保護者権限・公開前の運用

基点：v1.88 `f7676d67d394a75851fcd557b4c728c10a8e9a05`。branchは`codex/test-review-v1.88`。本書はv1.88仕様書の「保護者専用認証なし」「本人による問題管理」の記述を置き換える。既存の未commit作業、証跡、AGENTS.mdは変更しない。

## ロールと操作権限

管理情報は `families/{familyId}/reviewManagers/{parentUid}`。

```json
{ "active": true, "childUids": ["CHILD_UID_PLACEHOLDER"], "schemaVersion": 1 }
```

これは形式の説明であり、実アカウントのUIDではない。ロールは信頼された管理者がFirebase Admin SDKまたは適切なIAM権限の管理画面で設定する。クライアントからの作成・更新・削除は、保護者本人も含め全員拒否する。本人の管理文書getだけを家族所属者へ許可し、他者のgetとcollection一覧取得は拒否する。家族文書のクライアント更新も既存どおりactiveStudyTaskId以外は禁止。

保護者は自身も家族所属し、ロールがactive/schemaVersion=1で、対象UIDがchildUidsと同一家族のmemberUidsの両方に含まれる場合だけ管理できる。UID固定値、localStorage、プロフィール項目による認可は使用しない。

| データ | 子ども本人 | 割当済み保護者 | 他UID・家族外・未認証 |
| --- | --- | --- | --- |
| 公開問題 | 読取 | 読取・登録・編集 | 拒否 |
| 非公開・公開未設定の旧問題 | 拒否 | 読取・編集 | 拒否 |
| 正解・解説・公開状態 | 変更不可 | 編集可能 | 拒否 |
| 苦手情報 | 読取 | 読取・登録・編集 | 拒否 |
| 回答・進捗・所要時間 | 本人だけ読取・整合する追記/進捗更新 | 他UIDの履歴は読取・更新不可 | 拒否 |
| 問題/苦手/履歴/進捗の削除 | 拒否 | 拒否 | 拒否 |
| 管理ロール変更・自己昇格 | 拒否 | 拒否 | 拒否 |

保護者と子どもには別々のAuthアカウントが必要。同一アカウントを共有すると誰が操作しているかは区別できない。実UIDは本作業では不明であり、登録していない。

## 画面と権限失効

復習タブに、自身のサーバー確認済みロールがある場合だけ「保護者の管理」を表示する。管理対象は割当済みかつ家族所属のUIDだけ。子どもには管理UIを表示しない。回答画面・保存方式は従来の復習機能を維持する。

ロール/家族文書をmetadata付きlistenerで監視する。取得中、cacheのみ、未設定、不正schema、取得エラー、無効化、削除、割当解除、家族所属解除では管理を遮断する。取得エラーは別listenerの正常応答で解除せず、明示再確認まで遮断する。権限変更時は先に管理サブツリーを外し、旧フォーム・旧対象UIDの応答を引き継がない。

認証切替では既存useFamilySessionのUID固定Firestore clientと同期的な保護UI撤去を利用する。管理の非同期処理もmount/session/割当を確認する。対象切替の旧読取、UID切替の保存待ちを新しい画面へ反映しない。再送は元のUID固定clientだけを使用し、新利用者の認証へ付け替えない。サーバー側の失効はRulesで判定するため、listenerの通知を待たず不許可になる。

## 公開状態と後方互換

問題に`published: boolean`を追加した。新しい手動登録はチェック状態を明示し、JSON省略時はtrueとして登録する。falseの場合は親だけが管理でき、子どもの読取・新規回答保存を拒否する。子どもの問題queryは必ず`where("published", "==", true)`を付ける。

旧問題に公開状態がない場合は削除・自動書換せず、保護者だけに表示する。必要な問題を確認して「子どもに公開する」をチェックし、保存する。IDと過去履歴は保持する。公開/非公開の変更時もversionを更新し、古い版への新規回答を保存しない。既に保存済みの固定IDの再試行は再加算しない。

従来の問題マスター・弱点・回答・進捗は別collectionなので、管理用と本人更新用の複合文書の分割migrationは不要。v1.87のtasks/tests/dailyCalculations/game/rewardLedgerの許可は変更していない。広いrecursive matchによる新規パスの迂回許可も追加していない。

採点の正誤はRulesで現在の正解と照合するが、クライアントは公開問題の正解を読める。本人が本当に自力で解いたことや時間・支援の有無を保証する改ざん耐性のある試験採点ではない。履歴から活動P・ファン等を自動付与しない。

## 初期ロール登録（今回実行しない）

1. 管理者が対象Firebase project IDと環境（Production/検証）を確認する。実projectを推測しない。ブラウザーのアプリ用Firebase設定だけで管理者権限があると判断しない。
2. Firebase Authの管理画面で、保護者と子どもの本人確認済みアカウントのUIDを確認する。子どものアカウントを保護者扱いにしない。メール・鍵・トークン・実UIDはGitやこの手順書へ書き込まない。
3. 信頼された管理者が家族のmemberUidsを確認する。保護者と全対象UIDの所属を必須にする。UIDは1〜128文字、空/スラッシュ/ドット/重複は禁止、子ども最大10件。通常は保護者と子どもを別UIDにする。
4. **dry-run相当の変更計画**としてproject、family、文書パス、現在値、active/childUids/schemaVersionの変更後、影響する対象を安全な管理者用の場所で確認する。既存ロールがあれば上書き内容を明示し、承認を得る。
5. 承認後だけ、信頼できるAdmin SDK等で家族所属を再確認してロール1文書を設定する。クライアントの自己登録UIは作らない。長期サービスアカウント鍵をリポジトリへ置かない。最小権限の管理者認証を使用する。
6. 保護者/子ども/非対象UIDの許可・拒否と、active=falseで失効することを確認する。割当変更、削除、退会は同じ管理者経路で扱う。変更履歴を管理者側で保全する。

自動登録スクリプトは追加していない。UID未確定のため、本番ロール登録・本番データ読取/書込・Rules deployは一切実施しない。

## 最初の5問の登録

1. 管理者による割当設定が済んだ後、保護者のアカウントでログインし「対策・復習」→「保護者の管理」を開く。
2. 管理対象UIDを確認して子どもを選択する。個人名の推測表示はしない。
3. 保護者が用意した実問題を、教科・単元・問題文・異なる四択・正解・短い解説・テスト種別・任意の出典とともに入力する。「子どもに公開する」を確認して保存する。
4. 5問を手動で登録するか、v1.88仕様書のJSON配列で1〜50問を取り込む。publishedはtrue/false、省略時true。id/versionは指定せずアプリが発行する。未知フィールドや不正データは全件保存前に拒否。同一IDの重複は保存APIでも拒否する。
5. 子どものアカウントに切り替えて、問題数と開始ボタンを確認する。0件では開始不可、1〜4件は実数、5件以上は1回5問。未回答・苦手情報なしは空状態を表示する。

実問題や個人情報はこのリポジトリに含めない。架空問題はサンプルモードとEmulatorテストのみ。JSON詳細は`TEST_REVIEW_V1_88.md`の形式を参照するが、管理権限は本書の方式に置き換える。

## 保存の公開ゲート

`VITE_REVIEW_STORAGE_ENABLED`は引き続き既定で無効。文字列`true`だけ有効。VercelのProductionに適用する場合は公開承認後の再ビルドが必要。無効時は通常モードの復習読取・回答・管理UIを遮断し、準備中を表示する。サンプル保存は端末内のみで、クラウド保存成功とは表示しない。

この環境変数は認可の代替ではない。公開承認後、旧クライアント互換を確認したRules、管理者によるロール初期登録、保護者・子ども両方の確認を先に行い、それから保存有効化する。Rulesやロールが未設定なら登録/保存を拒否し、成功を表示しない。部分保存も同じ固定回答IDで再試行し、二重加算しない。

## Rulesの評価範囲

管理認可は同一家族文書と保護者ロールの最大2文書を参照する。呼出しをキャッシュ前に数えても管理側は1評価あたり最大5。50問transactionは同じfamily/roleのアクセスが共有・キャッシュされることを正常系で検証する。子どもの回答/進捗の書込認可には保護者ロールを追加せず、従来の1問2書込transactionとgetAfter整合を維持する。親は他UIDの回答/進捗を読めず更新できない。

新規Rules/既存Rules、50問取込、同時/部分保存、失効、非公開query、不正フィールド、未認証/家族外/別UIDをEmulatorで検証する。旧Appは指定base commitからテスト専用サーバーへ読み込み、新Rulesに対して通常学習/計算/認証/ゲームの回帰を実行する。本番のソース切替やデータ接続はしない。

## 今回新規に実行した結果

前回のv1.88はUnit297・Rules90・ブラウザー5系統の記録。下表は今回のロール実装後に新しく実行した結果であり、前回PASSを流用していない。

| 項目 | 今回の結果 |
| --- | --- |
| Unit | 16ファイル・313件PASS（ロール・公開状態・1〜4問・50問の入力を含む） |
| Rules / Emulator | 5ファイル・96件PASS（保護者許可/子ども拒否、失効、自己昇格拒否、50問transaction、旧問題保持と非公開query、既存Rules等） |
| 復習UI | 保護者で手動/JSON登録・編集、子どもで回答、0/5・5/5、3分超、再挑戦、読取/保存エラー、再送、reload、成績入力編集、320/390 PASS |
| ロールUI | 最大50問を実際の管理画面から取込、遅延B読取→C選択、UID切替中保存待ち、ロール無効/変更/削除、cache-only遮断、listener解除 PASS |
| 連続DOM観測 | 最終ロールUI実行で456回・認証切替7回・漏出0・pageerror0 |
| 認証 | 既存auth E2E 16チェックPASS、DOM漏出0、SDK assertion0 |
| アンコール | 既存13フェーズPASS、アンコール書込0 |
| 通常学習・計算 | START/STOP、15分無操作、保存拒否/再試行、①〜⑦、4グラフ、報酬二重付与防止、320/390タッチPASS |
| 旧v1.87 App | f6442645のApp.tsxをテスト専用Viteで提供し、上記通常学習/計算/認証/報酬/画面幅を新RulesでPASS。実際の診断コピーがv1.87であることもassert |
| TypeScript | アプリtsc -bと、新規/変更テスト・設定のnoEmit PASS |
| lint | 新規違反0。全体は既存Appの36エラー・2警告のまま。baselineとのrule/severity/column/行対応で確認 |
| Production build | PASS。既存同様の500KB超chunk警告は残る |
| 依存監査 | 既存14 package findingsを個別評価。Production配信JSのmodule集合には該当14 packageなし。詳細は依存監査文書 |
| git diff --check | PASS。対象ファイルだけをstageし、AGENTS.md・実UID・鍵・トークン・ログ・生成物はcommitしない |

主な再現コマンド：

```text
npm test
npm run test:emulator
node scripts/run-auth-browser.mjs review roles
node scripts/run-auth-browser.mjs roles auth encore timer calculation
node scripts/run-auth-browser.mjs v187
npm run build
```

v187モードは他suiteと混ぜず単独で実行する。テスト用変換・遅延注入・listener計測はtests用Vite設定だけに存在し、ProductionのVite設定には追加していない。すべてlocalhost demoプロジェクトで実行し、ブラウザーの外部接続は遮断した。

証跡について：既存ハーネスは固定名のJSON/PNG/ログを出力するため、今回の初期実行では同名ファイルが更新された。初回v1.88の集計は既存commitの文書と会話の実行記録に残る。以降の再実行では既存の出力ファイルを`.review-role-results.local/history-*`へ退避するよう改善した。元checkoutの調査証跡や独立テスト環境のファイルには手を加えていない。

## 変更ファイル

- App接続/Version：`src/App.tsx`
- 復習/管理UI：`src/components/TestReview.tsx`、`src/components/ReviewManager.tsx`、`src/components/ReviewWorkspace.tsx`
- ロール/保存/出題：`src/review/manager-access.ts`、`src/review/repository.ts`、`src/review/model.ts`
- Rules：`firestore.rules`
- Unit：`src/review/model.test.ts`、`src/review/manager-access.test.ts`
- Emulator：`tests/emulator-admin.ts`、`tests/test-review.emulator.ts`、`tests/review-manager.emulator.ts`、`vitest.emulator.config.ts`
- Browser：`tests/review-client.ts`、`tests/vite-timer.config.ts`、`scripts/run-auth-browser.mjs`、`scripts/test-review-browser.mjs`、`scripts/test-review-role-browser.mjs`、`scripts/test-timer-browser.mjs`
- 文書：本書、`docs/DEPENDENCY_AUDIT_V1_88_1.md`、`docs/TEST_REVIEW_V1_88.md`

## 次工程

ローカル実装・検証完了後も、本番公開、Rules deploy、ロール初期登録、環境変数変更には別途承認が必要。実UIDの確認と管理者による割当、旧問題の公開確認、実問題5問の準備が未実施。依存のP1更新は別途互換性を確認して進める。今回はmain merge/push/deploy/本番Firestore操作を行わない。
