# v1.88.1 依存監査（2026-10-27）

既存lockfileに対する`npm audit --json`を新規実行し、14 package findings（Critical 1 / High 9 / Moderate 3 / Low 1）を確認した。advisory件数とpackage件数は異なる。依存・lockfile・バージョン指定は変更していない。自動upgradeは実施しない。

`npm ls ... --all --json`で経路を確認し、実際のProduction buildの`generateBundle`から全chunkのmodule IDを取得した。対象14 packageはいずれも配信JSのmodule集合に含まれなかった。これは本アプリの静的SPA構成の到達性評価であり、インストール済み依存全体が安全という主張ではない。Nodeサーバー、SSR、RTDB、非信頼ソースの変換処理等を後から追加する場合は再評価する。未修正の開発ツールを外部公開しない。

全14件についてnpmは`fixAvailable=true`を報告。下表の範囲は取得したadvisoryの影響範囲であり、実際の更新候補は全advisoryを同時解消することと互換性を確認して選ぶ。

| Package / 現行版 | 最大重大度 | 依存経路 | 影響・現構成の到達性 / 優先度 | 修正版・影響範囲 |
| --- | --- | --- | --- | --- |
| websocket-driver 0.7.4 | Critical | firebase → @firebase/database → faye-websocket | 古いWebSocket frameの長さによる破損。RTDB未使用、Node driverは配信JSに含まれない。将来のNode/RTDB利用前に優先修正、現SPA公開の直接blockerとは判断しない / P1 | vendor修正版0.7.5以上 |
| @grpc/grpc-js 1.9.15 | High | firebase → @firebase/firestore | サーバー認証証明書判定/不正message DoS等。ブラウザーはwebchannelで、gRPCサーバーもSSRもなし。NodeのEmulatorテストはlocalhost demoのみ / P1 | 影響<=1.13.5、認証問題の修正1.13.6（1.14系は1.14.5） |
| protobufjs 7.5.6 | High | firebase → @firebase/firestore → @grpc/proto-loader | Any展開/descriptor/option処理等のDoS。配信JSに含まれず、アプリで任意proto/schemaの入力なし / P1 | audit影響<=7.6.4、修正あり |
| vite 8.0.10 | High | 直接devDependency | Windows path/fs.deny迂回、editor呼出し等。開発サーバーの問題で静的distには含まれない。ローカルサーバーも不特定接続へ公開しない / P1 | audit影響8.0.0〜8.1.5、修正あり |
| @babel/core 7.29.0 | Low | eslint-plugin-react-hooks → @babel/core | sourceMappingURLによるファイル読取。信頼されたリポジトリのlint/変換のみ、問題JSONをコード変換しない / P2 | 影響<=7.29.0、修正あり |
| @vitest/mocker 5.0.0 | Moderate | vitest → @vitest/mocker | mock登録・path迂回。ローカルテストのみ。テストサーバーを公開しない / P1 | 5.0.3で修正 |
| vitest 5.0.0 | Moderate | 直接devDependency | 上記mocker経由、同じ原因の伝播finding。production配信なし / P1 | 5.0.3以上の修正版を検討 |
| baseline-browser-mapping 2.10.24 | Moderate | eslint-plugin-react-hooks → @babel/core → helper-compilation-targets → browserslist | 不正inputでprocess停止。ビルド/lint専用、子どもの入力から到達なし / P2 | 影響>=2.0.0 <2.11.0、修正あり |
| brace-expansion 5.0.5 | High | eslint → minimatch | 再帰/展開量によるDoS。lint globは開発者管理、復習JSONから呼ばない / P2 | audit影響3.0.0〜5.0.11、修正あり |
| browserslist 4.28.2 | High | eslint-plugin-react-hooks → @babel/core → helper-compilation-targets | query蓄積等のDoS。開発設定を利用、任意ユーザーqueryを受けない / P2 | 影響<=4.28.6、修正あり |
| nanoid 3.3.11 | High | vite → postcss | サイズ指定等の問題。配信JSに含まれずアプリのIDはcrypto.randomUUID / P2 | 影響<=3.3.17、修正あり |
| postcss 8.5.12 | High | vite → postcss | source map path読取。不特定CSSを変換するサービスはなく、既存CSSのbuildのみ / P1 | 影響<=8.5.22、修正あり |
| source-map-js 1.2.1 | High | vite → postcss、@tailwindcss/vite → @tailwindcss/node | 不正indexed source mapのDoS。ユーザーからsource mapを受けずbuildのみ / P2 | 1.2.2で修正 |
| zod 4.3.6 | High | eslint-plugin-react-hooks → zod / zod-validation-error | 大きなcollection検査でメモリ消費。復習の入力検証には使っておらず、配信JSに含まれない / P2 | 4.6.6で修正 |

本番静的SPAに重大かつ到達可能な経路は今回の解析では検出していないため、この14件だけを理由にロール実装のローカル完了を止めない。ただし、開発/CIで非信頼ソースを扱う場合やdevserverを共有する場合は別リスクとなる。上記P1を先に、互換性を確認した更新作業を別途行う。CI・ホスティングの実設定は本作業でクラウド監査していない。

一次資料：

- [websocket-driver vendor advisory（Critical、0.7.5修正）](https://github.com/faye/websocket-driver-node/security/advisories/GHSA-xv26-6w52-cph6)
- [protobufjs vendor advisory（AnyのJSON展開の条件）](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-wcpc-wj8m-hjx6)
- [grpc vendor advisory（getAuthContextのサーバー設定条件）](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)
- その他の影響範囲・修正有無は、実行時のnpm advisory feedを根拠に整理した。生の監査JSON・依存ツリー・module集合の結果はignoredローカル証跡として保持し、秘密情報や実UIDをcommitしない。
