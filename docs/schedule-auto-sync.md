# 家庭教師計画の自動同期

## 家庭教師が公開する

1. 本番から採用計画、課題、実績、手動予定、固定目標、確定期限を取得します。新しく登録された回と課題は次の計画作成に使います。
2. `02_candidates` に `learning-schedule/1` 形式の日別範囲を保存します。実taskIdと認証アカウントを照合し、`baseVersion` は現在の採用計画の `planId--r番号`、元計画の `planId` は前回と同じ系列、`revision` は前回より大きい整数にします。仮の学習枠、未配置時間、未確認事項は `provisional` と `gaps` に残します。
3. 検証が済んだJSONだけを公開します。取得日時は計画を作った時刻ではなく、根拠にした本番データの読取時刻です。

```powershell
node dist/schedule-sync/run.js publish $integrationRoot '02_candidates/<検証済み候補>.json' '<本番読取日時のISO 8601>' '第14回'
```

公開コマンドはルートの `SYNC_READY.json` を一時ファイルから置換します。SHA-256は候補JSONのファイル全体に対して計算します。`ready`、対象回、取得・作成日時、暫定設定を照合して処理します。公開済み候補の修正は新revisionにしてください。未登録課題は同じtaskIdと識別情報で登録されるまで保留します。実績変更・期限・手動予定で保留された課題は、新しい本番取得結果から再計画してください。

## Windowsの実行

CLIは `vite build --ssr scripts/schedule-sync/run.ts --outDir dist/schedule-sync` でビルドします。本番アプリと同じFirebase project、家族、利用者を `04_private/schedule-sync/config.json` で指定します。このフォルダはWindows利用者とSYSTEMがアクセスできるようにします。

```powershell
& scripts/schedule-sync/run-windows.ps1 -Mode connect -Config $config -Runner $runner
& scripts/schedule-sync/register-task.ps1 -CheckOnly -Config $config -Runner $runner
Start-ScheduledTask -TaskName 'Study Schedule Auto Sync'
```

初回接続はWindowsで既存アカウントを入力します。パスワードは保存せず、Firebaseの利用者セッションをWindows DPAPI CurrentUserで暗号化します。読み書きは同じ利用者のSecurity Rulesを通ります。接続が失効した場合は接続手順を再実行します。

読取確認に成功してから `-CheckOnly` を外して登録し、同じタスクを起動します。15分ごととログオン後に実行し、同時実行を抑止します。停止・ログオフ中の候補は次回ログオン時に照合します。タスクは登録時のCLIを使うため、ビルド配置を変える場合は登録も更新します。

## 照合と確認

- 既存の計画取込・transactionを使い、選択した変更だけを `tutor-sync-v1` の新しいrevisionに保存します。元の家庭教師revision、適用・保留の課題と根拠を保存します。
- 保存直前に採用ポインタ、関係課題、学習枠、同期状態を再照合します。競合のない追加課題は学習回ごと保持し、日付を割り当てていないものを差分に記録します。
- `04_private/schedule-sync/LAST_RUN.json` に直近の実行結果、`LATEST_DIFF.json` に新規学習回、課題の更新、未配置、登録待ち、保留理由を保存します。変更があった回の差分は `reports` にも残します。採用前後には計画と課題の照合結果を別ファイルに保存します。
- 同じ公開内容と本番状態で再実行すると、Firestore書込みは0件です。登録待ち課題が同じIDで登録された場合だけ、同じ候補の該当部分を再照合します。
- 予定と実績は従来のガントで確認します。自動同期は予定を取り込む処理で、家庭教師の学力分析は別に行います。
