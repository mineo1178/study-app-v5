# v1.88.2：単一UID・PC管理の復習機能（v1.88.1からの設計変更）

現行方針は本書。v1.88/v1.88.1の保護者UID・reviewManagers登録手順は履歴資料として保持し、本方式の運用には使用しない。

## 境界と保存

子どもの既存Firebase Auth UIDだけを利用。保護者のFirebase Authユーザー追加、family memberUids変更、reviewManagers登録、既存履歴移行は不要。

アプリの通常利用から管理UI、管理ロールlistener、問題/弱点の保存APIを除去した。サンプルモードの編集は端末内の架空データだけ。0問では開始不可・準備中を表示、1〜4問は実数、5問以上は1回5問。3分の強制終了なし。

| 対象 | クライアント | PC上の信頼された管理者 |
| --- | --- | --- |
| questions（問題/正解/解説/公開） | 自分のpublished=trueだけ読取、全員書込拒否 | 対象UIDの登録・編集・非公開化 |
| weaknesses（保護者指定の弱点） | 自分だけ読取、全員書込拒否 | 対象UIDの登録・編集 |
| attempts / progress | 本人だけ読取・回答と進捗を対応させて保存 | 本ツールは読取/書込しない |
| reviewManagers | 全員読取/書込拒否。古いactive文書も権限を与えない | 本ツールは操作しない |
| family/Auth/学習/計算/成績/ゲーム | 既存仕様どおり | Auth/familyの確認読取のみ。他の履歴・ゲーム等は操作しない |

保存パスは既存families/{family}/reviewUsers/{uid}/{questions,weaknesses,attempts,progress}を維持。回答保存・再試行・固定回答ID・1問2write transactionは変更なし。学習時間/活動P/ファンへの自動付与なし。認証クライアントのUID固定・旧session無効化も変更なし。

Rulesは管理ロールによる例外許可を削除し、問題/弱点writeを無条件falseへ狭めた。本人回答/進捗、既存tasks/tests/計算/ゲーム等の認可は維持。Admin SDKはRulesを経由しないため、PCツールで同じ問題/弱点validator、所属、有効Auth、上限、重複、競合を検査する。

## PC管理の前提

Node.js 24以降。Firebase Admin SDKをアプリと分離したローカル環境に用意し、REVIEW_ADMIN_SDK_DIRにそのpackage.jsonとnode_modulesがあるディレクトリを設定する。アプリの依存/ブラウザーbundleへ追加しない。

保護者用のFirebase Auth UIDは不要だが、**Google IAM等の信頼された管理者認証は必要**。本番操作を承認された管理者のADCを使用する。例は管理者本人がPCで行うgcloud auth application-default login等。今回は実行しない。長期サービスアカウント鍵を新設・Git格納・チャット貼付しない。Firebase CLIのtokenをコードへコピーする方式は使わない。

管理者は必要なFirestore読取/作成/更新と対象Authのgetだけを許可するIAM構成を管理する。IAM資格は通常projectの広い権限を持ち得る。本ツールの対象チェックをIAMによる文書パス制限と同一視せず、管理資格/PCを子どもへ渡さない。Auth create/delete、family変更、Rules deploy、文書deleteはツールにない。

実UIDを含むtarget設定・実問題・plan/exportは、権限を制限した管理者フォルダ（リポジトリ外、またはignoredの*.localディレクトリ）へ置く。入力/出力がGit追跡範囲にあれば拒否する。出力の上書きも拒否。OS側のアクセス権・ディスク保護は管理者が設定する。秘密鍵はtarget設定へ入れない。

## 入力と準備

`target.json`はprojectId/familyId/uidの3キーだけ。uidは管理者が安全な画面で既存対象を確認して直接記入し、ログやGitへ転記しない。

新規問題は従来の四択配列をprepareへ渡せる。subject/unit/prompt/choices/correctIndex/explanation/testKind/source、任意published。既存parseQuestions/validateQuestionで形式検証し、ID/versionを発行してmanifestへ保存する。**prepareでは全て非公開にする**。以後は同じmanifestを使い、再実行でIDを発行し直さない。

manifest形式はschemaVersion=1、questions配列、weaknesses配列だけ。questionsはid/versionを含む既存Question型、publishedは明示boolean。weaknessesはid/subject/unit/mistake/point/testKind/questionIdsの既存Weakness型。問題と弱点を合計1〜50件ずつ扱う。問題200件/弱点100件の総上限、同一内容/ID重複、未知フィールド、不正な参照を拒否。sourceは空文字でもキーが必要。

