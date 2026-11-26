import { normalizeDiagnosticError, type DiagnosticCode } from "./device-test";

export class StudySaveError extends Error {
  readonly code: DiagnosticCode;
  readonly retained?: "retry" | "review";
  readonly operationId?: string;

  constructor(code: DiagnosticCode, retained?: "retry" | "review", operationId?: string) {
    super(code);
    this.code = code;
    this.retained = retained;
    this.operationId = operationId;
  }
}

export function studySaveMessage(error: unknown): string {
  const code = normalizeDiagnosticError(error);
  const message = (() => {
    switch (code) {
      case "unavailable":
      case "deadline-exceeded":
      case "auth/network-request-failed": return "通信が切れたよ。接続が戻ってからもう一度試してね。";
      case "unauthenticated":
      case "auth/user-token-expired": return "ログインを確認してね。";
      case "permission-denied": return "保存する権限を確認できなかったよ。保護者に知らせてね。";
      case "session-mismatch": return "別の計測に切り替わったよ。";
      case "not-found": return "課題や記録が見つからなかったよ。";
      case "resource-exhausted": return "今はサーバーに保存できないよ。少し待ってから試してね。";
      case "study-conflict":
      case "aborted":
      case "failed-precondition": return "記録が更新されたよ。最新の内容を確認してね。";
      case "local-storage-failed": return "この端末に記録を控えられなかったよ。画面を閉じず、保護者に知らせてね。";
      default: return "保存を確認できなかったよ。保護者に知らせてね。";
    }
  })();
  if (error instanceof StudySaveError && error.retained === "review") return `${message} 時間はこの端末の「確認が必要な学習記録」に残したよ。`;
  if (error instanceof StudySaveError && error.retained === "retry") return `${message} 未送信の時間はこの端末に残したよ。`;
  return message;
}