初期5問ドラフトはローカルの前回資料を引き継ぎ、全文・正解・解説を保護者が承認するまで本番登録しない。実問題や根拠となる分析、成績、実UIDをこの手順書/リポジトリへ追加しない。

以下は構文例であり、今回は本番で実行していない。PRIVATE_DIR等は管理者だけのパスへ置換する。

```text
node scripts/review-admin.mjs prepare --input PRIVATE_DIR/questions.json --output PRIVATE_DIR/manifest.json
node scripts/review-admin.mjs plan --target PRIVATE_DIR/target.json --confirm-project PROJECT_ID --confirm-family FAMILY_ID --input PRIVATE_DIR/manifest.json --plan PRIVATE_DIR/plan-01.json
```

prepareはネットワーク接続なし。planは信頼されたAdmin SDKで対象Authの存在/有効性、family所属、問題/弱点を読み取り、変更予定と変更前データを含むplanを作る。まだ書かない。出力は作成/更新件数とdigestのみ。UID、メール、問題本文、tokenやSDKの生エラーはログに出さない。

管理者は安全なフォルダのtargetとplanを照合し、対象project/family/UID、questions/weaknessesのIDと新旧内容、公開状態を確認する。planのbeforeが変更前の問題/弱点バックアップで、対象UIDの回答や他データは含まない。

## 適用・編集・非公開化

本番の適用は毎回明示承認後だけ。ツールもapplyサブコマンド・project/family確認・承認したplan digestを必須とする。

```text
node scripts/review-admin.mjs apply --target PRIVATE_DIR/target.json --confirm-project PROJECT_ID --confirm-family FAMILY_ID --plan PRIVATE_DIR/plan-01.json --confirm-plan APPROVED_DIGEST
```

適用は新しいsnapshotをtransaction内で読み、target hash、memberUids、問題/弱点全体、manifest、変更前・変更後、digestを再構成する。plan後に問題/弱点/所属が変化した、別UID/別projectのplan、不正なplan、旧versionで内容変更があれば拒否。50件まで一つのAdmin transactionで原子的に保存し、部分反映しない。family/role/履歴への書込パスは作れない。

応答不明・再試行時は同じplanを無条件で再適用しない。export/再planで照合する。既に同じID/内容が保存済みなら新planのwriteは0件。新しいUUIDで再登録して重複させない。競合は承認し直した新planで再試行する。

```text
node scripts/review-admin.mjs export --target PRIVATE_DIR/target.json --confirm-project PROJECT_ID --confirm-family FAMILY_ID --output PRIVATE_DIR/export-01.json
```

exportは対象の問題/弱点だけを安全なファイルへ出力。編集したい既存IDを維持し、問題内容またはpublishedを変える際はversionを新しいUUIDへ変更する。最大50件のmanifestに絞って再planする。weaknessesの関連questionIdsは登録済み/同時登録の問題を参照する。削除ではなくpublished=falseで出題を止める。問題編集後の旧versionで未保存だった回答は拒否されるが、保存済みの回答snapshotは維持される。

beforeバックアップを復旧する場合も、当該IDだけについて現在状態をexportし、新しいversionを割り当てたmanifestでplan/承認/applyする。familyや全データを旧snapshotへ戻さない。新規登録問題は削除せず、必要なら非公開化。旧問題の誤変更を直しても既存回答履歴は書き換えない。

## リリース順序

本番の保護者Auth作成・所属追加・reviewManagers登録は行わない。既存子どもUIDとfamilyを維持する。

変更前Rules保全 → 本方式のRules先行適用/反映・旧v1.87互換確認 → 管理者PC資格/対象/初期問題承認 → ProductionのVITE_REVIEW_STORAGE_ENABLED=true → clean mainへのff-only/一度のpushによる一度のbuild → 承認済問題の管理者登録・公開 → 子どもの限定受入。実設定の確認と全本番変更への別途承認が前提。Vercel invalidTokenは再利用せず、ダッシュボードでProduction Branch/Git/環境変数/ビルド条件を確認する。

IAM管理ツールはフラグやRulesとは別経路で書けるため、ツールの本番applyも公開承認とは別に対象を確認する。保存無効時に保存成功は表示しない。環境変数変更はbuild時に反映され、既存deploymentは変化しない。

## 検証とCloud計画

ローカル: Unit（管理plan/validator/競合/対象分離）、Rules Emulator（全clientの管理write拒否、旧activeロール無効、本人回答/再試行/競合）、ブラウザー（管理UIなし、Admin SDKのprepare/plan/apply、50問、非公開除外、採点/復元/認証分離）、旧v1.87回帰を実施する。実行結果は専用ignored証跡へ保存し、旧証跡を上書きしない。

**変更後の実Cloud検証は今回未実施**。以前のV1_88_1_CLOUD_VALIDATEDは旧ロール方式の結果であり、新方式のPASSとはしない。次回は別途承認後、study-app-v5-cloud-test-2 / study-v5-cloud-test-2だけで次を検証する。

1. project/family/Spark、既存Auth、Rulesと全family文書を保全。UID/秘密は非公開。原本とhashを照合。
2. 既存の対象テストUIDを使い、Auth作成・所属変更・管理ロール作成はしない。別UID/未認証の拒否テストにも既存テストアカウントを利用。
3. 管理者ツールで新規/編集/非公開化、50件取込、重複、不正JSON、古いplan、同時編集、対象間違いの拒否を実Firestoreで確認。
4. 既知正常sourceの新Rulesを適用し、子どもを含む全クライアントの問題/正解/解説/公開/弱点/role書込拒否。本人公開問題読取・回答/進捗保存を確認。Auth時刻差があるならfixture補正を明記し、Rulesは緩めない。
5. 5問・採点・解説・再挑戦・reload・通信失敗/再試行・同じ回答ID/複数タブ・遅延応答のUID切替・DOM漏出0・SDK assertion0を確認。旧v1.87の既存パス互換も確認。
6. 読取/書込観測と全family前後比較。想定外変更0。テスト作成分だけを識別して後片付けし、既存文書・Auth・membershipを保持。Rulesを元に戻し、backup/証跡を保持。

不正write成功、対象外変更、保存/認証問題なら停止。実機Safari、本番実UIDの限定受入、新方式Cloudは公開前の残ゲート。本番・main merge/push/deployは今回行わない。

## 今回のローカル実行結果

- 実装Version v1.88.2、base b3cdd8fee7f8fe684b0b6039c00869618e16e3be。依存/lockfile変更なし。
- 全Unit319件PASS、Firestore Rules/Emulator101件PASS。
- 復習UI、単一UID/Adminツール、認証、通常学習、計算、アンコールのブラウザー6系統PASS。新Rules下の旧v1.87 App回帰もPASS。
- 管理ツールは実際のlocalhost Admin SDKでprepare/plan/apply、50問、版更新、古いplan/別UID planの拒否を検証。familyの内容とupdateTimeを保持。
- 単一UIDのDOM観測85回で漏出0、認証回帰16チェックで漏出/SDK assertion/未処理例外0。320px/390px PASS。
- TypeScript/Production build PASS。既存lint36エラー・2警告は残るが、新規違反0。変更Nodeスクリプトの追加lintも0。git diff --check PASS。
- 配信bundleに管理ロール依存/管理者ツールのコードが含まれないことを確認。
- 初回の計算E2Eはredo timer待機で失敗し、他検査から分離した同一テストの再実行でPASS。製品計算コードは変更なし。
- 復習E2Eの時刻巻戻しと、成績の楽観UIをサーバー保存完了と誤認するfixtureを修正。古い回答より新しい回答を優先する製品挙動やテストの期待値を緩めていない。失敗試行の証跡も保持。
- buildの既知chunk-size警告と、既存依存監査14件の評価は残る。依存変更/自動upgradeは実施していない。
- 新方式の実Cloud・実機Safari・本番実UID受入は未実施。公開は別途承認と残ゲート完了後。本番変更、main merge/push/deployは行っていない。

### Cloud最終監査でのCLI防御追加

Cloud Test 2検証では、CLIの対象確認文字列だけでは本番project指定を防げない不足を見つけたため、接続前の許可先検査を追加した。この検証版のexport/plan/applyは、明示したCloud Test 2とそのfamily、またはlocalhost Emulator用demo projectだけを許可する。本番study-app-v5・旧Cloud Test・誤familyは、dry-runも含めSDK初期化前に拒否する。prepareはローカルだけで実行できる。

したがって上記のPROJECT_ID構文例は**本番操作の許可を意味しない**。将来の本番登録を有効にする方式は、公開前に別途明示承認・対象制限の再レビューが必要。本番のUIDや秘密をコードへ埋め込む方式で解除しない。

WindowsでのCloud検証中にgRPC読取の90秒停止を検出したため、CLIのAdmin Firestore初期化をCloudではREST優先、localhost Emulatorでは従来のgRPCとした。変更後の検証結果・追加commitは今回専用Cloud監査資料へ記録する。旧方式のCloud PASSは流用しない。
